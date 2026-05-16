exports.setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: true, // ← required for cross-domain
    sameSite: "none", // ← required for cross-domain
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};
