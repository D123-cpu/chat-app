const jwt = require("jsonwebtoken");
const Message = require("../models/Message");
const User = require("../models/User");
const { findOrCreateConversation } = require("../controllers/chatController");

// Tracks which users are currently online.
// Maps userId -> number of active socket connections (handles multiple tabs).
// Kept local to this module (not exported) to avoid a circular require with
// chatController.js, which imports findOrCreateConversation from here... wait,
// the other way around: this file imports FROM chatController, so chatController
// must never import from this file.
const onlineUsers = new Map();

// Sets up all Socket.io event listeners
const initSocket = (io) => {
  // Middleware: authenticate every socket connection using the JWT
  // Client must connect like: io(URL, { auth: { token: "<jwt>" } })
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Not authorized, no token provided"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id; // Attach user id to the socket
      next();
    } catch (error) {
      next(new Error("Not authorized, token invalid or expired"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    console.log(`User connected: ${userId}`);

    // Each user joins a private room named after their own user id.
    // This lets us send messages/events directly to a specific user.
    socket.join(userId);

    // ---------- Online status ----------
    const wasOffline = !onlineUsers.has(userId);
    onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);

    // Tell the newly connected client who's currently online
    socket.emit("onlineUsers", Array.from(onlineUsers.keys()));

    // If this is the user's first connection (not just another tab), tell everyone else
    if (wasOffline) {
      socket.broadcast.emit("userOnline", userId);
    }

    // ---------- Sync delivery status ----------
    // Any messages sent to this user while they were offline are now
    // "delivered". Mark them and let each original sender know.
    try {
      const undeliveredSenderIds = await Message.find({
        receiver: userId,
        delivered: false,
      }).distinct("sender");

      if (undeliveredSenderIds.length > 0) {
        await Message.updateMany(
          { receiver: userId, delivered: false },
          { $set: { delivered: true } }
        );

        undeliveredSenderIds.forEach((senderId) => {
          io.to(senderId.toString()).emit("messagesDelivered", { by: userId });
        });
      }
    } catch (error) {
      // Non-critical - ignore
    }

    // Listen for an outgoing message from the client
    socket.on("sendMessage", async ({ receiverId, content }) => {
      try {
        if (!receiverId || !content) return;

        const senderId = socket.userId;

        const conversation = await findOrCreateConversation(
          senderId,
          receiverId
        );

        // If the receiver is online right now, the message counts as
        // delivered immediately (they'll get it via the emit below).
        const delivered = onlineUsers.has(receiverId);

        const message = await Message.create({
          conversation: conversation._id,
          sender: senderId,
          receiver: receiverId,
          content,
          delivered,
        });

        const populatedMessage = await message.populate(
          "sender",
          "username email"
        );

        // Send to the receiver (if they're online) and back to the sender
        // so both sides update in real time.
        io.to(receiverId).emit("receiveMessage", populatedMessage);
        io.to(senderId).emit("receiveMessage", populatedMessage);
      } catch (error) {
        socket.emit("errorMessage", { message: "Message could not be sent" });
      }
    });

    // ---------- Read receipts ----------
    // Client calls this when it opens/focuses a conversation with `senderId`.
    // Marks all their unseen messages to us as seen, and tells them so.
    socket.on("markAsSeen", async ({ senderId }) => {
      try {
        if (!senderId) return;

        const receiverId = socket.userId;

        const result = await Message.updateMany(
          { sender: senderId, receiver: receiverId, seen: false },
          { $set: { seen: true, delivered: true } }
        );

        // Only notify the original sender if something actually changed
        if (result.modifiedCount > 0) {
          io.to(senderId).emit("messagesSeen", { by: receiverId });
        }
      } catch (error) {
        // Silently ignore - read receipts are non-critical
      }
    });

    // ---------- Typing indicator ----------
    socket.on("typing", ({ receiverId }) => {
      if (!receiverId) return;
      io.to(receiverId).emit("typing", { from: socket.userId });
    });

    socket.on("stopTyping", ({ receiverId }) => {
      if (!receiverId) return;
      io.to(receiverId).emit("stopTyping", { from: socket.userId });
    });

    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${userId}`);

      const remaining = (onlineUsers.get(userId) || 1) - 1;

      if (remaining <= 0) {
        onlineUsers.delete(userId);

        // Persist last seen time and tell everyone else this user went offline
        try {
          const lastSeen = new Date();
          await User.findByIdAndUpdate(userId, { lastSeen });
          socket.broadcast.emit("userOffline", { userId, lastSeen });
        } catch (error) {
          // Non-critical - ignore
        }
      } else {
        onlineUsers.set(userId, remaining);
      }
    });
  });
};

module.exports = initSocket;