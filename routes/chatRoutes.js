const express = require("express");
const {
  sendMessage,
  getChatHistory,
  getUsers,
  getUnreadCounts,
} = require("../controllers/chatController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// All chat routes require a valid JWT
router.get("/users", protect, getUsers);
router.get("/unread-counts", protect, getUnreadCounts);
router.post("/send", protect, sendMessage);
router.get("/history/:receiverId", protect, getChatHistory);

module.exports = router;