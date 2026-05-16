//Req Models
const Notification = require('../models/Notification');
const User = require('../models/User');
const Report = require("../models/Report");

//Validations
const reportValidation = require('../Validations/reportValidation')
//req cursor safety 
const { parseCursor } = require("../utils/CursorSafety");

// GET NOTIFICATIONS
exports.getNotifications = async (req, res) => {
  try {
    const { cursor, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 20, 50);
    const cursorId = parseCursor(cursor);

    const query = {
      recipient: req.user._id,
      isDeleted: { $ne: true }, // filter out deleted notifications
    };

    if (cursorId) query._id = { $lt: cursorId };

    const notifications = await Notification.find(query)
      .populate("sender", "username profilePicture")
      .populate("post", "media content")       // useful for deep-linking
      .populate("comment", "text")             // useful for comment_like
      .sort({ _id: -1 })
      .limit(parsedLimit + 1);

    const hasNextPage = notifications.length > parsedLimit;
    const results = hasNextPage ? notifications.slice(0, -1) : notifications;
    const nextCursor = hasNextPage ? results[results.length - 1]._id : null;

    res.status(200).json({
      count: results.length,
      notifications: results,
      pagination: { nextCursor, hasNextPage },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

// MARK ALL AS READ
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { recipient: userId, read: false },
      { read: true }
    );

    await User.findByIdAndUpdate(
      userId,
      { unreadNotificationsCount: 0 }
    );

    const io = req.app.get("io");

    io.to(userId.toString()).emit("notification_badge_updated", {
      unreadCount: 0,
    });

    res.status(200).json({
      message: "All notifications marked as read",
      unreadCount: 0,
    });

  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

exports.markOneRead = async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id, read: false },
      { read: true },
      { new: true }
    );
    if (notif) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { unreadNotificationsCount: -1 },
      });
      const updated = await User.findById(req.user._id)
        .select("unreadNotificationsCount");
      req.app.get("io")
        .to(req.user._id.toString())
        .emit("notification_badge_updated", {
          unreadCount: Math.max(0, updated.unreadNotificationsCount),
        });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// CREATE REPORT
exports.createReport = async (req, res) => {
  try {
    const reporterId = req.user._id;

    const { error, value } = reportValidation.reportSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.details.map((err) => err.message),
      });
    }

    const { postId, reportedUserId, type, reason } = value;

    // prevent duplicate reports from same user
    const existingReport = await Report.findOne({
      reporter: reporterId,
      ...(postId && { post: postId }),
      ...(reportedUserId && { reportedUser: reportedUserId }),
      status: { $in: ["pending", "under_review"] }, // allow re-reporting resolved ones
    });

    if (existingReport) {
      return res.status(400).json({ message: "You have already reported this" });
    }

    const report = await Report.create({
      reporter: reporterId,
      post: postId || null,
      reportedUser: reportedUserId || null,
      type,
      reason,
    });

    res.status(201).json({ message: "Report submitted successfully", report });
  } catch (error) {
    console.error("createReport error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};