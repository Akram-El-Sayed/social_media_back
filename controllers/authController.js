// Req Validator
const authValidations = require("../Validations/authValidations");
//Req User Model
const User = require("../models/User");
//Req Bcrypt
const bcrypt = require("bcrypt");
// Req JwtService
const tokenService = require("../utils/tokenService");
// Req OTP
const otpGenerator = require("otp-generator");
//send Mail
const { sendMail } = require("../utils/mailService");
const { setTokenCookie } = require("../utils/CookiesHelper");
const SAFE_LOGIN_SELECT = require("../utils/SafeLoginSelect");

exports.register = async (req, res) => {
  try {
    const { error, value } = authValidations.registerSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      return res.status(400).json({ message: error.details.map((e) => e.message) });
    }

    const { email, password, username } = value;

    // Check for existing user 
    const userExists = await User.findOne({ $or: [{ email }, { username }] });

    if (userExists) {
      const matchedByEmail = userExists.email === email;

      // Active user → hard block regardless of which field matched
      if (userExists.isActive) {
        return res.status(409).json({
          message: matchedByEmail ? "Email already exists" : "Username already taken",
        });
      }

      // Inactive user matched by username only (different email) → still taken
      if (!matchedByEmail) {
        return res.status(409).json({ message: "Username already taken" });
      }

      // Inactive user matched by email → re-issue OTP 
      // Username may have changed on retry, check it isn't taken by someone else
      if (userExists.username !== username) {
        const usernameTaken = await User.findOne({ username, _id: { $ne: userExists._id } });
        if (usernameTaken) {
          return res.status(409).json({ message: "Username already taken" });
        }
      }

      const OTP = otpGenerator.generate(6, {
        digits: true,
        lowerCaseAlphabets: false,
        upperCaseAlphabets: false,
        specialChars: false,
      });

      userExists.username        = username;
      userExists.password        = await bcrypt.hash(password, 12);
      userExists.otp             = await bcrypt.hash(OTP, 10);
      userExists.otpExpiriesAt   = new Date(Date.now() + 15 * 60 * 1000);

      await userExists.save();

      const token = tokenService.generateToken(userExists._id, userExists.role);
      setTokenCookie(res, token);

      try {
        await sendMail({
          to: email,
          subject: "Verify Your Account",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
              <h2>Verify your account</h2>
              <p>Your verification code is:</p>
              <h1 style="letter-spacing: 8px; color: #4F46E5;">${OTP}</h1>
              <p>This code expires in 15 minutes.</p>
              <p>If you didn't request this, ignore this email.</p>
            </div>`,
        });
      } catch (mailError) {
        console.error("Failed to send OTP email:", mailError);
        return res.status(500).json({
          message: "Account created but failed to send verification email. Please use resend OTP.",
        });
      }

      return res.status(200).json({
        user: { email: userExists.email, username: userExists.username },
      });
    }

    // Brand new user 
    const OTP = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    const newUser = new User({
      username,
      email,
      password:      await bcrypt.hash(password, 12),
      otp:           await bcrypt.hash(OTP, 10),
      otpExpiriesAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    await newUser.save();

    const token = tokenService.generateToken(newUser._id, newUser.role);
    setTokenCookie(res, token);

    try {
      await sendMail({
        to: email,
        subject: "Verify Your Account",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
            <h2>Verify your account</h2>
            <p>Your verification code is:</p>
            <h1 style="letter-spacing: 8px; color: #4F46E5;">${OTP}</h1>
            <p>This code expires in 15 minutes.</p>
            <p>If you didn't request this, ignore this email.</p>
          </div>`,
      });
    } catch (mailError) {
      console.error("Failed to send OTP email:", mailError);
      return res.status(500).json({
        message: "Account created but failed to send verification email. Please use resend OTP.",
      });
    }

    return res.status(201).json({
      user: { email: newUser.email, username: newUser.username },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error!" });
  }
};

// Verify OTP
exports.verifyOTP = async function (request, response) {
  try {
    // Validation
    const { error, value } = authValidations.otpSchema.validate(request.body, {
      abortEarly: false,
    });

    // Errors Handling
    if (error)
      return response
        .status(400)
        .json({ messages: error.details.map((err) => err.message) });

    // Get User With Same Email and OTP and Verify Expiries At
    const { email, otp } = value;

    // Get User With Email
    const user = await User.findOne({ email });
    if (!user) {
      return response
        .status(404)
        .json({ message: "User Not Found!", data: null });
    }

    if (user.otpExpiriesAt < new Date()) {
      return response.status(400).json({ message: "OTP Expired" });
    }
    const isOTPValid = await bcrypt.compare(otp, user.otp); 
    if (!isOTPValid) {
      return response.status(400).json({ message: "Invalid OTP" });
    }

    // Activate Account
    user.accountStatus = "Active";
    user.otp = null;
    user.otpExpiriesAt = null;

    // Save
    await user.save();

    // Generate Token
    const token = tokenService.generateToken(user._id, user.role);
    setTokenCookie(response, token);

    // Send Response
    response.json({
      message: "Account verified successfully",
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
      },
    });
  } catch (error) {
    console.log(error);
    response.status(500).json({ message: "Internal Server Error!" });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    // Validation
    const { error, value } = authValidations.resendotpSchema.validate(
      req.body,
      { abortEarly: false },
    );

    // Errors Handling
    if (error)
      return res
        .status(400)
        .json({ messages: error.details.map((err) => err.message) });

    const { email } = value;

    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User Not Found!" });

    // Optional: prevent resend if already active
    if (user.accountStatus === "Active") {
      return res.status(400).json({
        message: "Account already verified",
      });
    }
    const cooldown = 60 * 1000; // 1 minute
    if (
      user.otpExpiriesAt &&
      user.otpExpiriesAt - Date.now() > 15 * 60 * 1000 - cooldown
    ) {
      return res
        .status(429)
        .json({ message: "Please wait 1 minute before requesting a new OTP" });
    }
    // Generate new OTP
    const OTP = otpGenerator.generate(6, {
      digits: true,
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });

    const hashedOTP = await bcrypt.hash(OTP, 10);
    user.otp = hashedOTP;
    user.otpExpiriesAt = new Date(Date.now() + 15 * 60 * 1000);

    await user.save();

    await sendMail({
      to: email,
      subject: "Resend OTP",
      html: `<div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
        <h2>Verify your account</h2>
        <p>Your verification code is:</p>
        <h1 style="letter-spacing: 8px; color: #4F46E5;">${OTP}</h1>
        <p>This code expires in 10 minutes.</p>
        <p>If you didn't request this, ignore this email.</p>
      </div>`,
    });

    res.json({
      message: "OTP resent successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error!" });
  }
};
// Reset Password
exports.resetPassword = async function (request, response) {
  try {
    // Validate Data
    const { error, value } = authValidations.resetPasswordSchema.validate(
      request.body,
      {
        abortEarly: false,
      },
    );

    // Errors Handling
    if (error)
      return response
        .status(400)
        .json({ messages: error.details.map((err) => err.message) });

    const { otp, email, password } = value;

    // Check User
    const user = await User.findOne({ email });
    if (!user) {
      return response.status(404).json({ message: "User Not Found!" });
    }

    // OTP Verification
    const isOTPValid = await bcrypt.compare(otp, user.resetPasswordToken);
    if (!isOTPValid)
      return response.status(400).json({ message: "Invalid OTP" });

    // Expired Verification
    if (user.resetPasswordExpiriesAt < new Date()) {
      return response.status(400).json({ message: "Expired OTP Date" });
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update User
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpiriesAt = null;

    // Save
    await user.save();

    // Send Response
    response.json({ message: "Password Reset Successfully", data: null });
  } catch (error) {
    console.error(error);
    response.status(500).json({ message: "Internal Server Error!" });
  }
};
// Forgot Password
exports.forgotPassword = async function (request, response) {
  try {
    // Validate Data: Email
    const { value, error } = authValidations.forgotPasswordSchema.validate(
      request.body,
    );
    if (error) {
      return response.status(400).json({ message: error.message });
    }

    const email = value.email;
    // Check User
    const user = await User.findOne({ email });
    if (!user) {
      return response.status(404).json({ message: "User Not Found!" });
    }

    // Generate OTP
    const OTP = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
    });

    const hashedOTP = await bcrypt.hash(OTP, 10);

    // Update OTP & Expire Date
    user.resetPasswordToken = hashedOTP;
    user.resetPasswordExpiriesAt = new Date(Date.now() + 15 * 60 * 1000);

    // Save
    await user.save();

    // Send Email - OTP
    await sendMail({
      to: email,
      subject: "Reset Password",
      html: `<div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
        <h2>Verify your account</h2>
        <p>Your verification code is:</p>
        <h1 style="letter-spacing: 8px; color: #4F46E5;">${OTP}</h1>
        <p>This code expires in 10 minutes.</p>
        <p>If you didn't request this, ignore this email.</p>
      </div>`,
    });

    // Send Response
    response.json({
      message: "OTP Sent Successfully",
      data: {
        user: {
          email: user.email, // Optional [Extend]
        },
      },
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ message: "Internal Server Error!" });
  }
};

exports.login = async (req, res) => { 
  try {
    // Validation
    const { error, value } = authValidations.loginSchema.validate(req.body, {
      abortEarly: false,
    });

    if (error) {
      return res.status(400).json({
        message: error.details.map((err) => err.message),
      });
    }

    const { email, password } = value;

    // Find user
    const user = await User.findOne({ email }).select(SAFE_LOGIN_SELECT);
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    // Check account status
    if (user.accountStatus !== "Active")
      return res.status(403).json({ message: "Account not active" });

    // Generate token
    const token = tokenService.generateToken(user._id, user.role);
    setTokenCookie(res, token);

    res.status(200).json({
      user,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.logout = (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
};

