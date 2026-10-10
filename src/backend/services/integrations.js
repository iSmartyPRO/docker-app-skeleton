import nodemailer from 'nodemailer';
import { getSettings, parseSettings } from './settings.js';

function fail(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export async function testEmail(override = {}) {
  const parsed = parseSettings(await getSettings());
  const cfg = { ...parsed.integrations.email, ...override };
  if (!cfg.host || !cfg.user) throw fail('SMTP host and user are required');

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: Boolean(cfg.secure),
    auth: {
      user: cfg.user,
      pass: cfg.password || parsed.integrations.email.password,
    },
    connectionTimeout: 8000,
  });

  await transporter.verify();
  return { ok: true, message: 'SMTP connection accepted' };
}

export async function testTelegram(override = {}) {
  const parsed = parseSettings(await getSettings());
  const cfg = { ...parsed.integrations.telegram, ...override };
  const token = cfg.botToken || parsed.integrations.telegram.botToken;
  if (!token) throw fail('Telegram bot token is required');

  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  if (!data.ok) throw fail(data.description || 'Telegram rejected the token');
  return { ok: true, bot: data.result };
}

export async function testWhatsapp(override = {}) {
  const parsed = parseSettings(await getSettings());
  const cfg = { ...parsed.integrations.whatsapp, ...override };
  const serverUrl = String(cfg.serverUrl || parsed.integrations.whatsapp.serverUrl || '')
    .replace(/\/$/, '');
  const apiKey = cfg.apiKey || parsed.integrations.whatsapp.apiKey;
  if (!serverUrl) throw fail('WhatsApp server URL is required');
  if (!apiKey) throw fail('WhatsApp API key is required');

  const url = `${serverUrl}/api/instance`;
  const res = await fetch(url, {
    headers: { 'X-API-Key': apiKey },
    signal: AbortSignal.timeout(8000),
  });

  if (res.status === 401 || res.status === 403) {
    throw fail('WhatsApp API key was rejected');
  }
  if (!res.ok && res.status !== 404) {
    throw fail(`WhatsApp gateway returned HTTP ${res.status}`);
  }
  return { ok: true, message: 'WhatsApp gateway accepted the API key' };
}

// Override for tests or an egress proxy.
const WAZZUP_API = (process.env.WAZZUP_API_URL || 'https://api.wazzup24.com/v3').replace(/\/$/, '');

/**
 * Lists the Wazzup account's channels (API v3, Bearer key). `plainId` is the
 * human-visible identifier (phone number, username); `id` is the channelId
 * the API expects when sending messages.
 */
export async function listWazzupChannels(override = {}) {
  const parsed = parseSettings(await getSettings());
  const apiKey = override.apiKey || parsed.integrations.wazzup?.apiKey;
  if (!apiKey) throw fail('Wazzup API key is required');

  const res = await fetch(`${WAZZUP_API}/channels`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401 || res.status === 403) throw fail('Wazzup rejected the API key');
  if (!res.ok) throw fail(`Wazzup API returned HTTP ${res.status}`);

  const data = await res.json().catch(() => []);
  return (Array.isArray(data) ? data : []).map((channel) => ({
    id: String(channel.channelId || ''),
    transport: String(channel.transport || 'unknown'),
    plainId: String(channel.plainId || ''),
    name: String(channel.name || channel.plainId || ''),
    state: String(channel.state || ''),
  }));
}

export async function testWazzup(override = {}) {
  const parsed = parseSettings(await getSettings());
  const channels = await listWazzupChannels(override);
  const selected = override.channels || parsed.integrations.wazzup?.channels || {};
  const missing = Object.entries(selected).filter(
    ([, id]) => id && !channels.some((channel) => channel.id === id)
  );
  if (missing.length) {
    throw fail(`API key is valid, but the selected ${missing.map(([t]) => t).join(', ')} channel no longer exists in Wazzup`);
  }
  return {
    ok: true,
    message: `Wazzup accepted the API key · ${channels.length} channel(s)`,
    channels,
  };
}

export async function testActiveDirectory(override = {}) {
  const parsed = parseSettings(await getSettings());
  const cfg = { ...parsed.integrations.activeDirectory, ...override };
  if (!cfg.bindPassword) cfg.bindPassword = parsed.integrations.activeDirectory.bindPassword;
  if (!cfg.host) throw fail('Active Directory host is required');
  if (!cfg.baseDn) throw fail('Base DN is required');
  const { testDirectory } = await import('./ldap.js');
  try {
    const result = await testDirectory(cfg);
    return { ok: true, message: `Bound to ${cfg.host}; base DN reachable (${result.entries} entr${result.entries === 1 ? 'y' : 'ies'} sampled)` };
  } catch (err) {
    throw fail(err.message || 'Active Directory connection failed');
  }
}

// ── Delivery (used by one-time sign-in codes and future notifications) ─────

export async function sendEmail({ to, subject, text }) {
  const parsed = parseSettings(await getSettings());
  const cfg = parsed.integrations.email;
  if (!cfg?.enabled || !cfg.host) throw fail('Email integration is not configured');
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: Boolean(cfg.secure),
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    connectionTimeout: 8000,
  });
  await transporter.sendMail({ from: cfg.from || cfg.user, to, subject, text });
}

/** Sends a Telegram message from the configured bot to a user who linked Telegram. */
export async function sendTelegram({ chatId, text }) {
  const parsed = parseSettings(await getSettings());
  const cfg = parsed.integrations.telegram;
  if (!cfg?.enabled || !cfg.botToken) throw fail('Telegram integration is not configured');
  const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: String(chatId), text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw fail(data.description || `Telegram could not send the message (HTTP ${res.status})`);
}

/** Sends a WhatsApp text through the Wazzup channel chosen for WhatsApp. */
export async function sendWhatsapp({ phone, text }) {
  const parsed = parseSettings(await getSettings());
  const cfg = parsed.integrations.wazzup;
  const channelId = cfg?.channels?.whatsapp;
  if (!cfg?.enabled || !cfg.apiKey || !channelId) throw fail('Wazzup WhatsApp channel is not configured');
  const res = await fetch(`${WAZZUP_API}/message`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId,
      chatType: 'whatsapp',
      chatId: String(phone).replace(/\D/g, ''),
      text,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw fail(`Wazzup could not send the message (HTTP ${res.status}) ${body.slice(0, 120)}`.trim());
  }
}

export async function testIntegration(kind, override) {
  if (kind === 'email') return testEmail(override);
  if (kind === 'telegram') return testTelegram(override);
  if (kind === 'whatsapp') return testWhatsapp(override);
  if (kind === 'wazzup') return testWazzup(override);
  if (kind === 'activeDirectory') return testActiveDirectory(override);
  throw fail('Unknown integration');
}
