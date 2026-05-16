// Req Module
const Joi = require("joi");

// Login Schema
const loginSchema = Joi.object({
  email: Joi.string().min(3).max(100).required(),
  password: Joi.string().min(6).max(255).required(),
});

// Register Schema
const registerSchema = Joi.object({
  email: Joi.string().min(3).max(100).required(),
  password: Joi.string().min(6).max(255).required(),
  username: Joi.string().min(3).max(50).trim().required(),
});

// OTP Schema
const otpSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required(),
});

const resendotpSchema = Joi.object({
  email: Joi.string().email().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required(),
  password: Joi.string().min(8).required(),
});

module.exports = {
  loginSchema,
  registerSchema,
  otpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendotpSchema,
};
