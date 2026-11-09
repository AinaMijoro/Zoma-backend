
const { Resend } = require("resend");

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY est absente du fichier .env");
  }

  return new Resend(apiKey);
}

async function sendOrderEmail({ to, subject, text }) {
  const resend = getResend();

  return resend.emails.send({
    from: "Zoma <onboarding@resend.dev>",
    to,
    subject,
    text,
  });
}

async function sendPasswordResetEmail({ to, name, resetLink }) {
  const resend = getResend();

  return resend.emails.send({
    from: process.env.EMAIL_FROM || "Zoma <onboarding@resend.dev>",
    to,
    subject: "Réinitialisation de ton mot de passe ZOMA",
    html: `
      <p>Bonjour ${escapeHtml(name || "")},</p>
      <p>Tu as demandé à réinitialiser ton mot de passe ZOMA.</p>
      <p><a href="${escapeHtml(resetLink)}">Réinitialiser mon mot de passe</a></p>
      <p>Ce lien expire dans 15 minutes.</p>
      <p>Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
    `,
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

module.exports = {
  sendOrderEmail,
  sendPasswordResetEmail,
};
