// Req Jwt
const jwt = require('jsonwebtoken');


const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required in environment variables");
}

exports.generateToken = function (userId , role) {
  return jwt.sign({id: userId , role: role }, JWT_SECRET, { expiresIn: "7d" });
};

exports.verifyToken = function (token) {
  return jwt.verify(token, JWT_SECRET);
};
