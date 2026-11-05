const jwt = require("jsonwebtoken");
const User = require("../models/users");

async function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentification requise."));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId)
      .select("_id role profiles");

    if (!user) {
      return next(new Error("Utilisateur introuvable."));
    }

    socket.user = {
      id: user._id.toString(),
      role: user.role,
      profiles: user.profiles,
    };

    next();
  } catch (error) {
    next(new Error("Jeton invalide ou expiré."));
  }
}

module.exports = socketAuth;