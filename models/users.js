
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  merchantName: {
    type: String,
    trim: true
  },
  normalizedMerchantName: {
    type: String,
    trim: true,
    lowercase: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },

  // Réinitialisation du mot de passe
  resetPasswordTokenHash: {
    type: String,
    default: undefined
  },
  resetPasswordExpires: {
    type: Date,
    default: undefined
  },

  // Sessions persistantes
  refreshTokens: {
    type: [{
      tokenHash: {
        type: String,
        required: true
      },
      sessionId: {
        type: String,
        required: true
      },
      expiresAt: {
        type: Date,
        required: true
      }
    }],
    default: []
  },

  profiles: {
    type: [{
      type: String,
      enum: ['cherche', 'propose']
    }],
    default: []
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  }
}, {
  timestamps: true
});

userSchema.index(
  { normalizedMerchantName: 1 },
  {
    unique: true,
    sparse: true,
    name: 'normalizedMerchantName_unique'
  }
);

module.exports = mongoose.model('User', userSchema);
