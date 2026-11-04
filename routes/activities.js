
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Activity = require('../models/activities');
const User = require('../models/users');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const validCountries = ['France', 'Madagascar'];

const validParcelDirections = [
  'france_to_madagascar',
  'madagascar_to_france'
];

const validDeliveryTypes = [
  'free',
  'free_over_minimum',
  'flat_fee',
  'none'
];

function isStringArray(value) {
  return Array.isArray(value) &&
    value.every(item =>
      typeof item === 'string' && item.trim().length > 0
    );
}

// Enregistrer une nouvelle activité
// Créer une activité pour le commerçant connecté
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      specialty,
      countries,
      frenchDepartments,
      frenchCities,
      madagascarCities,
      parcelDirections,
      deliveries
    } = req.body;

    // Vérifier que le compte connecté existe
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: 'Utilisateur introuvable.'
      });
    }

    // Seuls les comptes utilisateurs ayant le profil propose peuvent créer une activité
    if (
      user.role !== 'user' ||
      !user.profiles.includes('propose')
    ) {
      return res.status(403).json({
        message: 'Tu dois avoir un profil commerçant pour créer une activité.'
      });
    }

    // Vérifier que le nom commercial est enregistré
    if (!user.merchantName) {
      return res.status(400).json({
        message: 'Tu dois d’abord enregistrer ton nom commercial.'
      });
    }

    // Vérifier la spécialité
    if (
      typeof specialty !== 'string' ||
      !specialty.trim()
    ) {
      return res.status(400).json({
        message: 'La spécialité de l’activité est obligatoire.'
      });
    }

    // Vérifier les pays
    if (
      !Array.isArray(countries) ||
      countries.length === 0 ||
      !countries.every(country => validCountries.includes(country)) ||
      new Set(countries).size !== countries.length
    ) {
      return res.status(400).json({
        message: 'Sélectionne au moins un pays valide.'
      });
    }

    // Vérifier les tableaux de zones
    if (
      !isStringArray(frenchDepartments) ||
      !isStringArray(frenchCities) ||
      !isStringArray(madagascarCities) ||
      !isStringArray(parcelDirections)
    ) {
      return res.status(400).json({
        message: 'Les zones et directions renseignées sont invalides.'
      });
    }

    // Vérifier que les zones correspondent aux pays sélectionnés
    if (
      !countries.includes('France') &&
      (frenchDepartments.length > 0 || frenchCities.length > 0)
    ) {
      return res.status(400).json({
        message: 'Les zones françaises nécessitent la sélection de la France.'
      });
    }

    if (
      !countries.includes('Madagascar') &&
      madagascarCities.length > 0
    ) {
      return res.status(400).json({
        message: 'Les villes malgaches nécessitent la sélection de Madagascar.'
      });
    }

    // Vérifier les directions de colis
    if (
      !parcelDirections.every(direction =>
        validParcelDirections.includes(direction)
      ) ||
      new Set(parcelDirections).size !== parcelDirections.length
    ) {
      return res.status(400).json({
        message: 'Une ou plusieurs directions de colis sont invalides.'
      });
    }

    const isParcelService =
      specialty.trim() === 'Envoi de colis France ↔ Madagascar';

    if (isParcelService && parcelDirections.length === 0) {
      return res.status(400).json({
        message: 'Sélectionne au moins une direction pour le service de colis.'
      });
    }

    if (!isParcelService && parcelDirections.length > 0) {
      return res.status(400).json({
        message: 'Les directions de colis sont réservées au service d’envoi de colis.'
      });
    }

    // Vérifier les conditions de livraison
    // Vérifier les configurations de livraison par pays
    if (!Array.isArray(deliveries) || deliveries.length !== countries.length) {
      return res.status(400).json({
        message: 'Une configuration de livraison est nécessaire pour chaque pays sélectionné.'
      });
    }

    const configuredCountries = [];

    for (const item of deliveries) {
      if (
        !item ||
        !countries.includes(item.country) ||
        configuredCountries.includes(item.country)
      ) {
        return res.status(400).json({
          message: 'Les pays des configurations de livraison sont invalides ou en doublon.'
        });
      }

      configuredCountries.push(item.country);

      const expectedCurrency =
        item.country === 'France' ? 'EUR' : 'MGA';

      if (item.currency !== expectedCurrency) {
        return res.status(400).json({
          message: `La devise de livraison pour ${item.country} doit être ${expectedCurrency}.`
        });
      }

      if (!validDeliveryTypes.includes(item.type)) {
        return res.status(400).json({
          message: 'Une condition de livraison est invalide.'
        });
      }

      if (
        item.type === 'free_over_minimum' &&
        (
          typeof item.minimumAmount !== 'number' ||
          !Number.isFinite(item.minimumAmount) ||
          item.minimumAmount <= 0
        )
      ) {
        return res.status(400).json({
          message: `Le montant minimum pour ${item.country} doit être supérieur à zéro.`
        });
      }

      if (
        item.type === 'flat_fee' &&
        (
          typeof item.fee !== 'number' ||
          !Number.isFinite(item.fee) ||
          item.fee < 0
        )
      ) {
        return res.status(400).json({
          message: `Les frais de livraison pour ${item.country} sont invalides.`
        });
      }
    }

    // Créer l’activité avec le nom commercial du compte connecté
    const activity = await Activity.create({
      userId: user._id,
      name: user.merchantName,
      specialty: specialty.trim(),
      countries,
      frenchDepartments,
      frenchCities,
      madagascarCities,
      parcelDirections: isParcelService ? parcelDirections : [],
      deliveries: deliveries.map(item => ({
        country: item.country,
        currency: item.currency,
        type: item.type,
        minimumAmount:
          item.type === 'free_over_minimum'
            ? item.minimumAmount
            : undefined,
        fee:
          item.type === 'flat_fee'
            ? item.fee
            : undefined
      }))
    });

    return res.status(201).json({
      message: 'Activité créée avec succès. Elle est en attente de validation.',
      activity
    });

  } catch (error) {
    console.error('Erreur création activité :', error.message);

    return res.status(500).json({
      message: 'Une erreur est survenue lors de la création de l’activité.'
    });
  }
});

// Récupérer les activités approuvées du marchand connecté
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const activities = await Activity.find({
      userId: req.user.id
    }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({ activities });

  } catch (error) {
    console.error(
      'Erreur récupération activités du marchand :',
      error.message
    );

    return res.status(500).json({
      message: 'Impossible de récupérer tes activités.'
    });
  }
});

// Modifier une activité appartenant au marchand connecté
router.patch('/:activityId', requireAuth, async (req, res) => {
  try {
    const { activityId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(activityId)) {
      return res.status(400).json({
        message: 'Identifiant d’activité invalide.'
      });
    }

    const user = await User.findById(req.user.id);

    if (
      !user ||
      user.role !== 'user' ||
      !user.profiles.includes('propose')
    ) {
      return res.status(403).json({
        message: 'Accès réservé aux comptes commerçants.'
      });
    }

    // Vérifier que l'activité appartient bien au marchand connecté
    const activity = await Activity.findOne({
      _id: activityId,
      userId: user._id
    });

    if (!activity) {
      return res.status(404).json({
        message: 'Activité introuvable ou accès non autorisé.'
      });
    }

    const {
      specialty,
      countries,
      frenchDepartments,
      frenchCities,
      madagascarCities,
      parcelDirections,
      deliveries
    } = req.body;

    // Vérifier la spécialité
    if (
      typeof specialty !== 'string' ||
      !specialty.trim()
    ) {
      return res.status(400).json({
        message: 'La spécialité est obligatoire.'
      });
    }

    // Vérifier les pays
    if (
      !Array.isArray(countries) ||
      countries.length === 0 ||
      !countries.every(country => validCountries.includes(country)) ||
      new Set(countries).size !== countries.length
    ) {
      return res.status(400).json({
        message: 'Sélectionne au moins un pays valide.'
      });
    }

    // Vérifier les tableaux
    if (
      !isStringArray(frenchDepartments) ||
      !isStringArray(frenchCities) ||
      !isStringArray(madagascarCities) ||
      !isStringArray(parcelDirections)
    ) {
      return res.status(400).json({
        message: 'Les zones et directions renseignées sont invalides.'
      });
    }

    // Vérifier la cohérence des zones
    if (
      !countries.includes('France') &&
      (frenchDepartments.length > 0 || frenchCities.length > 0)
    ) {
      return res.status(400).json({
        message: 'Les zones françaises nécessitent la sélection de la France.'
      });
    }

    if (
      !countries.includes('Madagascar') &&
      madagascarCities.length > 0
    ) {
      return res.status(400).json({
        message: 'Les villes malgaches nécessitent la sélection de Madagascar.'
      });
    }

    // Vérifier les directions de colis
    if (
      !parcelDirections.every(direction =>
        validParcelDirections.includes(direction)
      ) ||
      new Set(parcelDirections).size !== parcelDirections.length
    ) {
      return res.status(400).json({
        message: 'Une ou plusieurs directions de colis sont invalides.'
      });
    }

    const isParcelService =
      specialty.trim() === 'Envoi de colis France ↔ Madagascar';

    if (isParcelService && parcelDirections.length === 0) {
      return res.status(400).json({
        message: 'Sélectionne au moins une direction pour le service de colis.'
      });
    }

    if (!isParcelService && parcelDirections.length > 0) {
      return res.status(400).json({
        message: 'Les directions de colis sont réservées au service d’envoi de colis.'
      });
    }

    // Vérifier les conditions de livraison
    if (
      !Array.isArray(deliveries) ||
      deliveries.length !== countries.length
    ) {
      return res.status(400).json({
        message: 'Une configuration de livraison est nécessaire pour chaque pays sélectionné.'
      });
    }

    const configuredCountries = [];

    for (const item of deliveries) {
      if (
        !item ||
        !countries.includes(item.country) ||
        configuredCountries.includes(item.country)
      ) {
        return res.status(400).json({
          message: 'Les pays des configurations de livraison sont invalides ou en doublon.'
        });
      }

      configuredCountries.push(item.country);

      const expectedCurrency =
        item.country === 'France' ? 'EUR' : 'MGA';

      if (item.currency !== expectedCurrency) {
        return res.status(400).json({
          message: `La devise de livraison pour ${item.country} doit être ${expectedCurrency}.`
        });
      }

      if (!validDeliveryTypes.includes(item.type)) {
        return res.status(400).json({
          message: 'Une condition de livraison est invalide.'
        });
      }

      if (
        item.type === 'free_over_minimum' &&
        (
          typeof item.minimumAmount !== 'number' ||
          !Number.isFinite(item.minimumAmount) ||
          item.minimumAmount <= 0
        )
      ) {
        return res.status(400).json({
          message: `Le montant minimum pour ${item.country} doit être supérieur à zéro.`
        });
      }

      if (
        item.type === 'flat_fee' &&
        (
          typeof item.fee !== 'number' ||
          !Number.isFinite(item.fee) ||
          item.fee < 0
        )
      ) {
        return res.status(400).json({
          message: `Les frais de livraison pour ${item.country} sont invalides.`
        });
      }
    }

    if (
      configuredCountries.length !== countries.length ||
      !countries.every(country => configuredCountries.includes(country))
    ) {
      return res.status(400).json({
        message: 'Chaque pays doit avoir sa configuration de livraison.'
      });
    }

    // Mettre à jour uniquement les champs autorisés
    const wasApproved = activity.status === 'approved';

    activity.specialty = specialty.trim();
    activity.countries = countries;
    activity.frenchDepartments = frenchDepartments;
    activity.frenchCities = frenchCities;
    activity.madagascarCities = madagascarCities;
    activity.parcelDirections = isParcelService
      ? parcelDirections
      : [];

    activity.deliveries = deliveries.map(item => ({
      country: item.country,
      currency: item.currency,
      type: item.type,
      minimumAmount:
        item.type === 'free_over_minimum'
          ? item.minimumAmount
          : undefined,
      fee:
        item.type === 'flat_fee'
          ? item.fee
          : undefined
    }));

    // Une activité approuvée doit être vérifiée à nouveau
    if (wasApproved) {
      activity.status = 'pending';
    }

    await activity.save();

    return res.status(200).json({
      message: wasApproved
        ? 'Activité modifiée. Elle est de nouveau en attente de validation.'
        : 'Activité modifiée avec succès.',
      activity
    });

  } catch (error) {
    console.error('Erreur modification activité :', error);

    return res.status(500).json({
      message: 'Une erreur est survenue lors de la modification de l’activité.'
    });
  }
});

// Récupérer les activités en attente de validation
router.get('/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const activities = await Activity.find({ status: 'pending' })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ activities });

  } catch (error) {
    console.error(
      'Erreur récupération activités en attente :',
      error.message
    );

    return res.status(500).json({
      message: 'Impossible de récupérer les activités en attente.'
    });
  }
});

// Approuver une activité
router.patch('/:activityId/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { activityId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(activityId)) {
      return res.status(400).json({
        message: 'Identifiant d’activité invalide.'
      });
    }

    const activity = await Activity.findOneAndUpdate(
      { _id: activityId, status: 'pending' },
      { $set: { status: 'approved' } },
      { new: true, runValidators: true }
    );

    if (!activity) {
      return res.status(404).json({
        message: 'Activité introuvable ou déjà traitée.'
      });
    }

    return res.status(200).json({
      message: 'Activité approuvée avec succès.',
      activity
    });

  } catch (error) {
    console.error('Erreur approbation activité :', error.message);

    return res.status(500).json({
      message: 'Une erreur est survenue lors de l’approbation de l’activité.'
    });
  }
});
// Rejeter une activité
router.patch('/:activityId/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { activityId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(activityId)) {
      return res.status(400).json({
        message: 'Identifiant d’activité invalide.'
      });
    }

    const activity = await Activity.findOneAndUpdate(
      { _id: activityId, status: 'pending' },
      { $set: { status: 'rejected' } },
      { new: true, runValidators: true }
    );

    if (!activity) {
      return res.status(404).json({
        message: 'Activité introuvable ou déjà traitée.'
      });
    }

    return res.status(200).json({
      message: 'Activité refusée avec succès.',
      activity
    });

  } catch (error) {
    console.error('Erreur refus activité :', error.message);

    return res.status(500).json({
      message: 'Une erreur est survenue lors du refus de l’activité.'
    });
  }
});
// Récupérer les activités approuvées pour la recherche
router.get('/', async (req, res) => {
  try {
    const activities = await Activity.find({ status: 'approved' })
      .select(
        'name specialty countries frenchDepartments frenchCities madagascarCities parcelDirections delivery userId createdAt'
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ activities });

  } catch (error) {
    console.error('Erreur récupération activités :', error.message);

    return res.status(500).json({
      message: 'Impossible de récupérer les activités pour le moment.'
    });
  }
});

module.exports = router;
