const { Resend } = require('resend');

let resend = null;

function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

function getClient() {
  if (!resend) {
    if (!isConfigured()) {
      throw new Error('Resend is not configured. Set RESEND_API_KEY in .env');
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

async function verifyConnection() {
  const client = getClient();
  await client.apiKeys.list();
  return true;
}

async function sendEmail({ to, subject, text }) {
  const client = getClient();
  const fromAddress = process.env.EMAIL_FROM || 'Ken <ken@contact.weedhurry.com>';
  const replyTo = process.env.REPLY_TO || 'ken@weedhurry.com';
  const { data, error } = await client.emails.send({
    from: fromAddress,
    replyTo,
    to,
    subject,
    text,
  });
  if (error) {
    throw new Error(error.message);
  }
  return { messageId: data.id };
}

module.exports = { isConfigured, verifyConnection, sendEmail };
