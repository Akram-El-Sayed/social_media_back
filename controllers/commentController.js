const Comment = require("../models/Comment");
const CommentLike = require("../models/CommentLike");
const Post = require("../models/Post");
const Notification = require("../models/Notification");
const User = require("../models/User");
const commentValidation = require("../Validations/commmentValidation");
const { parseCursor } = require("../utils/CursorSafety");

// ADD A TOP-LEVEL COMMENT
exports.addComment = async (req, res) => {
  try {
    const { error, value } = commentValidation.TextValidation.validate(
      req.body,
      { abortEarly: false },
    );
    if (error) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.details.map((err) => err.message),
      });
    }

    const { text } = value;
    const postId = req.params.id;
    const userId = req.user._id;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = await Comment.create({ user: userId, post: postId, text });

    post.commentsCount = (post.commentsCount || 0) + 1;
    await post.save();

    const io = req.app.get("io");

    try {
      if (post.user.toString() !== userId.toString()) {
        const notification = await Notification.create({
          recipient: post.user,
          sender: userId,
          type: "comment",
          post: postId,
        });
        const populatedNotif = await notification.populate(
          "sender",
          "username profilePicture",
        );
        const updatedUser = await User.findByIdAndUpdate(
          post.user,
          { $inc: { unreadNotificationsCount: 1 } },
          { new: true },
        ).select("unreadNotificationsCount");
        
        if (io)
          io.to(post.user.toString()).emit("notification:new", populatedNotif);
        io.to(post.user.toString()).emit("notification_badge_updated", {
          unreadCount: updatedUser.unreadNotificationsCount,
        });
      }

      const populatedComment = await comment.populate(
        "user",
        "username profilePicture",
      );
      const postIdStr = postId.toString();
      if (io)
        io.to(`post:${postIdStr}`).emit("comment:created", {
          postId: postIdStr,
          comment: populatedComment,
        });
      return res.status(201).json(populatedComment);
    } catch (innerError) {
      console.error("Socket/Notif Error:", innerError);
      const finalComment = await comment.populate(
        "user",
        "username profilePicture",
      );
      return res.status(201).json(finalComment);
    }
  } catch (error) {
    console.error("Add Comment Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// REPLY TO A COMMENT
exports.replyComment = async (req, res) => {
  try {
    const { error, value } = commentValidation.TextValidation.validate(
      req.body,
      { abortEarly: false },
    );
    if (error) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.details.map((err) => err.message),
      });
    }

    const { text } = value;
    const parentCommentId = req.params.id;
    const userId = req.user._id;

    const parent = await Comment.findById(parentCommentId);
    if (!parent)
      return res.status(404).json({ message: "Original comment not found" });
    if (!parent.post)
      return res
        .status(400)
        .json({ message: "Parent comment is missing a post reference" });

    const reply = await Comment.create({
      user: userId,
      post: parent.post,
      text,
      parentComment: parentCommentId,
    });

    await Post.findByIdAndUpdate(parent.post, { $inc: { commentsCount: 1 } });

    const io = req.app.get("io");

    try {
      const populatedReply = await reply.populate(
        "user",
        "username profilePicture",
      );

      if (parent.user.toString() !== userId.toString()) {
        const notification = await Notification.create({
          recipient: parent.user,
          sender: userId,
          type: "comment_reply",
          post: parent.post,
          comment: reply._id,
        });
        const populatedNotif = await notification.populate(
          "sender",
          "username profilePicture",
        );
        const updatedUser = await User.findByIdAndUpdate(
          parent.user,
          { $inc: { unreadNotificationsCount: 1 } },
          { new: true },
        ).select("unreadNotificationsCount");

        if (io)
          io.to(parent.user.toString()).emit(
            "notification:new",
            populatedNotif,
          );
        io.to(parent.user.toString()).emit("notification_badge_updated", {
          unreadCount: updatedUser.unreadNotificationsCount,
        });
      }

      const postIdStr = parent.post.toString();
      if (io)
        io.to(`post:${postIdStr}`).emit("comment:created", {
          postId: postIdStr,
          comment: populatedReply,
        });
      return res.status(201).json(populatedReply);
    } catch (notifError) {
      console.error("Non-critical Notification Error:", notifError);
      const finalReply = await reply.populate(
        "user",
        "username profilePicture",
      );
      return res.status(201).json(finalReply);
    }
  } catch (error) {
    console.error("Reply Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


// GET COMMENTS (cursor paginated, with replies + likes)
exports.getComments = async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = req.user._id;
    const { cursor, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 20, 50);

    // Fetch only top-level comments (no parentComment)
    const query = { post: postId, parentComment: null };
    const cursorId = parseCursor(cursor);
    if (cursorId) query._id = { $gt: cursorId }; // oldest-first so $gt, not $lt

    const comments = await Comment.find(query)
      .sort({ _id: 1 }) // oldest first
      .limit(parsedLimit + 1)
      .populate("user", "username profilePicture");

    const hasNextPage = comments.length > parsedLimit;
    const topLevelResults = hasNextPage ? comments.slice(0, -1) : comments;
    const nextCursor = hasNextPage
      ? topLevelResults[topLevelResults.length - 1]._id
      : null;

    const topLevelIds = topLevelResults.map((c) => c._id);

    // Fetch all replies for these top-level comments in one query
    const replies = await Comment.find({ parentComment: { $in: topLevelIds } })
      .sort({ _id: 1 })
      .populate("user", "username profilePicture");

    // Fetch likes on all comments (top-level + replies) in two queries
    const allCommentIds = [...topLevelIds, ...replies.map((r) => r._id)];

    const [commentLikes, myLikes] = await Promise.all([
      
      CommentLike.find({
        user: currentUserId,
        comment: { $in: allCommentIds },
      }).select("comment -_id"),
      // same query reused for isLikedByMe
      Promise.resolve(null),
    ]);

    // Build isLikedByMe set
    const likedCommentIds = new Set(
      commentLikes.map((l) => l.comment.toString()),
    );

    // Format a comment document into the response shape
    const formatComment = (c) => ({
      ...c.toObject(),
      isLikedByMe: likedCommentIds.has(c._id.toString()),
    });

    // Group replies under their parent
    const repliesMap = {};
    for (const reply of replies) {
      const parentId = reply.parentComment.toString();
      if (!repliesMap[parentId]) repliesMap[parentId] = [];
      repliesMap[parentId].push(formatComment(reply));
    }

    const formattedComments = topLevelResults.map((c) => ({
      ...formatComment(c),
      replies: repliesMap[c._id.toString()] || [],
    }));

    res.status(200).json({
      count: formattedComments.length,
      comments: formattedComments,
      pagination: { nextCursor, hasNextPage },
    });
  } catch (error) {
    console.error("getComments error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// LIKE / UNLIKE COMMENT
exports.likeComment = async (req, res) => {
  try {
    const commentId = req.params.id;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const existingLike = await CommentLike.findOne({
      user: userId,
      comment: commentId,
    });
    const io = req.app.get("io");

    // UNLIKE
    if (existingLike) {
      await existingLike.deleteOne();
      comment.likesCount = Math.max(0, comment.likesCount - 1);
      await comment.save();

      // Remove notification silently — don't touch unread badge count
      await Notification.findOneAndDelete({
        recipient: comment.user,
        sender: userId,
        type: "comment_like",
        post: comment.post,
      });

      io.to(`post:${comment.post}`).emit("comment:like_update", {
        commentId,
        likesCount: comment.likesCount,
        type: "unlike",
      });

      return res
        .status(200)
        .json({ message: "Comment unliked", likesCount: comment.likesCount });
    }

    // LIKE
    await CommentLike.create({ user: userId, comment: commentId });
    comment.likesCount += 1;
    await comment.save();

    // Notify comment owner (not yourself)
    if (comment.user.toString() !== userId.toString()) {
      const notification = await Notification.create({
        recipient: comment.user,
        sender: userId,
        type: "comment_like",
        post: comment.post,
        comment: commentId,
      });

      await User.findByIdAndUpdate(comment.user, {
        $inc: { unreadNotificationsCount: 1 },
      });

      const populated = await notification.populate(
        "sender",
        "username profilePicture",
      );
      io.to(comment.user.toString()).emit("notification:new", populated);

      const updatedUser = await User.findById(comment.user);
      io.to(comment.user.toString()).emit("notification_badge_updated", {
        unreadCount: updatedUser.unreadNotificationsCount,
      });
    }

    io.to(`post:${comment.post}`).emit("comment:like_update", {
      commentId,
      likesCount: comment.likesCount,
      type: "like",
    });

    return res
      .status(200)
      .json({ message: "Comment liked", likesCount: comment.likesCount });
  } catch (error) {
    console.error("likeComment error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

