
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/users');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
// Inscription d'un nouvel utilisateur
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Vérifier que tous les champs sont remplis
    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Le nom, l’email et le mot de passe sont obligatoires.'
      });
    }

    // Vérifier que l'email n'est pas déjà utilisé
    const existingUser = await User.findOne({
      email: email.trim().toLowerCase()
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'Cette adresse email est déjà utilisée.'
      });
    }

    // Hacher le mot de passe avant de l'enregistrer
    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword
    });
    const token = jwt.sign(
      { userId: newUser._id },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    return res.status(201).json({
      message: 'Compte créé avec succès.',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Cette adresse email est déjà utilisée.'
      });
    }

    console.error('Erreur inscription :', error.message);

    return res.status(500).json({
      message: 'Une erreur est survenue lors de la création du compte.'
    });
  }
});

// Connexion d'un utilisateur existant
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'L’email et le mot de passe sont obligatoires.'
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase()
    });

    if (!user) {
      return res.status(401).json({
        message: 'Email ou mot de passe incorrect.'
      });
    }

    const passwordIsValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordIsValid) {
      return res.status(401).json({
        message: 'Email ou mot de passe incorrect.'
      });
    }

    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    return res.status(200).json({
      message: 'Connexion réussie.',
      token,
      user: {
        id: user._id,
        name: user.name,
        merchantName: user.merchantName,
        normalizedMerchantName: user.normalizedMerchantName,
        email: user.email,
        profiles: user.profiles,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erreur connexion :', error.message);

    return res.status(500).json({
      message: 'Une erreur est survenue lors de la connexion.'
    });
  }
});

// Enregistrer le nom commercial une seule fois
router.patch('/merchant-name', requireAuth, async (req, res) => {
  try {
    const { merchantName } = req.body;

    if (typeof merchantName !== 'string' || !merchantName.trim()) {
      return res.status(400).json({
        message: 'Le nom commercial est obligatoire.'
      });
    }

    if (req.user.role !== 'user' || !req.user.profiles.includes('propose')) {
      return res.status(403).json({
        message: 'Seuls les commerçants peuvent enregistrer un nom commercial.'
      });
    }

    if (req.user.merchantName) {
      return res.status(409).json({
        message: 'Ton nom commercial est déjà enregistré et ne peut pas être modifié.'
      });
    }

    const normalizedMerchantName = merchantName.trim().toLowerCase();

    const existingMerchant = await User.findOne({
      normalizedMerchantName
    });

    if (existingMerchant) {
      return res.status(409).json({
        message: 'Ce nom commercial est déjà utilisé.'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        merchantName: merchantName.trim(),
        normalizedMerchantName
      },
      { new: true, runValidators: true }
    ).select('-password');

    return res.status(200).json({
      message: 'Nom commercial enregistré avec succès.',
      user
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Ce nom commercial est déjà utilisé.'
      });
    }

    console.error('Erreur nom commercial :', error.message);

    return res.status(500).json({
      message: 'Une erreur est survenue lors de l’enregistrement du nom commercial.'
    });
  }
});
router.patch('/:userId/profile', requireAuth, async (req, res) => {
  try {
    const { profiles } = req.body;

    // Vérifier que les profils sont valides
    if (
      !Array.isArray(profiles) ||
      profiles.length === 0 ||
      !profiles.every(profile => ['cherche', 'propose'].includes(profile)) ||
      new Set(profiles).size !== profiles.length
    ) {
      return res.status(400).json({
        message: 'Choisis au moins un profil valide : "cherche" ou "propose".'
      });
    }

    // Vérifier que l'utilisateur modifie son propre compte
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({
        message: 'Tu ne peux modifier que tes propres profils.'
      });
    }

    // Enregistrer les profils
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { profiles },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        message: 'Utilisateur introuvable.'
      });
    }

    return res.status(200).json({
      message: 'Profils enregistrés avec succès.',
      user
    });

  } catch (error) {
    console.error('Erreur enregistrement profils :', error.message);

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: 'Identifiant utilisateur invalide.'
      });
    }

    return res.status(500).json({
      message: 'Une erreur est survenue lors de l’enregistrement des profils.'
    });
  }
});
module.exports = router;
