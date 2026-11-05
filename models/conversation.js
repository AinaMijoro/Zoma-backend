const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    prospectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastMessage: {
      type: String,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Une seule conversation par couple prospect / marchand
conversationSchema.index(
  { prospectId: 1, merchantId: 1 },
  { unique: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);