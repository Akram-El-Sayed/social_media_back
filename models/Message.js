const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },

    text: String,

    read: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },

    reactions: {
      type: [
        {
          user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          type: {
            type: String,
            enum: ["like", "love", "haha", "sad", "angry"],
            required: true,
          },
        },
      ],
      default: [],
    },

    sharedPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    },

    deleted: {
      type: Boolean,
      default: false,
    },

    isEdited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

messageSchema.index({ conversation: 1, _id: -1 }); // getMessages cursor query
messageSchema.index({ conversation: 1, receiver: 1, status: 1 });
module.exports = mongoose.model("Message", messageSchema);
