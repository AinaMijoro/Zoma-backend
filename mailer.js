
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOrderEmail({ to, subject, text }) {
  return resend.emails.send({
    from: "Zoma <onboarding@resend.dev>",
    to,
    subject,
    text,
  });
}

module.exports = { sendOrderEmail };
