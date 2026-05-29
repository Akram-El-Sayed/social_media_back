// Req Module
const User = require("../models/User");
const tokenService = require("../utils/tokenService");

// Check Token - Verify Token
exports.authMiddleware = async function (request, response, next) {
  // Try cookie first, then Authorization header
  let token = request.cookies?.token;

  if (!token) {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return response.status(401).json({ message: "Invalid Token" });
  }

  try {
    const userData = tokenService.verifyToken(token);
    const user = await User.findById(userData.id).select("-password");
    if (!user) return response.status(401).json({ message: "User not found" });

    request.user = user;
    next();
  } catch (error) {
    return response.status(401).json({ message: "Invalid Token or Expired" });
  }
};
