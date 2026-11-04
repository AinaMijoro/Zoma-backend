const nodemailer = require("nodemailer");
console.log("GMAIL_USER chargé :", !!process.env.GMAIL_USER);
console.log(
  "GMAIL_APP_PASSWORD chargé :",
  !!process.env.GMAIL_APP_PASSWORD
);
console.log(
  "Longueur du mot de passe :",
  process.env.GMAIL_APP_PASSWORD?.length
);
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendOrderEmail({ to, subject, text }) {
  return transporter.sendMail({
    from: `"Zoma" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
  });
}

module.exports = { sendOrderEmail };