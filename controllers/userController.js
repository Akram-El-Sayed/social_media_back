//  Req Model
const User = require("../models/User");
const Follow = require("../models/Follow");
const Notification = require("../models/Notification");
const mongoose = require("mongoose");
//req validation
const userValidation = require("../Validations/userValidation");
//req cloudinary
const cloudinary = require("../config/cloudinary");
//req cloudinary uploader
const uploadToCloudinary = require("../utils/cloudinaryUpload");
const { parseCursor } = require("../utils/CursorSafety");
const SAFE_USER_SELECT = require("../utils/safeUserSelect");

// User Controller
//GET PROFILE
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select(SAFE_USER_SELECT);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
//UPDATE PROFILE
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { error, value } = userValidation.updateProfileValidation.validate(
      req.body,
      { abortEarly: false, stripUnknown: true }, // stripUnknown to drop any extra fields
    );

    if (error) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.details.map((err) => err.message),
      });
    }

    if (value.bio !== undefined) {
      user.bio = value.bio;  
    }

    if (req.file) {
      if (user.profilePicturePublicId) {
        await cloudinary.uploader.destroy(user.profilePicturePublicId);
      }

      const result = await uploadToCloudinary(req.file.buffer, "profile_pictures");
      user.profilePicture = result.secure_url;
      user.profilePicturePublicId = result.public_id;
    }

    await user.save(); 

    const safeUser = await User.findById(userId).select(SAFE_USER_SELECT);

    res.status(200).json({ message: "Profile updated successfully", user: safeUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { cursor, limit = 20, search = "" } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 50);

    const query = {
      _id: { $ne: currentUserId }, // exclude yourself
    };

    // Search by username or full name if query provided
    if (search.trim()) {
      query.$or = [
        { username: { $regex: search.trim(), $options: "i" } },
        { fullName: { $regex: search.trim(), $options: "i" } },
      ];
    }

    // Cursor only applies when not searching
    if (cursor && !search.trim()) {
      query._id = {
        $lt: new mongoose.Types.ObjectId(cursor),
        $ne: currentUserId,
      };
    } else {
      query._id = { $ne: currentUserId };
    }

    const users = await User.find(query)
      .select("username fullName profilePicture bio")
      .sort(search.trim() ? { username: 1 } : { _id: -1 })
      .limit(search.trim() ? parsedLimit : parsedLimit + 1);

    // Get follow relationships for the returned users in one query
    const userIds = users.map((u) => u._id);

    const [followingList, followersList] = await Promise.all([
      Follow.find({
        follower: currentUserId,
        following: { $in: userIds },
      }).select("following -_id"),
      Follow.find({
        follower: { $in: userIds },
        following: currentUserId,
      }).select("follower -_id"),
    ]);

    const followingSet = new Set(
      followingList.map((f) => f.following.toString()),
    );
    const followersSet = new Set(
      followersList.map((f) => f.follower.toString()),
    );

    // Pagination only for non-search browsing
    const hasNextPage = !search.trim() && users.length > parsedLimit;
    const results = hasNextPage ? users.slice(0, -1) : users;
    const nextCursor = hasNextPage ? results[results.length - 1]._id : null;

    const formattedUsers = results.map((user) => ({
      ...user.toObject(),
      isFollowedByMe: followingSet.has(user._id.toString()),
      isFollowingMe: followersSet.has(user._id.toString()),
    }));

    res.status(200).json({
      count: formattedUsers.length,
      users: formattedUsers,
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

// User Interaction
//FOLLOW USER

exports.followUser = async (req, res) => {
  try {
    const follower = req.user._id;
    const following = req.params.id;

    if (follower.toString() === following) {
      return res.status(400).json({
        message: "You cannot follow yourself",
      });
    }

    const targetUser = await User.findById(following);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create follow relationship
    const follow = await Follow.create({
      follower,
      following,
    });

    // Increment counts
    const updatedTargetUser = await User.findByIdAndUpdate(
      following,
      {
        $inc: {
          followersCount: 1,
          unreadNotificationsCount: 1,
        },
      },
      { returnDocument: "after" },
    );

    const updatedFollowerUser = await User.findByIdAndUpdate(
      follower,
      { $inc: { followingCount: 1 } },
      { returnDocument: "after" },
    );

    // Create notification
    const notification = await Notification.create({
      sender: follower,
      recipient: following,
      type: "follow",
    });

    await notification.populate("sender", "username profilePicture");

    const io = req.app.get("io");

    // new notification 
    io.to(following.toString()).emit("notification:new", notification);

    // Emit live badge counter update
    io.to(following.toString()).emit("notification_badge_updated", {
      unreadCount: updatedTargetUser.unreadNotificationsCount,
    });

    // Emit updated followers count to target user
    io.to(following.toString()).emit("followers_count_updated", {
      userId: following.toString(),
      followersCount: updatedTargetUser.followersCount,
    });

    io.to(follower.toString()).emit("follow_state_updated", {
      userId: following.toString(),
      isFollowedByMe: true,
    });

    return res.status(201).json({
      message: "User followed successfully",
      follow,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: "You already follow this user",
      });
    }

    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

//UNFOLLOW USER
exports.unfollowUser = async (req, res) => {
  try {
    const follower = req.user._id;
    const following = req.params.id;

    const targetUser = await User.findById(following);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const deleted = await Follow.findOneAndDelete({
      follower,
      following,
    });

    if (!deleted) {
      return res.status(400).json({
        message: "You are not following this user",
      });
    }

    // DECREMENT COUNTS (SAFE)
    const updatedTargetUser = await User.findByIdAndUpdate(
      following,
      { $inc: { followersCount: -1 } },
      { returnDocument: "after" },
    );

    const updatedFollowerUser = await User.findByIdAndUpdate(
      follower,
      { $inc: { followingCount: -1 } },
      { returnDocument: "after" },
    );

    const io = req.app.get("io");


    // Emit updated following count
    io.to(following.toString()).emit("followers_count_updated", {
      userId: following.toString(),
      followersCount: updatedTargetUser.followersCount,
    });

    io.to(follower.toString()).emit("follow_state_updated", {
      userId: following.toString(),
      isFollowedByMe: false,
    });

    res.status(200).json({
      message: "User unfollowed successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
//GET ALL FOLLOWERS
exports.getFollowers = async (req, res) => {
  try {
    const profileUserId = req.params.id;
    const currentUserId = req.user?._id;
    const { cursor, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 100);

    const query = { following: profileUserId };
    const cursorId = parseCursor(cursor);
    if (cursorId) query._id = { $lt: cursorId };

    const followers = await Follow.find(query)
      .sort({ _id: -1 })
      .limit(parsedLimit + 1)
      .populate("follower", "username profilePicture bio");

    const hasNextPage = followers.length > parsedLimit;
    const results = hasNextPage ? followers.slice(0, -1) : followers;
    const nextCursor = hasNextPage ? results[results.length - 1]._id : null;

    let followingSet = new Set();
    if (currentUserId && results.length > 0) {
      const ids = results.map((f) => f.follower._id);
      const myFollows = await Follow.find({
        follower: currentUserId,
        following: { $in: ids },
      }).select("following");

      followingSet = new Set(myFollows.map((f) => f.following.toString()));
    }

    res.status(200).json({
      count: results.length,
      followers: results.map((f) => ({
        ...f.follower.toObject(),
        isFollowing: followingSet.has(f.follower._id.toString()),
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

exports.getFollowing = async (req, res) => {
  try {
    const userId = req.params.id;
    const { cursor, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 100);

    const query = { follower: userId };
    const cursorId = parseCursor(cursor);
    if (cursorId) query._id = { $lt: cursorId };

    const following = await Follow.find(query)
      .sort({ _id: -1 })
      .limit(parsedLimit + 1)
      .populate("following", "username profilePicture bio");

    const hasNextPage = following.length > parsedLimit;
    const results = hasNextPage ? following.slice(0, -1) : following;
    const nextCursor = hasNextPage ? results[results.length - 1]._id : null;

    res.status(200).json({
      count: results.length,
      following: results.map((f) => f.following),
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
