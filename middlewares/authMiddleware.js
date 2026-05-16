// Req Module
const User = require("../models/User");
const tokenService = require("../utils/tokenService");

// Goal: Check Token - Verify Token
exports.authMiddleware = async function (request, response, next) {
  // Check Header
  const token = request.cookies?.token;

  // Check Token
  if (!token) {
    return response.status(401).json({ message: "Invalid Token" });
  }

  try {
    // Verify Token
    const userData = tokenService.verifyToken(token);
    
    // Append Information User To Request
    const user = await User.findById(userData.id).select("-password");

    if (!user) {
      return response.status(401).json({ message: "User not found" });
    }

    request.user = user;
    // Next Function
    next();
  } catch (error) {
    return response.status(401).json({ message: "Invalid Token or Expired" });
  }
};
