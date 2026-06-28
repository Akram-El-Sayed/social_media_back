const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const Notification = require("../models/Notification");
const messageValidation = require("../Validations/messageValidation");
const Post = require("../models/Post");
const { parseCursor } = require("../utils/CursorSafety");

const groupReactions = (reactions, currentUserId) => {
  const groups = {};

  reactions.forEach((r) => {
    if (!groups[r.type]) {
      groups[r.type] = { type: r.type, count: 0, reactedByMe: false };
    }
    groups[r.type].count++;
    if (r.user.toString() === currentUserId.toString()) {
      groups[r.type].reactedByMe = true;
    }
  });

  return Object.values(groups);
};
// SEND MESSAGE
exports.sendMessage = async (req, res) => {
  try {
    const io = req.app.get("io");

    const { error, value } = messageValidation.sendMessageValidation.validate(
      req.body,
      { abortEarly: false },
    );

    if (error) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.details.map((err) => err.message),
      });
    }

    const { receiverId, text } = value;
    const senderId = req.user._id;

    if (receiverId === senderId.toString()) {
      return res.status(400).json({ message: "You cannot message yourself" });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    // Find or create conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, receiverId],
      });
    }

    // Create message
    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      conversation: conversation._id,
      text,
      status: "sent",
    });

    // Atomic conversation update
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: message._id,
      $inc: { [`unread.${receiverId.toString()}`]: 1 },
      updatedAt: new Date(),
    });

    const updatedReceiver = await User.findByIdAndUpdate(
      receiverId,
      { $inc: { unreadMessagesCount: 1 } },
      { new: true },
    ).select("unreadMessagesCount");

    // emit to the messages badge, not the general one
    io.to(receiverId.toString()).emit("messages_badge_updated", {
      unreadMessagesCount: updatedReceiver.unreadMessagesCount,
    });

    const populatedMessage = await message.populate(
      "sender",
      "username profilePicture",
    );

    // Emit to the conversation room (for open MessagePanel)
    io.to(`conversation:${conversation._id}`).emit(
      "message:new",
      populatedMessage,
    );

    io.to(receiverId.toString()).emit("message:new", populatedMessage);
    io.to(senderId.toString()).emit("message:new", populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("SendMessage Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// MARK MESSAGES AS SEEN
exports.markMessagesAsSeen = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { conversationId } = req.params;
    const userId = req.user._id;

    // Update Messages to 'seen' status
    const seenResult = await Message.updateMany(
      { conversation: conversationId, receiver: userId, read: false },
      { read: true, status: "seen" },
    );
    const seenCount = seenResult.modifiedCount;

    // Reset Unread Count in Conversation Map
    await Conversation.findByIdAndUpdate(conversationId, {
      $set: { [`unread.${userId.toString()}`]: 0 },
    });

    // Mark Notifications as read
    await Notification.updateMany(
      {
        recipient: userId,
        "data.conversationId": conversationId,
        type: "message",
        read: false,
      },
      { read: true },
    );

    // Notify the sender in real-time that their messages were seen
    io.to(`conversation:${conversationId}`).emit("message:seen", {
      conversationId,
      seenBy: userId,
    });

    // Update the receiver's messages badge (only if something actually changed)
    if (seenCount > 0) {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { unreadMessagesCount: -seenCount } },
        { new: true },
      ).select("unreadMessagesCount");

      io.to(userId.toString()).emit("messages_badge_updated", {
        unreadMessagesCount: updatedUser.unreadMessagesCount,
      });
    }

    res.json({ message: "Chat marked as seen" });
  } catch (error) {
    console.error("Seen Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// MARK AS DELIVERED
exports.markAsDelivered = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { conversationId } = req.params;
    const userId = req.user._id;

    const result = await Message.updateMany(
      { conversation: conversationId, receiver: userId, status: "sent" },
      { status: "delivered" },
    );

    if (result.modifiedCount > 0) {
      io.to(`conversation:${conversationId}`).emit("message:delivered", {
        conversationId,
        userId,
      });
    }

    res.json({ message: "Marked delivered" });
  } catch (err) {
    res.status(500).json({ message: "Error" });
  }
};

// MARK BULK AS DELIVERED
exports.markBulkAsDelivered = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { conversationIds } = req.body;
    const userId = req.user._id;

    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    await Message.updateMany(
      {
        conversation: { $in: conversationIds },
        receiver: userId,
        status: "sent",
      },
      { status: "delivered" },
    );

    conversationIds.forEach((id) => {
      io.to(`conversation:${id}`).emit("message:delivered", {
        conversationId: id,
        userId,
      });
    });

    res.json({ message: "Bulk delivered updated" });
  } catch (err) {
    res.status(500).json({ message: "Error" });
  }
};

// GET CONVERSATIONS
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const { cursor, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 20, 50);

    const query = { participants: userId };

    // Cursor is based on updatedAt most recent first
    if (cursor) {
      query.updatedAt = { $lt: new Date(cursor) };
    }

    const conversations = await Conversation.find(query)
      .sort({ updatedAt: -1 }) // most recent message on top
      .limit(parsedLimit + 1)
      .populate("participants", "username profilePicture")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username profilePicture" },
      });

    const hasNextPage = conversations.length > parsedLimit;
    const results = hasNextPage ? conversations.slice(0, -1) : conversations;
    const nextCursor = hasNextPage
      ? results[results.length - 1].updatedAt.toISOString()
      : null;

    const formatted = results.map((conv) => ({
      ...conv.toObject(),
      unreadCount: conv.unread.get(userId.toString()) || 0,
    }));

    res.json({
      count: formatted.length,
      conversations: formatted,
      pagination: { nextCursor, hasNextPage },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// SEARCH CONVERSATIONS
exports.searchConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const { search = "" } = req.query;

    if (!search.trim()) {
      return res.status(400).json({ message: "Search query is required" });
    }

    // Find users matching the search term
    const matchingUsers = await User.find({
      _id: { $ne: userId },
      $or: [{ username: { $regex: search.trim(), $options: "i" } }],
    }).select("_id username  profilePicture");

    const matchingUserIds = matchingUsers.map((u) => u._id);

    // Find conversations where current user participates with any matching user
    const conversations = await Conversation.find({
      participants: { $all: [userId], $in: matchingUserIds },
    })
      .sort({ updatedAt: -1 })
      .populate("participants", "username  profilePicture")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username profilePicture" },
      });

    const formatted = conversations.map((conv) => ({
      ...conv.toObject(),
      unreadCount: conv.unread.get(userId.toString()) || 0,
    }));

    res.json({ count: formatted.length, conversations: formatted });
  } catch (error) {
    console.error("searchConversations error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET MESSAGES
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { cursor, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 20, 50);

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user._id.toString(),
    );
    if (!isParticipant) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const query = { conversation: conversationId };
    const cursorId = parseCursor(cursor);
    if (cursorId) query._id = { $lt: cursorId };

    const messages = await Message.find(query)
      .sort({ _id: -1 })
      .limit(parsedLimit + 1)
      .populate("sender", "username profilePicture")
      .populate("receiver", "username profilePicture")
      .populate({
        path: "sharedPost",
        select: "content media postType user likesCount",
        populate: { path: "user", select: "username profilePicture" },
      });

    const hasMore = messages.length > parsedLimit;
    const results = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore ? results[results.length - 1]._id : null;

    res.json({
      messages: results.reverse(), // oldest first for chat UI
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Only sender can delete
    if (message.sender.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Not allowed to delete this message" });
    }

    // Soft delete
    message.text = "This message was deleted";
    message.deleted = true;
    await message.save();

    // If this message is the lastMessage, update conversation
    const conversation = await Conversation.findById(message.conversation);

    if (conversation?.lastMessage?.toString() === messageId) {
      const newLastMessage = await Message.findOne({
        conversation: conversation._id,
        _id: { $ne: messageId },
      }).sort({ createdAt: -1 });

      conversation.lastMessage = newLastMessage?._id || null;
      await conversation.save();
    }

    // Emit realtime delete event
    io.to(`conversation:${message.conversation}`).emit("message:deleted", {
      messageId,
      conversationId: message.conversation,
    });

    res.json({ message: "Message deleted successfully" });
  } catch (error) {
    console.error("DeleteMessage Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// EDIT MESSAGE
exports.editMessage = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { messageId } = req.params;
    const { text } = req.body;

    // Validation
    const { error } = messageValidation.editMessageValidation.validate(
      { messageId, text },
      { abortEarly: false },
    );

    if (error) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.details.map((err) => err.message),
      });
    }

    const userId = req.user._id;
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Security Check: Only sender can edit
    if (message.sender.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to edit this message" });
    }

    // Prevent editing deleted messages
    if (message.deleted) {
      return res.status(400).json({ message: "Cannot edit deleted message" });
    }

    // Update and Save
    message.text = text;
    message.isEdited = true;
    message.editedAt = new Date();

    await message.save();

    const updatedMessage = await message.populate(
      "sender",
      "username profilePicture",
    );

    // Real-time update
    io.to(`conversation:${message.conversation}`).emit("message:edited", {
      _id: message._id,
      text: message.text,
      isEdited: true,
      editedAt: message.editedAt,
    });

    res.json(updatedMessage);
  } catch (error) {
    console.error("Edit Message Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ADD & TOGGLE REACTION
exports.reactToMessage = async (req, res) => {
  try {
    const io = req.app.get("io");

    const { error: paramError } =
      messageValidation.reactParamsValidation.validate(req.params);

    if (paramError) {
      return res.status(400).json({
        message: "Invalid message ID",
      });
    }

    const { error: bodyError, value } =
      messageValidation.reactBodyValidation.validate(req.body);

    if (bodyError) {
      return res.status(400).json({
        message: "Invalid reaction type",
      });
    }

    const { type } = value;
    const userId = req.user._id;
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    const existingIndex = message.reactions.findIndex(
      (r) => r.user.toString() === userId.toString(),
    );

    if (existingIndex !== -1) {
      if (message.reactions[existingIndex].type === type) {
        // Toggle off
        message.reactions.splice(existingIndex, 1);
      } else {
        // Change reaction
        message.reactions[existingIndex].type = type;
      }
    } else {
      message.reactions.push({ user: userId, type });
    }

    await message.save();

    const groupedData = groupReactions(message.reactions, userId);

    io.to(`conversation:${message.conversation}`).emit(
      "message:reaction_updated",
      {
        messageId: message._id,
        reactions: groupedData,
      },
    );

    res.json({
      message: "Reaction updated",
      reactions: groupedData,
    });
  } catch (error) {
    console.error("Reaction Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getReactionUsers = async (req, res) => {
  try {
    const { error: paramError } =
      messageValidation.getReactionUsersValidation.validate(req.params);

    if (paramError) {
      return res.status(400).json({ message: "Invalid message ID" });
    }

    const { error: queryError, value } =
      messageValidation.getReactionQueryValidation.validate(req.query);

    if (queryError) {
      return res.status(400).json({ message: "Invalid query parameters" });
    }

    const { messageId } = req.params;
    const { type, limit = 20 } = value;
    const parsedLimit = Math.min(parseInt(limit) || 20, 50);

    // cursor is the index of the last item seen
    const cursor = parseInt(req.query.cursor) || 0;

    const message = await Message.findById(messageId).populate({
      path: "reactions.user",
      select: "username profilePicture",
    });

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Filter by reaction type first
    const filtered = message.reactions.filter((r) => r.type === type);

    // Slice from cursor position
    const slice = filtered.slice(cursor, cursor + parsedLimit + 1);

    const hasNextPage = slice.length > parsedLimit;
    const results = hasNextPage ? slice.slice(0, -1) : slice;
    const nextCursor = hasNextPage ? cursor + parsedLimit : null;

    res.json({
      type,
      count: filtered.length,
      users: results.map((r) => r.user),
      pagination: {
        nextCursor,
        hasNextPage,
      },
    });
  } catch (error) {
    console.error("Get Reaction Users Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// SHARE POST
exports.sharePost = async (req, res) => {
  try {
    const io = req.app.get("io");

    const { postId } = req.params;
    const { error, value } = messageValidation.sharePostValidation.validate(
      req.body,
      { abortEarly: false },
    );

    if (error) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.details.map((err) => err.message),
      });
    }

    const { receiverId, text } = value;
    const senderId = req.user._id;

    if (receiverId === senderId.toString()) {
      return res.status(400).json({ message: "You cannot share to yourself" });
    }

    const [receiver, post] = await Promise.all([
      User.findById(receiverId),
      Post.findById(postId),
    ]);

    if (!receiver)
      return res.status(404).json({ message: "Receiver not found" });
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.privacy === "private") {
      return res.status(403).json({ message: "This post cannot be shared" });
    }

    // Find or create conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, receiverId],
      });
    }

    // Create message with sharedPost
    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      conversation: conversation._id,
      text: text || "",
      sharedPost: postId,
      status: "sent",
    });

    // Update conversation
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: message._id,
      $inc: { [`unread.${receiverId.toString()}`]: 1 },
      updatedAt: new Date(),
    });

    // Increment sharesCount
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $inc: { sharesCount: 1 } },
      { new: true },
    );

    // Notification
    const notification = await Notification.create({
      recipient: receiverId,
      sender: senderId,
      type: "share",
      post: postId,
      data: { conversationId: conversation._id, messageId: message._id },
    });

    const populatedNotif = await notification.populate(
      "sender",
      "username profilePicture",
    );

    const updatedReceiver = await User.findByIdAndUpdate(
      receiverId,
      { $inc: { unreadNotificationsCount: 1 } },
      { new: true },
    ).select("unreadNotificationsCount");

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "username profilePicture")
      .populate({
        path: "sharedPost",
        select: "content media postType user likesCount",
        populate: { path: "user", select: "username profilePicture" },
      });

    // Emit to conversation room (for open MessagePanel)
    io.to(`conversation:${conversation._id}`).emit(
      "message:new",
      populatedMessage,
    );

    io.to(receiverId.toString()).emit("message:new", populatedMessage);

    // Post stat updates
    io.to(`post:${postId}`).emit("post:share_update", {
      postId,
      sharesCount: updatedPost.sharesCount,
    });

    io.to("feed").emit("feed:post_updated", {
      postId,
      sharesCount: updatedPost.sharesCount,
      type: "share",
    });

    // Notification bell
    io.to(receiverId.toString()).emit("notification:new", populatedNotif);
    io.to(receiverId.toString()).emit("notification_badge_updated", {
      unreadCount: updatedReceiver.unreadNotificationsCount,
    });

    res.status(201).json({
      ...populatedMessage.toObject(),
      sharesCount: updatedPost.sharesCount,
    });
  } catch (error) {
    console.error("SharePost Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
