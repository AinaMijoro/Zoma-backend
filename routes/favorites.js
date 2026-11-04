
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Favorite = require("../models/favorites");
const Activity = require("../models/activities");
const Product = require("../models/products");
const { requireAuth } = require("../middleware/auth");

// Vérifier que l'utilisateur possède le profil prospect
function requireProspect(req, res, next) {
    if (!req.user.profiles?.includes("cherche")) {
        return res.status(403).json({
            message: "Cette fonctionnalité est réservée au profil prospect.",
        });
    }

    next();
}

// Toutes les routes de favoris nécessitent une connexion
router.use(requireAuth, requireProspect);


// ==========================================
// AJOUTER UN MARCHAND AUX FAVORIS
// ==========================================

router.post("/activity/:activityId", async (req, res) => {
    try {
        const { activityId } = req.params;

        if (!mongoose.isValidObjectId(activityId)) {
            return res.status(400).json({
                message: "Identifiant du marchand invalide.",
            });
        }

        const activity = await Activity.findOne({
            _id: activityId,
            status: "approved",
        });

        if (!activity) {
            return res.status(404).json({
                message: "Marchand introuvable ou non approuvé.",
            });
        }

        const favorite = await Favorite.create({
            userId: req.user.id,
            type: "activity",
            activityId: activity._id,
        });

        return res.status(201).json({
            message: "Marchand ajouté aux favoris.",
            favorite,
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Ce marchand est déjà dans tes favoris.",
            });
        }

        console.error("Erreur ajout favori marchand :", error);

        return res.status(500).json({
            message: "Impossible d'ajouter ce marchand aux favoris.",
        });
    }
});


// ==========================================
// RETIRER UN MARCHAND DES FAVORIS
// ==========================================

router.delete("/activity/:activityId", async (req, res) => {
    try {
        const { activityId } = req.params;

        if (!mongoose.isValidObjectId(activityId)) {
            return res.status(400).json({
                message: "Identifiant du marchand invalide.",
            });
        }

        await Favorite.findOneAndDelete({
            userId: req.user.id,
            type: "activity",
            activityId,
        });

        return res.status(200).json({
            message: "Marchand retiré des favoris.",
        });

    } catch (error) {
        console.error("Erreur suppression favori marchand :", error);

        return res.status(500).json({
            message: "Impossible de retirer ce marchand des favoris.",
        });
    }
});


// ==========================================
// AJOUTER UN PRODUIT AUX FAVORIS
// ==========================================

router.post("/product/:productId", async (req, res) => {
    try {
        const { productId } = req.params;

        if (!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({
                message: "Identifiant du produit invalide.",
            });
        }

        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                message: "Produit introuvable.",
            });
        }

        const activity = await Activity.findOne({
            _id: product.activityId,
            status: "approved",
        });

        if (!activity) {
            return res.status(404).json({
                message: "Ce produit n'est pas disponible.",
            });
        }

        const favorite = await Favorite.create({
            userId: req.user.id,
            type: "product",
            productId: product._id,
        });

        return res.status(201).json({
            message: "Produit ajouté aux favoris.",
            favorite,
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Ce produit est déjà dans tes favoris.",
            });
        }

        console.error("Erreur ajout favori produit :", error);

        return res.status(500).json({
            message: "Impossible d'ajouter ce produit aux favoris.",
        });
    }
});


// ==========================================
// RETIRER UN PRODUIT DES FAVORIS
// ==========================================

router.delete("/product/:productId", async (req, res) => {
    try {
        const { productId } = req.params;

        if (!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({
                message: "Identifiant du produit invalide.",
            });
        }

        await Favorite.findOneAndDelete({
            userId: req.user.id,
            type: "product",
            productId,
        });

        return res.status(200).json({
            message: "Produit retiré des favoris.",
        });

    } catch (error) {
        console.error("Erreur suppression favori produit :", error);

        return res.status(500).json({
            message: "Impossible de retirer ce produit des favoris.",
        });
    }
});


// ==========================================
// RÉCUPÉRER LES FAVORIS DU PROSPECT
// ==========================================


router.get("/", async (req, res) => {
  try {
    const [favoriteActivities, favoriteProducts] = await Promise.all([
      Favorite.find({
        userId: req.user.id,
        type: "activity",
      })
        .populate({
          path: "activityId",
          match: { status: "approved" },
          select: "name specialty status",
        })
        .sort({ createdAt: -1 })
        .lean(),

      Favorite.find({
        userId: req.user.id,
        type: "product",
      })
        .populate({
          path: "productId",
          select: "name description price currency activityId userId",
          populate: {
            path: "activityId",
            match: { status: "approved" },
            select: "name specialty status",
          },
        })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    return res.status(200).json({
      activities: favoriteActivities.filter(
        (item) => item.activityId
      ),
      products: favoriteProducts.filter(
        (item) => item.productId && item.productId.activityId
      ),
    });
  } catch (error) {
    console.error("Erreur récupération favoris :", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la récupération des favoris.",
    });
  }
});


module.exports = router;
