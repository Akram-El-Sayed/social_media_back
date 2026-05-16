const mongoose = require("mongoose");

exports.parseCursor = (cursor) => {
  try {
    return cursor ? new mongoose.Types.ObjectId(cursor) : null;
  } catch {
    return null;
  }
};