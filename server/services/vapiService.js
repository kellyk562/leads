const VAPI_BASE_URL = 'https://api.vapi.ai';

function isConfigured() {
  return !!(process.env.VAPI_API_KEY && process.env.VAPI_ASSISTANT_ID);
}

async function createOutboundCall({ phoneNumber, assistantOverrides, metadata }) {
  if (!isConfigured()) {
    throw new Error('Vapi is not configured. Set VAPI_API_KEY and VAPI_ASSISTANT_ID in .env');
  }

  const body = {
    assistantId: process.env.VAPI_ASSISTANT_ID,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    customer: {
      number: phoneNumber,
    },
    metadata: metadata || {},
  };

  if (assistantOverrides) {
    body.assistantOverrides = assistantOverrides;
  }

  const response = await fetch(`${VAPI_BASE_URL}/call`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Vapi API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

module.exports = { isConfigured, createOutboundCall };
