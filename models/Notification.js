const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: ["like", "comment", "comment_reply", "comment_like", "follow", "message", "share"],
      required: true,
    },

    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },

    comment: { type: mongoose.Schema.Types.ObjectId, ref: "Comment" },

    read: { type: Boolean, default: false },

    data: {
      type: mongoose.Schema.Types.Mixed,
    },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
