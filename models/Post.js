const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },

  type: {
    type: String,
    enum: ["image", "video"],
    required: true,
  },

  width: Number,
  height: Number,
  duration: Number,

  thumbnail: String,

  orientation: {
    type: String,
    enum: ["portrait", "landscape", "square"],
  },

  format: String,
  size: Number,
});

const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    content: {
      type: String,
      trim: true,
      maxlength: 2200, // limit
    },

    privacy: {
      type: String,
      enum: ["public", "friends-only", "private"],
      default: "public",
      trim: true,
      index: true,
    },

    postType: {
      type: String,
      enum: ["post", "reel"],
      default: "post",
      index: true,
    },

    media: [mediaSchema],

    likesCount: {
      type: Number,
      default: 0,
    },

    commentsCount: {
      type: Number,
      default: 0,
    },

    viewsCount: {
      type: Number,
      default: 0,
      index: true,
    },

    impressionsCount: {
      type: Number,
      default: 0,
    },

    sharesCount: {
      type: Number,
      default: 0,
    },

    hashtags: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: [],
      index: true,
    },
  },
  { timestamps: true },
);
postSchema.index({ user: 1, privacy: 1, _id: -1 });
postSchema.index({ user: 1, createdAt: -1 });
postSchema.index({ postType: 1, createdAt: -1 });
postSchema.index({ privacy: 1, createdAt: -1 });
postSchema.index({ hashtags: 1, likesCount: -1, _id: -1 });

module.exports = mongoose.model("Post", postSchema);
