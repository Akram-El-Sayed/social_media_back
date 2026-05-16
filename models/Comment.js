const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    text: { type: String, required: true, trim: true },
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },
    likesCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

commentSchema.index({ post: 1, parentComment: 1, _id: 1 });
commentSchema.index({ post: 1, createdAt: 1 });

module.exports = mongoose.model("Comment", commentSchema);
