
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Order = require("../models/orders");
const Product = require("../models/products");
const Activity = require("../models/activities");
const User = require("../models/users");
const { requireAuth } = require("../middleware/auth");


// Créer une commande
router.post("/", requireAuth, async (req, res) => {
    try {
        const { activityId, products } = req.body;
        const prospectId = req.user.id;

        if (
            !mongoose.isValidObjectId(activityId) ||
            !Array.isArray(products) ||
            products.length === 0
        ) {
            return res.status(400).json({
                message: "Activité ou produits invalides.",
            });
        }

        const activity = await Activity.findById(activityId);

        if (!activity || activity.status !== "approved") {
            return res.status(404).json({
                message: "Cette activité n'est pas disponible.",
            });
        }

        if (String(activity.userId) === String(prospectId)) {
            return res.status(403).json({
                message: "Vous ne pouvez pas commander auprès de votre propre activité.",
            });
        }

        const seller = await User.findById(activity.userId);

       if (!seller || !seller.profiles.includes("propose")) {
            return res.status(404).json({
                message: "Prestataire introuvable ou profil marchand indisponible.",
            });
        }

        const prospect = await User.findById(prospectId).select("name email");

        if (!prospect) {
            return res.status(404).json({
                message: "Prospect introuvable.",
            });
        }

        const productIds = products.map((item) => item.productId);

        if (
            productIds.some((id) => !mongoose.isValidObjectId(id)) ||
            new Set(productIds.map(String)).size !== productIds.length
        ) {
            return res.status(400).json({
                message: "La sélection des produits est invalide.",
            });
        }

        const databaseProducts = await Product.find({
            _id: { $in: productIds },
            activityId: activity._id,
            userId: activity.userId,
        });

        if (databaseProducts.length !== productIds.length) {
            return res.status(400).json({
                message: "Un ou plusieurs produits ne sont plus disponibles.",
            });
        }

        const databaseProductsById = new Map(
            databaseProducts.map((product) => [String(product._id), product])
        );

        const orderProducts = [];

        for (const selected of products) {
            const product = databaseProductsById.get(String(selected.productId));
            const quantity = Number(selected.quantity);

            if (!Number.isSafeInteger(quantity) || quantity < 1) {
                return res.status(400).json({
                    message: "Chaque quantité doit être un nombre entier supérieur à zéro.",
                });
            }

            orderProducts.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                currency: product.currency,
                quantity,
            });
        }

        const totalsByCurrency = {};

        for (const product of orderProducts) {
            totalsByCurrency[product.currency] =
                (totalsByCurrency[product.currency] || 0) +
                product.price * product.quantity;
        }

        const order = await Order.create({
            prospectId,
            sellerId: activity.userId,
            activityId: activity._id,
            products: orderProducts,
            totalsByCurrency,
        });



        return res.status(201).json({
            message: "Commande enregistrée avec succès.",
            order: {
                id: order._id,
                status: order.status,
                activityName: activity.name,
                prospectName: prospect.name,
                prospectEmail: prospect.email,
                products: order.products,
                totalsByCurrency: Object.fromEntries(order.totalsByCurrency),
                createdAt: order.createdAt,
            },
        });
    } catch (error) {
        console.error("Erreur lors de la création de la commande :", error);

        return res.status(500).json({
            message: "Erreur serveur lors de la création de la commande.",
        });
    }
});

// Récupérer toutes les commandes du commerçant connecté
router.get("/mine", requireAuth, async (req, res) => {
    try {
        const orders = await Order.find({
            sellerId: req.user.id,
        })
            .populate("prospectId", "name email")
            .populate("activityId", "name")
            .sort({ createdAt: -1 });

        return res.status(200).json(orders);
    } catch (error) {
        console.error("Erreur lors de la récupération des commandes :", error);

        return res.status(500).json({
            message: "Erreur serveur lors de la récupération des commandes.",
        });
    }
});
// Récupérer toutes les commandes du prospect connecté
router.get("/my-orders", requireAuth, async (req, res) => {
    try {
        const orders = await Order.find({
            prospectId: req.user.id,
        })
            .populate("sellerId", "name email")
            .populate("activityId", "name")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json(orders);
    } catch (error) {
        console.error(
            "Erreur lors de la récupération des commandes du prospect :",
            error
        );

        return res.status(500).json({
            message: "Erreur serveur lors de la récupération des commandes.",
        });
    }
});
// Récupérer le détail d'une commande appartenant au commerçant connecté
router.get("/:orderId", requireAuth, async (req, res) => {
    try {
        const { orderId } = req.params;

        if (!mongoose.isValidObjectId(orderId)) {
            return res.status(400).json({
                message: "Identifiant de commande invalide.",
            });
        }

        const order = await Order.findOne({
            _id: orderId,
            sellerId: req.user.id,
        })
            .populate("prospectId", "name email")
            .populate("activityId", "name");

        if (!order) {
            return res.status(404).json({
                message: "Commande introuvable.",
            });
        }

        return res.status(200).json(order);
    } catch (error) {
        console.error("Erreur lors de la récupération de la commande :", error);

        return res.status(500).json({
            message: "Erreur serveur lors de la récupération de la commande.",
        });
    }
});

// Modifier le statut d'une commande
router.patch("/:orderId/status", requireAuth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        if (!mongoose.isValidObjectId(orderId)) {
            return res.status(400).json({
                message: "Identifiant de commande invalide.",
            });
        }

        const allowedStatuses = ["accepted", "rejected", "completed"];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                message: "Statut de commande invalide.",
            });
        }

        const order = await Order.findOne({
            _id: orderId,
            sellerId: req.user.id,
        });

        if (!order) {
            return res.status(404).json({
                message: "Commande introuvable.",
            });
        }

        const validTransitions = {
            pending: ["accepted", "rejected"],
            accepted: ["completed"],
            rejected: [],
            completed: [],
        };

        if (!validTransitions[order.status].includes(status)) {
            return res.status(400).json({
                message: "Cette modification du statut n'est pas autorisée.",
            });
        }

        order.status = status;
        await order.save();

        return res.status(200).json({
            message: "Statut de la commande mis à jour.",
            order,
        });
    } catch (error) {
        console.error("Erreur lors de la modification du statut :", error);

        return res.status(500).json({
            message: "Erreur serveur lors de la modification du statut.",
        });
    }
});

module.exports = router;
