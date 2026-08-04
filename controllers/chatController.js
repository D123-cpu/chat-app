const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");

// Finds an existing 1-to-1 conversation between two users, or creates one.
// Exported so the Socket.io handler can reuse the same logic.
const findOrCreateConversation = async (userA, userB) => {
  let conversation = await Conversation.findOne({
    participants: { $all: [userA, userB], $size: 2 },
  });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [userA, userB],
    });
  }

  return conversation;
};

// @route  POST /api/chat/send
// @desc   Send a message to another user (also usable as a REST fallback to Socket.io)
const sendMessage = async (req, res, next) => {
  try {
    const senderId = req.user.id;
    const { receiverId, content } = req.body;

    if (!receiverId || !content) {
      res.status(400);
      throw new Error("receiverId and content are required");
    }

    const conversation = await findOrCreateConversation(senderId, receiverId);

    const io = req.app.get("io");
    // Targeted room-membership check - safe, doesn't enumerate all rooms
    const delivered = !!io?.sockets.adapter.rooms.get(receiverId)?.size;

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

    // Also broadcast over Socket.io so the recipient sees it live,
    // even if this REST endpoint is used instead of the socket event.
    if (io) {
      io.to(receiverId).emit("receiveMessage", populatedMessage);
      io.to(senderId).emit("receiveMessage", populatedMessage);
    }

    res.status(201).json(populatedMessage);
  } catch (error) {
    next(error);
  }
};

// @route  GET /api/chat/history/:receiverId
// @desc   Get full chat history between the logged-in user and another user
const getChatHistory = async (req, res, next) => {
  try {
    const senderId = req.user.id;
    const { receiverId } = req.params;

    const conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId], $size: 2 },
    });

    // No conversation yet means no messages have been exchanged
    if (!conversation) {
      return res.status(200).json([]);
    }

    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: 1 }) // oldest first
      .populate("sender", "username email");

    res.status(200).json(messages);
  } catch (error) {
    next(error);
  }
};

// @route  GET /api/chat/users
// @desc   Get all users except the logged-in one, to populate the chat sidebar
const getUsers = async (req, res, next) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } }).select(
      "username email lastSeen"
    );
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};

// @route  GET /api/chat/unread-counts
// @desc   Get unread message counts grouped by sender, for sidebar badges
const getUnreadCounts = async (req, res, next) => {
  try {
    const receiverId = req.user.id;

    const counts = await Message.aggregate([
      {
        $match: {
          receiver: new mongoose.Types.ObjectId(receiverId),
          seen: false,
        },
      },
      { $group: { _id: "$sender", count: { $sum: 1 } } },
    ]);

    // Convert to a simple { senderId: count } object for the frontend
    const result = {};
    counts.forEach((c) => {
      result[c._id.toString()] = c.count;
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendMessage,
  getChatHistory,
  findOrCreateConversation,
  getUsers,
  getUnreadCounts,
};