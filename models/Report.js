const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },

    type: {
      type: String,
      enum: ["spam", "harassment", "hate_speech" ,"nudity", "violence", "fake_account", "other"],
      required: true,
    },

    reason: String,

    status: {
      type: String,
      enum: ["pending", "under_review", "resolved"],
      default: "pending",
    },

    actionTaken: {
      type: String,
      enum: ["none", "warn_user", "delete_post", "suspend_user"],
      default: "none",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

reportSchema.index({ reporter: 1, post: 1 });
reportSchema.index({ reporter: 1, reportedUser: 1 });
reportSchema.index({ status: 1, _id: -1 });
reportSchema.index({ reporter: 1, post: 1, status: 1 });
reportSchema.index({ reporter: 1, reportedUser: 1, status: 1 });

module.exports = mongoose.model("Report", reportSchema);
