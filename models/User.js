const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },

    email: { type: String, required: true, unique: true },

    password: { type: String, required: true },

    profilePicture: { type: String, default: "" },

    // Authorization
    role: { type: String, enum: ["admin", "user"], default: "user" },

    profilePicturePublicId: {
      type: String,
      default: "",
    },

    bio: { type: String, default: "" },

    warningCount: { type: Number, default: 0 },

    followersCount: { type: Number, default: 0 },

    followingCount: { type: Number, default: 0 },

    unreadNotificationsCount: { type: Number, default: 0 },

    accountStatus: {
      type: String,
      enum: ["Pending", "Active", "Suspended", "Deleted"],
      default: "Pending",
    },

    // Verification Email
    otp: { type: String },
    otpExpiriesAt: { type: Date },

    // ResetPassword
    resetPasswordToken: { type: String },
    resetPasswordExpiriesAt: { type: Date },
  },
  { timestamps: true },
);



module.exports = mongoose.model("User", userSchema);
