//Req Model
const Like = require("../models/Like");
const Post = require("../models/Post");
const Follow = require("../models/Follow");
const User = require("../models/User");
const ReelView = require("../models/ReelView");
const Notification = require("../models/Notification");
const FeedView = require("../models/FeedView");
// Req Validator
const PostValidation = require("../Validations/postValidations");
//Req mongoose
const mongoose = require("mongoose");
//Req Cloudinary
const cloudinary = require("../config/cloudinary");
const uploadToCloudinary = require("../utils/cloudinaryUpload");
const SAFE_USER_SELECT = require("../utils/safeUserSelect");
const { parseCursor } = require("../utils/CursorSafety");

//CREATE POST
exports.createPost = async (req, res) => {
  try {
    if (req.body.hashtags) {
      if (typeof req.body.hashtags === "string") {
        req.body.hashtags = req.body.hashtags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
    } else {
      req.body.hashtags = [];
    }

    const { error, value } = PostValidation.createPostValidation.validate(
      req.body,
      {
        abortEarly: false,
      },
    );

    if (error) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.details.map((err) => err.message),
      });
    }
    const { content, privacy, hashtags } = value;
    if (!content && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: "Post must contain text or media" });
    }

    const normalizedHashtags = hashtags.map((tag) =>
      tag.replace(/^#/, "").toLowerCase().trim(),
    );

    const mediaArray = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const isVideo = file.mimetype.startsWith("video");

        // Use the buffer to check orientation/duration if needed,
        // but here we rely on Cloudinary's response
        const result = await uploadToCloudinary(
          file.buffer,
          "posts",
          isVideo ? "video" : "image",
        );

        let orientation = "landscape";
        if (result.height > result.width) orientation = "portrait";
        else if (result.height === result.width) orientation = "square";

        let thumbnail = null;
        if (isVideo) {
          thumbnail = cloudinary.url(result.public_id, {
            resource_type: "video",
            format: "jpg",
            width: 500,
            crop: "scale",
          });
        }

        mediaArray.push({
          url: result.secure_url,
          publicId: result.public_id,
          type: isVideo ? "video" : "image",
          width: result.width,
          height: result.height,
          duration: result.duration || null,
          thumbnail,
          orientation,
        });
      }
    }

    // If it's ONE video, it's portrait, and under 60s -> It's a Reel
    let postType = "post";
    if (
      mediaArray.length === 1 &&
      mediaArray[0].type === "video" &&
      mediaArray[0].orientation === "portrait" &&
      mediaArray[0].duration <= 60
    ) {
      postType = "reel";
    }

    const post = await Post.create({
      user: req.user._id,
      content,
      privacy: privacy || "public",
      media: mediaArray,
      postType,
      hashtags: normalizedHashtags,
    });

    res.status(201).json(post);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// UPDATE POST
exports.updatePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.user.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Unauthorized" });

    const { error, value } = PostValidation.updatePostValidation.validate(
      req.body,
      {
        abortEarly: false,
      },
    );

    if (error) {
      return res.status(400).json({
        message: error.details.map((err) => err.message),
      });
    }

    const { content, privacy, hashtags } = value || {};

    if (content !== undefined) post.content = content;
    if (privacy !== undefined) post.privacy = privacy;
    if (hashtags !== undefined) {
      post.hashtags = hashtags.map((tag) =>
        tag.replace(/^#/, "").toLowerCase().trim(),
      );
    }

    // If new files are uploaded, replace the old ones
    if (req.files && req.files.length > 0) {
      // Delete old media from Cloudinary
      if (post.media && post.media.length > 0) {
        const deletePromises = post.media.map((m) =>
          cloudinary.uploader.destroy(m.publicId, {
            resource_type: m.type === "video" ? "video" : "image",
          }),
        );
        await Promise.all(deletePromises);
      }

      // Upload new media
      const mediaArray = [];
      for (const file of req.files) {
        const isVideo = file.mimetype.startsWith("video");
        const result = await uploadToCloudinary(
          file.buffer,
          "posts",
          isVideo ? "video" : "image",
        );

        let thumbnail = null;
        if (isVideo) {
          thumbnail = cloudinary.url(result.public_id, {
            resource_type: "video",
            format: "jpg",
            width: 500,
            crop: "scale",
          });
        }

        let orientation = "landscape";
        if (result.height > result.width) orientation = "portrait";
        else if (result.height === result.width) orientation = "square";

        mediaArray.push({
          url: result.secure_url,
          publicId: result.public_id,
          type: isVideo ? "video" : "image",
          width: result.width,
          height: result.height,
          duration: result.duration || null,
          orientation,
          thumbnail,
        });
      }

      post.media = mediaArray;

      // Recalculate Post Type (for Reels)
      let newPostType = "post";
      if (
        mediaArray.length === 1 &&
        mediaArray[0].type === "video" &&
        mediaArray[0].orientation === "portrait" &&
        mediaArray[0].duration <= 60
      ) {
        newPostType = "reel";
      }
      post.postType = newPostType;
    }

    await post.save();

    res.status(200).json({
      message: "Post updated successfully",
      post,
    });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// DELETE POST
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.user.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Unauthorized" });

    // Delete ALL media associated with this post from Cloudinary
    if (post.media && post.media.length > 0) {
      const deletePromises = post.media.map((item) =>
        cloudinary.uploader.destroy(item.publicId, {
          resource_type: item.type === "video" ? "video" : "image",
        }),
      );
      await Promise.all(deletePromises);
    }

    await post.deleteOne();
    res.status(200).json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
//GET ALL USER POSTS
exports.getUserWithPosts = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const userId = req.params.id;
    const { cursor, limit = 10 } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 50);

    const user = await User.findById(userId).select(SAFE_USER_SELECT);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if currentUser follows this profile owner
    const isFollowing = await Follow.exists({
      follower: currentUserId,
      following: userId,
    });

    const isOwnProfile = currentUserId.toString() === userId.toString();

    let allowedPrivacy;
    if (isOwnProfile) {
      allowedPrivacy = ["public", "friends-only", "private"];
    } else if (isFollowing) {
      allowedPrivacy = ["public", "friends-only"];
    } else {
      allowedPrivacy = ["public"];
    }

    const query = {
      user: userId,
      privacy: { $in: allowedPrivacy },
    };

    const cursorId = parseCursor(cursor);
    if (cursorId) query._id = { $lt: cursorId };

    const posts = await Post.find(query)
      .sort({ _id: -1 })
      .limit(parsedLimit + 1);

    const hasNextPage = posts.length > parsedLimit;
    const results = hasNextPage ? posts.slice(0, -1) : posts;

    const postIds = results.map((p) => p._id);
    const myLikes = await Like.find({
      user: currentUserId,
      post: { $in: postIds },
    }).select("post");
    const likedPostIds = new Set(myLikes.map((l) => l.post.toString()));
    const nextCursor = hasNextPage ? results[results.length - 1]._id : null;

    res.status(200).json({
      user,
      isFollowing: !!isFollowing,
      isOwnProfile,
      posts: results.map((p) => ({
        ...p.toObject(),
        isLikedByMe: likedPostIds.has(p._id.toString()),
      })),
      pagination: { nextCursor, hasNextPage },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
//GET ALL MY POSTS
exports.getPosts = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const cursor = req.query.cursor;

    // Get IDs of users I follow
    const following = await Follow.find({ follower: currentUserId }).select(
      "following -_id",
    );
    const followingIds = following.map((f) => f.following);

    const query = {
      $or: [
        { user: currentUserId },
        {
          user: { $in: followingIds },
          privacy: { $in: ["public", "friends-only"] },
        },
        {
          user: { $nin: [...followingIds, currentUserId] },
          privacy: "public",
        },
      ],
    };

    if (req.query.type === "reel") {
      query.postType = "reel";
    }

    const cursorId = parseCursor(cursor);
    if (cursorId) {
      query._id = { $lt: cursorId };
    }

    const posts = await Post.find(query)
      .populate("user", "username profilePicture")
      .sort({ _id: -1 })
      .limit(limit + 1);

    const hasNextPage = posts.length > limit;
    const results = hasNextPage ? posts.slice(0, -1) : posts;

    // isLikedByMe
    const postIds = results.map((p) => p._id);
    const myLikes = await Like.find({
      user: currentUserId,
      post: { $in: postIds },
    }).select("post");
    const likedPostIds = new Set(myLikes.map((l) => l.post.toString()));

    // Build a Set of followingIds as strings for O(1) lookup
    const followingSet = new Set(followingIds.map((id) => id.toString()));

    res.json({
      posts: results.map((post) => ({
        ...post.toObject(),
        isLikedByMe: likedPostIds.has(post._id.toString()),
        // lets the frontend show a "Follow" button on discovery posts
        isFollowing: followingSet.has(post.user._id.toString()),
      })),
      nextCursor: hasNextPage
        ? results[results.length - 1]._id.toString()
        : null,
      hasNextPage,
    });
  } catch (error) {
    console.error("getPosts Feed Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
//GET SINGE POST
exports.getPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = req.user?._id;

    const post = await Post.findById(postId).populate(
      "user",
      "username profilePicture",
    );

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    let isLikedByMe = false;
    let isFollowing = false;

    if (currentUserId) {
      // Check like
      const liked = await mongoose.model("Like").findOne({
        user: currentUserId,
        post: post._id,
      });
      isLikedByMe = !!liked;

      // Check follow 
      const follow = await mongoose.model("Follow").findOne({
        follower: currentUserId,
        following: post.user._id,
      });
      isFollowing = !!follow;
    }

    res.status(200).json({
      ...post.toObject(),
      isLikedByMe,
      isFollowing,
    });
  } catch (error) {
    console.error("getPost error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

//LIKE POST
exports.likePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const existingLike = await Like.findOne({ user: userId, post: postId });
    const io = req.app.get("io");

    // UNLIKE LOGIC
    if (existingLike) {
      await existingLike.deleteOne();

      post.likesCount = Math.max(0, post.likesCount - 1);
      await post.save();

      // Remove notification silently
      await Notification.findOneAndDelete({
        recipient: post.user,
        sender: userId,
        post: postId,
        type: "like",
      });

      const postIdStr = postId.toString();

      io.to(`post:${postIdStr}`).emit("post:like_update", {
        postId: postIdStr,
        likesCount: post.likesCount,
      });

      io.to("feed").emit("feed:post_updated", {
        postId: postIdStr,
        likesCount: post.likesCount,
        type: "unlike",
      });

      return res.status(200).json({
        message: "Post unliked",
        likesCount: post.likesCount,
      });
    }

    // LIKE LOGIC
    await Like.create({ user: userId, post: postId });

    post.likesCount += 1;
    await post.save();

    // Only notify if not own post
    if (post.user.toString() !== userId.toString()) {
      const notification = await Notification.create({
        recipient: post.user,
        sender: userId,
        type: "like",
        post: postId,
      });

      await User.findByIdAndUpdate(post.user, {
        $inc: { unreadNotificationsCount: 1 },
      });

      const populated = await notification.populate(
        "sender",
        "username profilePicture",
      );

      io.to(post.user.toString()).emit("notification:new", populated);

      const updatedUser = await User.findById(post.user);
      io.to(post.user.toString()).emit("notification_badge_updated", {
        unreadCount: updatedUser.unreadNotificationsCount,
      });
    }

    const postIdStr = postId.toString();

    io.to(`post:${postIdStr}`).emit("post:like_update", {
      postId: postIdStr,
      likesCount: post.likesCount,
    });

    io.to("feed").emit("feed:post_updated", {
      postId: postIdStr,
      likesCount: post.likesCount,
      type: "like",
    });

    return res.status(200).json({
      message: "Post liked",
      likesCount: post.likesCount,
    });
  } catch (error) {
    console.error("likePost error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

//GET ALL POST LIKES
exports.getPostLikes = async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = req.user._id;
    const { cursor, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 50);

    const query = { post: postId };
    const cursorId = parseCursor(cursor);
    if (cursorId) query._id = { $lt: cursorId };

    const likes = await Like.find(query)
      .populate("user", "username profilePicture")
      .sort({ _id: -1 })
      .limit(parsedLimit + 1);

    const hasNextPage = likes.length > parsedLimit;
    const results = hasNextPage ? likes.slice(0, -1) : likes;
    const nextCursor = hasNextPage ? results[results.length - 1]._id : null;

    // Check which of these users the current user follows
    const userIds = results.map((l) => l.user._id);
    const followingList = await Follow.find({
      follower: currentUserId,
      following: { $in: userIds },
    }).select("following -_id");

    const followingSet = new Set(
      followingList.map((f) => f.following.toString()),
    );

    res.status(200).json({
      count: results.length,
      likes: results.map((l) => ({
        ...l.user.toObject(),
        isFollowedByMe: followingSet.has(l.user._id.toString()),
      })),
      pagination: {
        nextCursor,
        hasNextPage,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.addReelView = async (req, res) => {
  try {
    const userId = req.user._id;
    const postId = req.params.id;

    const post = await Post.findById(postId);

    if (!post || post.postType !== "reel") {
      return res.status(404).json({ message: "Reel not found" });
    }

    try {
      await ReelView.create({
        user: userId,
        post: postId,
      });

      await Post.findByIdAndUpdate(postId, {
        $inc: { viewsCount: 1 },
      });

      return res.status(200).json({ message: "View counted" });
    } catch (err) {
      // duplicate key error = already viewed
      if (err.code === 11000) {
        return res.status(200).json({ message: "Already viewed" });
      }

      throw err;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getReels = async (req, res) => {
  try {
    const currentUserId = req.user?._id;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const cursor = req.query.cursor;

    const query = { postType: "reel", privacy: "public" };
    const cursorId = parseCursor(cursor);
    if (cursorId) query._id = { $lt: cursorId };

    const reels = await Post.find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate("user", "username profilePicture");

    const hasMore = reels.length > limit;
    const results = hasMore ? reels.slice(0, -1) : reels;

    let followingSet = new Set();

    if (currentUserId && results.length > 0) {
      const ownerIds = results.map((reel) => reel.user._id);
      const follows = await Follow.find({
        follower: currentUserId,
        following: { $in: ownerIds },
      }).select("following");

      followingSet = new Set(follows.map((f) => f.following.toString()));
    }

    res.json({
      reels: results.map((reel) => ({
        ...reel.toObject(),
        isFollowing: followingSet.has(reel.user._id.toString()),
      })),
      nextCursor: hasMore ? results[results.length - 1]._id : null,
      hasMore,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ADD FEED VIEW
exports.addFeedView = async (req, res) => {
  try {
    const userId = req.user._id;
    const postId = req.params.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    try {
      await FeedView.create({
        user: userId,
        post: postId,
      });

      await Post.findByIdAndUpdate(postId, {
        $inc: { impressionsCount: 1 },
      });

      return res.status(200).json({ message: "Feed view counted" });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(200).json({ message: "Already viewed recently" });
      }
      throw err;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// SEARCH POSTS BY HASHTAG (cursor paginated, sorted by likesCount)
exports.getPostsByHashtag = async (req, res) => {
  try {
    const currentUserId = req.user?._id;
    const tag = req.params.tag.replace(/^#/, "").toLowerCase().trim();

    if (!tag) {
      return res.status(400).json({ message: "Hashtag is required" });
    }

    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const query = { hashtags: tag, privacy: "public" };

    if (req.query.cursor) {
      const separatorIdx = req.query.cursor.lastIndexOf("_");
      const cursorDate = req.query.cursor.slice(0, separatorIdx);
      const cursorId = req.query.cursor.slice(separatorIdx + 1);

      if (cursorDate && mongoose.Types.ObjectId.isValid(cursorId)) {
        query.$or = [
          { createdAt: { $lt: new Date(cursorDate) } },
          {
            createdAt: new Date(cursorDate),
            _id: { $lt: new mongoose.Types.ObjectId(cursorId) },
          },
        ];
      }
    }

    const following = await Follow.find({ follower: currentUserId }).select("following -_id");
    const followingIds = following.map((f) => f.following);

    const posts = await Post.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate("user", "username profilePicture");

    const hasMore = posts.length > limit;
    const results = hasMore ? posts.slice(0, -1) : posts;

    const postIds = results.map((p) => p._id);

    const myLikes = await Like.find({
      user: currentUserId,
      post: { $in: postIds },
    }).select("post");

    const likedSet = new Set(myLikes.map((l) => l.post.toString()));
    const followingSet = new Set(followingIds.map((id) => id.toString()));

    const last = results[results.length - 1];
    const nextCursor = hasMore && last
      ? `${last.createdAt.toISOString()}_${last._id}`
      : null;

    return res.json({
      tag,
      posts: results.map((post) => ({
        ...post.toObject(),
        isLikedByMe: likedSet.has(post._id.toString()),
        isFollowing: followingSet.has(post.user._id.toString()),
      })),
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("getPostsByHashtag error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
