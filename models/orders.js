
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    prospectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    activityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
    },
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        currency: {
          type: String,
          enum: ["EUR", "MGA"],
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],
    totalsByCurrency: {
      type: Map,
      of: Number,
      default: {},
    },
    status: {
  type: String,
  enum: ["pending", "accepted", "rejected", "completed"],
  default: "pending",
},
  },
  {
    timestamps: true,
  }
);
// Accélérer les commandes du prospect
orderSchema.index({ prospectId: 1, createdAt: -1 });

// Accélérer les commandes du vendeur
orderSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
