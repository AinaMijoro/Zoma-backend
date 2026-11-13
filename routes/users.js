
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/users');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../mailer');

// Générer un access token JWT
const generateAccessToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET est absent des variables Render');
  }

  return jwt.sign(
    { userId: userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

// Générer un refresh token sécurisé
const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

// Hasher le refresh token
const hashRefreshToken = (token) => {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
};

// Durée de validité du refresh token
const getRefreshTokenExpiry = () => {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
};

// Créer une nouvelle session
const createSession = async (user) => {
  const token = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken();

  const sessionId = crypto.randomUUID();

  user.refreshTokens.push({
    sessionId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: getRefreshTokenExpiry()
  });

  await user.save();

  return {
    token,
    refreshToken
  };
};

// Inscription d'un nouvel utilisateur
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Le nom, l’email et le mot de passe sont obligatoires.'
      });
    }

    const existingUser = await User.findOne({
      email: email.trim().toLowerCase()
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'Cette adresse email est déjà utilisée.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword
    });

    const session = await createSession(newUser);

    return res.status(201).json({
      message: 'Compte créé avec succès.',
      token: session.token,
      refreshToken: session.refreshToken,
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

    const session = await createSession(user);

    return res.status(200).json({
      message: 'Connexion réussie.',
      token: session.token,
      refreshToken: session.refreshToken,
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

// Renouveler une session
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (
      typeof refreshToken !== 'string' ||
      !refreshToken
    ) {
      return res.status(400).json({
        message: 'Refresh token manquant.'
      });
    }

    const oldTokenHash = hashRefreshToken(refreshToken);

    const user = await User.findOne({
      'refreshTokens.tokenHash': oldTokenHash
    });

    if (!user) {
      return res.status(401).json({
        message: 'Session invalide ou expirée.'
      });
    }

    const session = user.refreshTokens.find(
      item => item.tokenHash === oldTokenHash
    );

    if (!session || session.expiresAt <= new Date()) {
      return res.status(401).json({
        message: 'Session invalide ou expirée.'
      });
    }

    const newRefreshToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newRefreshToken);
    const newExpiry = getRefreshTokenExpiry();

    // Rotation atomique du refresh token
    const updateResult = await User.updateOne(
      {
        _id: user._id,
        refreshTokens: {
          $elemMatch: {
            sessionId: session.sessionId,
            tokenHash: oldTokenHash,
            expiresAt: { $gt: new Date() }
          }
        }
      },
      {
        $set: {
          'refreshTokens.$.tokenHash': newTokenHash,
          'refreshTokens.$.expiresAt': newExpiry
        }
      }
    );

    if (updateResult.modifiedCount !== 1) {
      return res.status(401).json({
        message: 'Session invalide ou déjà renouvelée.'
      });
    }

    const newAccessToken = generateAccessToken(user._id);

    return res.status(200).json({
      token: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('Erreur renouvellement session :', error.message);

    return res.status(500).json({
      message: 'Impossible de renouveler la session.'
    });
  }
});

// Déconnexion et révocation de la session actuelle
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (
      typeof refreshToken !== 'string' ||
      !refreshToken
    ) {
      return res.status(400).json({
        message: 'Refresh token manquant.'
      });
    }

    const tokenHash = hashRefreshToken(refreshToken);

    await User.updateOne(
      { 'refreshTokens.tokenHash': tokenHash },
      {
        $pull: {
          refreshTokens: {
            tokenHash
          }
        }
      }
    );

    return res.status(200).json({
      message: 'Déconnexion réussie.'
    });

  } catch (error) {
    console.error('Erreur déconnexion :', error.message);

    return res.status(500).json({
      message: 'Impossible de terminer la déconnexion.'
    });
  }
});

// Demander la réinitialisation du mot de passe
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        message: 'Veuillez saisir une adresse email valide.'
      });
    }

    if (
      !process.env.RESEND_API_KEY ||
      !process.env.PASSWORD_RESET_URL
    ) {
      return res.status(503).json({
        message: 'La récupération du mot de passe sera bientôt disponible.'
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase()
    });

    const genericMessage =
      'Si cette adresse correspond à un compte, un lien de réinitialisation sera envoyé.';

    if (!user) {
      return res.status(200).json({
        message: genericMessage
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    user.resetPasswordTokenHash = resetTokenHash;
    user.resetPasswordExpires = new Date(
      Date.now() + 15 * 60 * 1000
    );

    await user.save();

    const separator = process.env.PASSWORD_RESET_URL.includes('?')
      ? '&'
      : '?';

    const resetLink =
      `${process.env.PASSWORD_RESET_URL}${separator}token=${resetToken}`;

    try {
      const emailResponse = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetLink
      });

      if (emailResponse?.error) {
        throw new Error(emailResponse.error.message);
      }
    } catch (emailError) {
      user.resetPasswordTokenHash = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      console.error('Erreur Resend :', emailError.message);

      return res.status(500).json({
        message: 'Impossible d’envoyer l’email pour le moment.'
      });
    }

    return res.status(200).json({
      message: genericMessage
    });

  } catch (error) {
    console.error(
      'Erreur récupération mot de passe :',
      error.message
    );

    return res.status(500).json({
      message: 'Une erreur est survenue. Veuillez réessayer.'
    });
  }
});

// Réinitialiser le mot de passe
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (
      typeof token !== 'string' ||
      !token ||
      typeof newPassword !== 'string' ||
      !newPassword
    ) {
      return res.status(400).json({
        message: 'Le jeton et le nouveau mot de passe sont obligatoires.'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: 'Le mot de passe doit contenir au moins 8 caractères.'
      });
    }

    const resetTokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordTokenHash: resetTokenHash,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Ce lien est invalide ou a expiré. Veuillez refaire une demande.'
      });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshTokens = [];

    await user.save();

    return res.status(200).json({
      message: 'Votre mot de passe a été réinitialisé avec succès.'
    });

  } catch (error) {
    console.error(
      'Erreur réinitialisation mot de passe :',
      error.message
    );

    return res.status(500).json({
      message: 'Une erreur est survenue lors de la réinitialisation.'
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

    if (
      req.user.role !== 'user' ||
      !req.user.profiles.includes('propose')
    ) {
      return res.status(403).json({
        message: 'Seuls les commerçants peuvent enregistrer un nom commercial.'
      });
    }

    if (req.user.merchantName) {
      return res.status(409).json({
        message: 'Ton nom commercial est déjà enregistré et ne peut pas être modifié.'
      });
    }

    const normalizedMerchantName =
      merchantName.trim().toLowerCase();

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

// Modifier les profils de l'utilisateur
router.patch('/:userId/profile', requireAuth, async (req, res) => {
  try {
    const { profiles } = req.body;

    if (
      !Array.isArray(profiles) ||
      profiles.length === 0 ||
      !profiles.every(profile =>
        ['cherche', 'propose'].includes(profile)
      ) ||
      new Set(profiles).size !== profiles.length
    ) {
      return res.status(400).json({
        message: 'Choisis au moins un profil valide : "cherche" ou "propose".'
      });
    }

    if (req.user.id !== req.params.userId) {
      return res.status(403).json({
        message: 'Tu ne peux modifier que tes propres profils.'
      });
    }

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
    console.error(
      'Erreur enregistrement profils :',
      error.message
    );

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
