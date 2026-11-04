
const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  specialty: {
    type: String,
    required: true,
    trim: true
  },

  countries: {
    type: [String],
    enum: ['France', 'Madagascar'],
    required: true,
    validate: {
      validator: countries => countries.length > 0,
      message: 'Sélectionne au moins un pays.'
    }
  },

  frenchDepartments: {
    type: [String],
    default: []
  },

  frenchCities: {
    type: [String],
    default: []
  },

  madagascarCities: {
    type: [String],
    default: []
  },

  parcelDirections: {
    type: [String],
    enum: ['france_to_madagascar', 'madagascar_to_france'],
    default: []
  },

  deliveries: [
  {
    country: {
      type: String,
      enum: ['France', 'Madagascar'],
      required: true
    },

    currency: {
      type: String,
      enum: ['EUR', 'MGA'],
      required: true
    },

    type: {
      type: String,
      enum: ['free', 'free_over_minimum', 'flat_fee', 'none'],
      required: true
    },

    minimumAmount: {
      type: Number,
      min: 0
    },

    fee: {
      type: Number,
      min: 0
    }
  }
],

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Activity', activitySchema);
