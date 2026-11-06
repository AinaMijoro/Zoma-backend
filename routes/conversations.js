
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

console.log("ROUTES CONVERSATIONS CHARGÉES");

const Conversation = require("../models/conversation");
const Message = require("../models/message");
const User = require("../models/users");
const Order = require("../models/orders");
const { requireAuth } = require("../middleware/auth");

// Créer ou retrouver une conversation
// Prospect : envoie merchantId
// Marchand : envoie orderId
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = String(req.user.id);
    const profiles = req.user.profiles || [];

    let prospectId;
    let merchantId;

    // Cas 1 : le prospect contacte un marchand
    if (profiles.includes("cherche")) {
      merchantId = req.body.merchantId;
      prospectId = userId;

      if (!mongoose.isValidObjectId(merchantId)) {
        return res.status(400).json({
          message: "Identifiant du marchand invalide.",
        });
      }

      if (String(merchantId) === userId) {
        return res.status(403).json({
          message: "Vous ne pouvez pas vous contacter vous-même.",
        });
      }
    }

    // Cas 2 : le marchand contacte le prospect à partir d'une commande
    else if (profiles.includes("propose")) {
      const { orderId } = req.body;

      if (!mongoose.isValidObjectId(orderId)) {
        return res.status(400).json({
          message: "Identifiant de commande invalide.",
        });
      }

      const order = await Order.findOne({
        _id: orderId,
        sellerId: userId,
      });

      if (!order) {
        return res.status(404).json({
          message: "Commande introuvable ou non autorisée.",
        });
      }

      prospectId = String(order.prospectId);
      merchantId = userId;
    } else {
      return res.status(403).json({
        message: "Profil non autorisé à démarrer une conversation.",
      });
    }

    // Vérifier les deux participants
    const prospect = await User.findOne({
      _id: prospectId,
      profiles: "cherche",
    }).select("_id name");

    if (!prospect) {
      return res.status(404).json({
        message: "Prospect introuvable.",
      });
    }

    const merchant = await User.findOne({
      _id: merchantId,
      profiles: "propose",
    }).select("_id name merchantName");

    if (!merchant) {
      return res.status(404).json({
        message: "Marchand introuvable.",
      });
    }

    // Retrouver la conversation existante ou la créer
    const conversation = await Conversation.findOneAndUpdate(
      { prospectId, merchantId },
      {
        $setOnInsert: { prospectId, merchantId },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json(conversation);
  } catch (error) {
    console.error("Erreur création conversation :", error);

    return res.status(500).json({
      message: "Erreur serveur.",
    });
  }
});

// Récupérer les conversations de l'utilisateur connecté
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      $or: [
        { prospectId: req.user.id },
        { merchantId: req.user.id },
      ],
    })
      .populate("prospectId", "name")
      .populate("merchantId", "name merchantName")
      .sort({ lastMessageAt: -1 })
      .lean();

    return res.status(200).json(conversations);
  } catch (error) {
    console.error("Erreur récupération conversations :", error);

    return res.status(500).json({
      message: "Erreur serveur.",
    });
  }
});

// Récupérer les messages d'une conversation
router.get("/:conversationId/messages", requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({
        message: "Identifiant de conversation invalide.",
      });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { prospectId: req.user.id },
        { merchantId: req.user.id },
      ],
    });

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation introuvable.",
      });
    }

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: req.user.id },
        readAt: null,
      },
      { $set: { readAt: new Date() } }
    );

    return res.status(200).json(messages);
  } catch (error) {
    console.error("Erreur récupération messages :", error);

    return res.status(500).json({
      message: "Erreur serveur.",
    });
  }
});

// Envoyer un message
router.post("/:conversationId/messages", requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const content =
      typeof req.body.content === "string"
        ? req.body.content.trim()
        : "";

    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({
        message: "Identifiant de conversation invalide.",
      });
    }

    if (!content || content.length > 2000) {
      return res.status(400).json({
        message: "Le message doit contenir entre 1 et 2000 caractères.",
      });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { prospectId: req.user.id },
        { merchantId: req.user.id },
      ],
    });

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation introuvable.",
      });
    }

    const message = await Message.create({
      conversationId,
      senderId: req.user.id,
      content,
    });

    conversation.lastMessage = content;
    conversation.lastMessageAt = message.createdAt;
    await conversation.save();

    const io = req.app.get("io");

    io.to(String(conversationId)).emit("newMessage", message);

    return res.status(201).json(message);
  } catch (error) {
    console.error("Erreur envoi message :", error);

    return res.status(500).json({
      message: "Erreur serveur.",
    });
  }
});

module.exports = router;
