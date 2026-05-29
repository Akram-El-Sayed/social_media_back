const http = require("http");
const app = require("./app");
const { Server } = require("socket.io");
const tokenService = require("./utils/tokenService");
const User = require("./models/User");
const Message = require("./models/Message");
const Conversation = require("./models/Conversation");
const { isDynamicOrigin } = require("./utils/corsOrigin");

app.set("trust proxy", 1);

const server = http.createServer(app);

// Map to track socketId -> userId
const onlineUsersMap = new Map();

const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,           
  "http://localhost:5173",          
  "http://127.0.0.1:5173",
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin) || isDynamicOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  },
  connectionStateRecovery: {},
});

app.set("io", io);

// SOCKET AUTH MIDDLEWARE
io.use(async (socket, next) => {
  try {
    let token = socket.handshake.headers.cookie
      ?.split("; ")
      .find((c) => c.startsWith("token="))
      ?.split("=")
      .slice(1)
      .join("=");

    // Fall back to socket auth (for Safari/iOS)
    if (!token) {
      token = socket.handshake.auth?.token;
    }

    if (!token) return next(new Error("No token"));

    const userData = tokenService.verifyToken(token);
    const user = await User.findById(userData.id).select("-password");
    if (!user) return next(new Error("User not found"));

    socket.user = user;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

// SOCKET CONNECTION
io.on("connection", (socket) => {
  const currentUserId = socket.user.id.toString();
  console.log("User connected:", currentUserId);

  socket.join(currentUserId);
  socket.join("feed");
  // Check if they are already online on another device BEFORE adding this new socket
  const isAlreadyOnline = Array.from(onlineUsersMap.values()).includes(
    currentUserId,
  );

  onlineUsersMap.set(socket.id, currentUserId);

  if (!isAlreadyOnline) {
    // Only broadcast to others if this is their first device connecting
    socket.broadcast.emit("user:online", { userId: currentUserId });
  }

  // Handle the request for the current online list
  socket.on("request_online_users", () => {
    // Get unique user IDs (handling multi-device users)
    const onlineIds = Array.from(new Set(onlineUsersMap.values()));
    socket.emit("online_users_list", onlineIds);
  });

  // Room management
  socket.on("join_post", (postId) => {
    console.log(`📌 ${socket.user.username} joined post room: post:${postId}`);
    socket.join(`post:${postId}`);
  });

  socket.on("leave_post", (postId) => {
    if (!postId) return;
    socket.leave(`post:${postId}`);
  });

  socket.on("join_conversation", async (conversationId) => {
    try {
      if (!conversationId) return;

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return;

      const isParticipant = conversation.participants.some(
        (participantId) =>
          participantId.toString() === socket.user.id.toString(),
      );

      if (!isParticipant) {
        console.log("Unauthorized room join attempt by:", socket.user.id);
        socket.emit("error", { message: "Unauthorized" });
        return;
      }

      for (const room of socket.rooms) {
        if (room.startsWith("conversation:")) {
          socket.leave(room);
        }
      }

      socket.join(`conversation:${conversationId}`);
    } catch (err) {
      console.error("join_conversation error:", err);
    }
  });

  // Message status
  socket.on("message_received", async ({ messageId, conversationId }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return;
      if (message.receiver.toString() !== socket.user.id.toString()) return;
      if (message.conversation.toString() !== conversationId.toString()) return;

      message.status = "delivered";
      await message.save();

      io.to(message.sender.toString()).emit("message:delivered", {
        messageId,
        conversationId,
      });
    } catch (err) {
      console.error("message_received error:", err);
    }
  });

  socket.on("message_seen", async ({ messageId, conversationId }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return;
      if (message.receiver.toString() !== socket.user.id.toString()) return;
      if (message.conversation.toString() !== conversationId.toString()) return;

      message.status = "seen";
      await message.save();

      io.to(message.sender.toString()).emit("message:seen", {
        messageId,
        conversationId,
      });
    } catch (err) {
      console.error("message_seen error:", err);
    }
  });

  // Typing indicators
  socket.on("typing:start", ({ conversationId, receiverId }) => {
    if (!receiverId) return;
    // Emit directly to the receiver's personal room
    socket.to(receiverId.toString()).emit("typing", {
      conversationId,
      userId: currentUserId,
    });
  });

  socket.on("typing:stop", ({ conversationId, receiverId }) => {
    if (!receiverId) return;
    // Emit directly to the receiver's personal room
    socket.to(receiverId.toString()).emit("stop_typing", {
      conversationId,
      userId: currentUserId,
    });
  });

  // Reactions

  socket.on("message:react", async ({ messageId, type, conversationId }, ack) => {
    try {
      // Guard: all fields required
      if (!messageId || !type || !conversationId) return;

      // Authorise: reactor must be in the conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return;

      const isParticipant = conversation.participants.some(
        (p) => p.toString() === socket.user.id.toString(),
      );
      if (!isParticipant) {
        socket.emit("error", { message: "Unauthorized" });
        return;
      }

      // Load message
      const message = await Message.findById(messageId);
      if (!message) return;

      // Toggle logic: one reaction per user
      const existingIdx = message.reactions.findIndex(
        (r) => r.user.toString() === socket.user.id.toString(),
      );

      if (existingIdx !== -1) {
        if (message.reactions[existingIdx].type === type) {
          // Same emoji => remove (toggle off)
          message.reactions.splice(existingIdx, 1);
        } else {
          // Different emoji => replace
          message.reactions[existingIdx].type = type;
        }
      } else {
        // No prior reaction => add
        message.reactions.push({ user: socket.user.id, type });
      }

      await message.save();

      const populated = await Message.findById(messageId)
        .select("reactions")
        .populate("reactions.user", "_id username profilePicture")
        .lean();

      if (!populated) return;

      const payload = {
        messageId: message._id,
        reactions: populated.reactions, // fully populated
        conversationId,
      };

      // Conversation room: catches both users while they're inside the chat
      io.to(`conversation:${conversationId}`).emit("message:reaction", payload);
      ack?.({ ok: true });

      // Personal rooms: catches users on other screens (belt-and-suspenders)
      conversation.participants.forEach((participantId) => {
        // personal-room delivery too
        // io.to(participantId.toString()).emit("message:reaction", payload);
      });
    } catch (err) {
      console.error("message:react error:", err);
      ack?.({ error: "Failed to process reaction" }); // <= triggers client rollback
      socket.emit("error", { message: "Failed to process reaction" });
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Remove this specific connection
    onlineUsersMap.delete(socket.id);

    // Check if the user has any OTHER active connections
    const isStillConnected = Array.from(onlineUsersMap.values()).includes(
      currentUserId,
    );

    if (!isStillConnected) {
      // Only broadcast offline if ALL their devices are gone
      socket.broadcast.emit("user:offline", { userId: currentUserId });
    }
  });
});

// PROCESS GUARDS
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 Unhandled Rejection:", err);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
