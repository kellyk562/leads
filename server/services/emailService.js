const nodemailer = require('nodemailer');
const dns = require('dns');

// Force IPv4 DNS resolution — Railway doesn't support IPv6 outbound
dns.setDefaultResultOrder('ipv4first');

let transporter = null;

function isConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function getTransporter() {
  if (!transporter) {
    if (!isConfigured()) {
      throw new Error('Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env');
    }
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      family: 4,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

async function verifyConnection() {
  const t = getTransporter();
  await t.verify();
  return true;
}

async function sendEmail({ to, subject, text }) {
  const t = getTransporter();
  const info = await t.sendMail({
    from: `"Ken" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
  });
  return info;
}

module.exports = { isConfigured, verifyConnection, sendEmail };
