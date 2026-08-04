const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    // Exactly two participants for one-to-one chat
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);