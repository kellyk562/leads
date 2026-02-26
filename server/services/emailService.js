const { google } = require('googleapis');

let gmailClient = null;

function isConfigured() {
  return !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN &&
    process.env.GMAIL_USER
  );
}

function getGmailClient() {
  if (!gmailClient) {
    if (!isConfigured()) {
      throw new Error(
        'Gmail API is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_USER in .env'
      );
    }
    const oauth2 = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    gmailClient = google.gmail({ version: 'v1', auth: oauth2 });
  }
  return gmailClient;
}

async function verifyConnection() {
  const gmail = getGmailClient();
  await gmail.users.getProfile({ userId: 'me' });
  return true;
}

function buildRfc2822({ from, to, subject, text, html }) {
  const boundary = `boundary_${Date.now()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
  ];

  if (html) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, '');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"', '');
    lines.push(text || '', '');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"', '');
    lines.push(html, '');
    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"', '');
    lines.push(text || '');
  }

  return lines.join('\r\n');
}

async function sendEmail({ to, subject, text, html }) {
  const gmail = getGmailClient();
  const fromAddress = process.env.EMAIL_FROM || `Ken <${process.env.GMAIL_USER}>`;

  const raw = buildRfc2822({ from: fromAddress, to, subject, text, html });
  const encodedMessage = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });

  return { messageId: res.data.id };
}

module.exports = { isConfigured, verifyConnection, sendEmail };
