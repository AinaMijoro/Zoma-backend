
const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: ["activity", "product"],
      required: true,
    },

    activityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Activity",
      default: null,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Un prospect ne peut enregistrer deux fois
// la même activité parmi ses favoris.
favoriteSchema.index(
  { userId: 1, activityId: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "activity" },
  }
);

// Un prospect ne peut enregistrer deux fois
// le même produit parmi ses favoris.
favoriteSchema.index(
  { userId: 1, productId: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "product" },
  }
);
// Accélérer la récupération et le tri des favoris
favoriteSchema.index({
  userId: 1,
  type: 1,
  createdAt: -1,
});
module.exports = mongoose.model("Favorite", favoriteSchema);
