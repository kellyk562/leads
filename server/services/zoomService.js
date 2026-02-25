// Zoom Server-to-Server OAuth + Meeting creation
// Mirrors emailService.js pattern

let cachedToken = null;
let tokenExpiresAt = 0;

function isConfigured() {
  return !!(
    process.env.ZOOM_ACCOUNT_ID &&
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET
  );
}

async function getAccessToken() {
  // Return cached token if still valid (5-min buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zoom OAuth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Zoom tokens last 1 hour; cache with the returned expires_in
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

async function createMeeting({ topic, startTime, duration = 30 }) {
  if (!isConfigured()) {
    throw new Error('Zoom is not configured. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in .env');
  }

  const token = await getAccessToken();

  const body = {
    topic: topic || 'Weedhurry POS Demo',
    type: 2, // scheduled meeting
    start_time: startTime, // ISO 8601
    duration,
    timezone: 'America/Los_Angeles',
    settings: {
      join_before_host: true,
      waiting_room: false,
    },
  };

  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Zoom create meeting failed (${res.status}): ${errBody}`);
  }

  const meeting = await res.json();
  return {
    joinUrl: meeting.join_url,
    meetingId: meeting.id,
    password: meeting.password || null,
  };
}

module.exports = { isConfigured, createMeeting };
