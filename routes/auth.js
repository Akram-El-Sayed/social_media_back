const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

//register
router.post('/register', authController.register );
//login
router.post('/login', authController.login);
//logout
router.post('/logout', authController.logout);
// Verify OTP
router.post("/verify-otp", authController.verifyOTP);
//resend OTP
router.post("/resend-otp", authController.resendOTP);
// Forgot Password
router.post("/forgot-password", authController.forgotPassword);
// Reset Password with OTP or Reset Password with Token
router.post("/reset-password", authController.resetPassword);

module.exports = router;
