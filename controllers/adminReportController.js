const Report = require("../models/Report");
const User = require("../models/User");
const Post = require("../models/Post");
const { parseCursor } = require("../utils/CursorSafety");

//Req Cloudinary
const cloudinary = require("../config/cloudinary");

// GET PENDING REPORTS
exports.getPendingReports = async (req, res) => {
  try {
    const { cursor, limit = 20, status = "pending" } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 20, 50);

    // Allow admin to filter by status too
    const allowedStatuses = ["pending", "under_review", "resolved"];
    const filterStatus = allowedStatuses.includes(status) ? status : "pending";

    const query = { status: filterStatus };
    const cursorId = parseCursor(cursor);
    if (cursorId) query._id = { $lt: cursorId };

    const reports = await Report.find(query)
      .populate("reporter", "username profilePicture")
      .populate("reportedUser", "username profilePicture accountStatus")
      .populate("post", "content media")
      .populate("reviewedBy", "username")
      .sort({ _id: -1 })
      .limit(parsedLimit + 1);

    const hasNextPage = reports.length > parsedLimit;
    const results = hasNextPage ? reports.slice(0, -1) : reports;
    const nextCursor = hasNextPage ? results[results.length - 1]._id : null;

    res.status(200).json({
      count: results.length,
      reports: results,
      pagination: { nextCursor, hasNextPage },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

// TAKE REPORT FOR REVIEW
exports.takeReportForReview = async (req, res) => {
  try {
    const reportId = req.params.id;
    const adminId = req.user._id;

    const report = await Report.findById(reportId);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (report.status !== "pending") {
      return res.status(400).json({
        message: "Report already under review or resolved",
      });
    }

    report.status = "under_review";
    report.reviewedBy = adminId;

    await report.save();

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// RESOLVE REPORT
exports.resolveReport = async (req, res) => {
  try {
    const reportId = req.params.id;
    const { action } = req.body;

    const allowedActions = ["delete_post", "warn_user", "suspend_user", "none"];

    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        message: "Invalid action",
      });
    }

    // Replace the two separate calls with one atomic operation
    const report = await Report.findOneAndUpdate(
      { _id: reportId, status: "under_review" }, // only resolve if still under_review
      { status: "resolved", actionTaken: action, reviewedBy: req.user._id },
      { new: true },
    );

    if (!report) {
      return res
        .status(404)
        .json({ message: "Report not found or already resolved" });
    }

    // ACTION HANDLING

    // Delete post
    if (action === "delete_post" && report.post) {
      const post = await Post.findById(report.post);
      if (post) {
        // Delete media from Cloudinary first
        if (post.media && post.media.length > 0) {
          const deletePromises = post.media.map((item) =>
            cloudinary.uploader.destroy(item.publicId, {
              resource_type: item.type === "video" ? "video" : "image",
            }),
          );
          await Promise.all(deletePromises);
        }
        await post.deleteOne();
      }
    }

    // Warn user
    if (action === "warn_user" && report.reportedUser) {
      await User.findByIdAndUpdate(report.reportedUser, {
        $inc: { warningCount: 1 },
      });
    }

    // Suspend user
    if (action === "suspend_user" && report.reportedUser) {
      await User.findByIdAndUpdate(report.reportedUser, {
        accountStatus: "Suspended",
      });
    }

    res.status(200).json({
      message: "Report resolved successfully",
      report,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};
