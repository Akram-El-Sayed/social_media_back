const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.CLIENT_URL, 
].filter(Boolean); // removes undefined if CLIENT_URL isn't set

exports.isDynamicOrigin = (origin) => {
  if (!origin) return true; // allow non-browser requests (Postman, etc.)
  if (allowedOrigins.includes(origin)) return true;

  // Local network (mobile dev testing on same WiFi)
  if (/^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)) return true;

  return false;
};