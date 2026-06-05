import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { timingSafeEqual } from 'crypto';

const ssm = new SSMClient({});
const sm = new SecretsManagerClient({});

// Cache params across invocations (5-minute TTL)
const CACHE_TTL = 5 * 60 * 1000;
let originSecretCache = { value: null, expiry: 0 };
let telegramTokenCache = { value: null, expiry: 0 };
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function getOriginSecret() {
  if (originSecretCache.value && Date.now() < originSecretCache.expiry) return originSecretCache.value;
  const res = await ssm.send(new GetParameterCommand({
    Name: '/lumen/prod/origin-verify-secret',
    WithDecryption: true,
  }));
  originSecretCache = { value: res.Parameter.Value, expiry: Date.now() + CACHE_TTL };
  return originSecretCache.value;
}

async function getTelegramToken() {
  if (telegramTokenCache.value && Date.now() < telegramTokenCache.expiry) return telegramTokenCache.value;
  const res = await sm.send(new GetSecretValueCommand({
    SecretId: process.env.TELEGRAM_SECRET_NAME,
  }));
  telegramTokenCache = { value: res.SecretString, expiry: Date.now() + CACHE_TTL };
  return telegramTokenCache.value;
}

function sanitize(str, maxLen = 500) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .slice(0, maxLen)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendTelegram(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram error: ${res.status} ${err}`);
  }
}

const ALLOWED_ORIGINS = new Set(
  [process.env.ALLOWED_ORIGIN].filter(Boolean)
);

function getCorsHeaders(event) {
  const origin = event.headers?.origin || '';
  const base = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    base['Access-Control-Allow-Origin'] = origin;
  }
  return base;
}

const respond = (statusCode, body, event) => ({
  statusCode,
  headers: getCorsHeaders(event),
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || 'GET';

  // CORS preflight
  if (method === 'OPTIONS') return respond(200, {}, event);

  // Only POST allowed
  if (method !== 'POST') return respond(405, { error: 'Method not allowed' }, event);

  // Verify origin header (timing-safe)
  const verifyHeader = event.headers?.['x-origin-verify'] || '';
  const secret = await getOriginSecret();
  const headerBuf = Buffer.from(verifyHeader);
  const secretBuf = Buffer.from(secret);
  if (headerBuf.length !== secretBuf.length || !timingSafeEqual(headerBuf, secretBuf)) {
    return respond(403, { error: 'Forbidden' }, event);
  }

  // Parse body
  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' }, event);
  }

  // Honeypot check
  if (data._gotcha) return respond(200, { ok: true }, event); // Silent success for bots

  // Validate fields
  const name = sanitize(data.name, 200);
  const email = sanitize(data.email, 200);
  const phone = sanitize(data.phone, 50);
  const message = sanitize(data.message, 2000);

  if (!name) return respond(400, { error: 'Name is required' }, event);
  if (!email || !validateEmail(email)) return respond(400, { error: 'Valid email is required' }, event);
  if (!message) return respond(400, { error: 'Message is required' }, event);

  // Format Telegram message
  const timestamp = new Date().toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem' });
  const text = [
    '📬 <b>New Lumen Contact Form</b>',
    '',
    `<b>Name:</b> ${name}`,
    `<b>Email:</b> ${email}`,
    phone ? `<b>Phone:</b> ${phone}` : null,
    '',
    `<b>Message:</b>`,
    message,
    '',
    `<i>${timestamp}</i>`,
  ].filter(Boolean).join('\n');

  // Send Telegram notification
  try {
    const token = await getTelegramToken();
    await sendTelegram(token, CHAT_ID, text);
  } catch (err) {
    console.error('Telegram send failed:', err);
    return respond(500, { error: 'Failed to send notification' }, event);
  }

  return respond(200, { ok: true }, event);
};
