const mongoose = require("mongoose");

const commentLikeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      required: true,
    },
  },
  { timestamps: true },
);

commentLikeSchema.index({ user: 1, comment: 1 }, { unique: true });
commentLikeSchema.index({ comment: 1, _id: -1 });

module.exports = mongoose.model("CommentLike", commentLikeSchema);
