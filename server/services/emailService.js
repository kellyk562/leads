const nodemailer = require('nodemailer');

let transporter = null;

function isConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function getTransporter() {
  if (!transporter) {
    if (!isConfigured()) {
      throw new Error('Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env');
    }
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      family: 4,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

async function verifyConnection() {
  const t = getTransporter();
  await t.verify();
  return true;
}

async function sendEmail({ to, subject, text, html }) {
  const t = getTransporter();
  const fromAddress = process.env.EMAIL_FROM || `Ken <${process.env.GMAIL_USER}>`;
  const replyTo = process.env.REPLY_TO || process.env.GMAIL_USER;
  const payload = {
    from: fromAddress,
    replyTo,
    to,
    subject,
    text,
  };
  if (html) payload.html = html;
  const info = await t.sendMail(payload);
  return { messageId: info.messageId };
}

module.exports = { isConfigured, verifyConnection, sendEmail };
