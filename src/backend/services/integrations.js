import nodemailer from 'nodemailer';
import { authAvailability, getSettings, parseSettings, reusableSecret } from './settings.js';
import { sendGmail, testGoogle } from './google.js';

function fail(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export async function testEmail(override = {}) {
  const parsed = parseSettings(await getSettings());
  const cfg = { ...parsed.integrations.email, ...override };
  if (!cfg.host || !cfg.user) throw fail('SMTP host and user are required');
  // The saved password is reused only for the saved server (SECRET_REQUIRED otherwise).
  const pass = reusableSecret('email', 'password', parsed.integrations.email, override);

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: Boolean(cfg.secure),
    auth: {
      user: cfg.user,
      pass,
    },
    connectionTimeout: 8000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
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

/**
 * WhatsApp Gateway (WAGW). The base URL comes only from settings — any domain
 * works; a trailing slash or `/api` suffix is tolerated. Each API key is tied
 * to one WhatsApp number, which is the sender.
 */
export function gatewayBase(url) {
  return String(url || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
}

async function gatewayRequest(cfg, path, { method = 'GET', body, auth = true } = {}) {
  const base = gatewayBase(cfg.serverUrl);
  if (!/^https?:\/\//i.test(base)) throw fail('WhatsApp Gateway URL must start with http:// or https://');
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(auth ? { 'X-API-Key': cfg.apiKey } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw fail('WhatsApp Gateway rejected the API key');
  if (!res.ok) {
    throw fail(`WhatsApp Gateway returned HTTP ${res.status}${data?.message ? `: ${String(data.message).slice(0, 120)}` : ''}`);
  }
  return data;
}

function gatewayConfig(parsed, override = {}) {
  const cfg = { ...parsed.integrations.whatsapp, ...override };
  if (!cfg.serverUrl) throw fail('WhatsApp Gateway URL is required');
  // The saved key is reused only for the saved gateway (SECRET_REQUIRED otherwise).
  cfg.apiKey = reusableSecret('whatsapp', 'apiKey', parsed.integrations.whatsapp, override);
  if (!cfg.apiKey) throw fail('WhatsApp Gateway API key is required');
  return cfg;
}

/** Reachability (GET /api/health) plus a read-only key check (GET /api/inbox/external/chats). */
export async function testWhatsapp(override = {}) {
  const parsed = parseSettings(await getSettings());
  const cfg = gatewayConfig(parsed, override);
  const health = await gatewayRequest(cfg, '/health', { auth: false });
  await gatewayRequest(cfg, '/inbox/external/chats');
  return {
    ok: true,
    message: `WhatsApp Gateway${health?.version ? ` v${health.version}` : ''} accepted the API key`,
  };
}

async function sendViaGateway(parsed, phone, text) {
  const cfg = gatewayConfig(parsed);
  await gatewayRequest(cfg, '/messages/external/send', {
    method: 'POST',
    body: { to: String(phone).replace(/\D/g, ''), message: text },
  });
}

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
  if (!cfg.host) throw fail('Active Directory host is required');
  cfg.bindPassword = reusableSecret('activeDirectory', 'bindPassword', parsed.integrations.activeDirectory, override);
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

/**
 * Outgoing email. Gmail (Google integration, "send via Gmail" on and a sender
 * connected) takes precedence; otherwise SMTP.
 */
export async function sendEmail({ to, subject, text, html }) {
  const parsed = parseSettings(await getSettings());
  const ready = authAvailability(parsed).ready;
  if (ready.gmail) {
    await sendGmail({ to, subject, text, html, fromName: parsed.appName });
    return 'gmail';
  }
  const cfg = parsed.integrations.email;
  if (!cfg?.enabled || !cfg.host) throw fail('Email integration is not configured');
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: Boolean(cfg.secure),
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    // A server that accepts the connection and then stalls must not hold a send forever.
    connectionTimeout: 8000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  });
  await transporter.sendMail({ from: cfg.from || cfg.user, to, subject, text, html });
  return 'smtp';
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

async function sendViaWazzup(parsed, phone, text) {
  const cfg = parsed.integrations.wazzup;
  const channelId = cfg?.channels?.whatsapp;
  if (!cfg?.enabled || !cfg.apiKey || !channelId) throw fail('Wazzup WhatsApp channel is not configured');
  const res = await fetch(`${WAZZUP_API}/message`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId, chatType: 'whatsapp', chatId: String(phone).replace(/\D/g, ''), text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw fail(`Wazzup could not send the message (HTTP ${res.status}) ${body.slice(0, 120)}`.trim());
  }
}

const WHATSAPP_SENDERS = { gateway: sendViaGateway, wazzup: sendViaWazzup };

/** Which WhatsApp providers are configured right now. */
export function whatsappProviders(parsed) {
  const i = parsed.integrations;
  return {
    gateway: Boolean(i.whatsapp?.enabled && i.whatsapp?.serverUrl && i.whatsapp?.apiKey),
    wazzup: Boolean(i.wazzup?.enabled && i.wazzup?.apiKey && i.wazzup?.channels?.whatsapp),
  };
}

/**
 * Sends a WhatsApp text through the provider chosen in Sign-in methods,
 * falling back to the other one when enabled and configured.
 */
export async function sendWhatsapp({ phone, text, provider, fallback }) {
  const parsed = parseSettings(await getSettings());
  // Callers (notifications) may choose their own provider; sign-in codes use Sign-in methods.
  const options = provider && provider !== 'auto' ? { provider, fallback: fallback !== false } : parsed.auth?.whatsappCode || {};
  const ready = whatsappProviders(parsed);
  const primary = options.provider === 'wazzup' || options.provider === 'gateway'
    ? options.provider
    : ready.gateway ? 'gateway' : 'wazzup';
  const order = [primary];
  if (options.fallback) order.push(primary === 'gateway' ? 'wazzup' : 'gateway');

  const errors = [];
  for (const provider of order) {
    if (!ready[provider]) {
      errors.push(`${provider}: not configured`);
      continue;
    }
    try {
      await WHATSAPP_SENDERS[provider](parsed, phone, text);
      return provider;
    } catch (err) {
      errors.push(`${provider}: ${err.message}`);
    }
  }
  throw fail(errors.join(' | ') || 'No WhatsApp provider is configured');
}

// ── Document conversion (Collabora Online / LibreOffice convert-to) ─────────

export function documentsBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * Converts an office document to PDF through `POST {server}/cool/convert-to/pdf`
 * (Collabora Online, CODE, or any compatible LibreOffice service).
 */
export async function convertToPdf({ buffer, filename, serverUrl }) {
  const base = documentsBase(serverUrl);
  if (!/^https?:\/\//i.test(base)) throw fail('Conversion server URL must start with http:// or https://');
  const form = new FormData();
  form.append('data', new Blob([buffer]), filename);
  const res = await fetch(`${base}/cool/convert-to/pdf`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(90000),
  });
  if (res.status === 403) throw fail('The conversion server refused this host (check net.post_allow)');
  if (!res.ok) throw fail(`Conversion server returned HTTP ${res.status}`);
  const pdf = Buffer.from(await res.arrayBuffer());
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw fail('Conversion server did not return a PDF');
  return pdf;
}

export async function testDocuments(override = {}) {
  const parsed = parseSettings(await getSettings());
  const cfg = { ...parsed.integrations.documents, ...override };
  if (!cfg.serverUrl) throw fail('Conversion server URL is required');
  const started = Date.now();
  const pdf = await convertToPdf({
    buffer: Buffer.from('Document conversion test'),
    filename: 'test.txt',
    serverUrl: cfg.serverUrl,
  });
  return { ok: true, message: `Converted a test document to PDF (${pdf.length} bytes, ${Date.now() - started} ms)` };
}

// ── Mattermost (REST API v4, bot access token) ──────────────────────────────

/** Any address works; a trailing slash or `/api/v4` suffix is tolerated. */
export function mattermostBase(url) {
  return String(url || '').trim().replace(/\/+$/, '').replace(/\/api\/v4$/i, '');
}

function mattermostConfig(parsed, override = {}) {
  const cfg = { ...parsed.integrations.mattermost, ...override };
  if (!cfg.serverUrl) throw fail('Mattermost server URL is required');
  cfg.botToken = reusableSecret('mattermost', 'botToken', parsed.integrations.mattermost, override);
  if (!cfg.botToken) throw fail('Mattermost bot token is required');
  return cfg;
}

async function mattermostRequest(cfg, path, { method = 'GET', body, auth = true } = {}) {
  const base = mattermostBase(cfg.serverUrl);
  if (!/^https?:\/\//i.test(base)) throw fail('Mattermost URL must start with http:// or https://');
  const res = await fetch(`${base}/api/v4${path}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${cfg.botToken}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw fail('Mattermost rejected the bot token');
  if (!res.ok) {
    throw fail(`Mattermost returned HTTP ${res.status}${data?.message ? `: ${String(data.message).slice(0, 120)}` : ''}`);
  }
  return { data, headers: res.headers };
}

/** Ping (no auth), token check (users/me) and, if set, access to the alert channel. */
export async function testMattermost(override = {}) {
  const parsed = parseSettings(await getSettings());
  const cfg = mattermostConfig(parsed, override);
  const ping = await mattermostRequest(cfg, '/system/ping', { auth: false });
  const version = ping.headers.get('x-version-id')?.split('.').slice(0, 3).join('.');
  const { data: me } = await mattermostRequest(cfg, '/users/me');
  let channel = '';
  if (cfg.notifyChannelId) {
    const { data } = await mattermostRequest(cfg, `/channels/${encodeURIComponent(cfg.notifyChannelId)}`);
    channel = ` · alerts go to ~${data.name || data.display_name}`;
  }
  return {
    ok: true,
    message: `Signed in as @${me.username}${version ? ` (Mattermost ${version})` : ''}${channel}`,
    bot: { username: me.username },
  };
}

/** Direct message from the bot to a Mattermost user. */
export async function sendMattermostDirect({ username, text }) {
  const parsed = parseSettings(await getSettings());
  const cfg = mattermostConfig(parsed);
  if (!cfg.enabled) throw fail('Mattermost integration is disabled');
  const [{ data: me }, { data: target }] = await Promise.all([
    mattermostRequest(cfg, '/users/me'),
    mattermostRequest(cfg, `/users/username/${encodeURIComponent(username)}`),
  ]);
  const { data: channel } = await mattermostRequest(cfg, '/channels/direct', {
    method: 'POST',
    body: [me.id, target.id],
  });
  await mattermostRequest(cfg, '/posts', { method: 'POST', body: { channel_id: channel.id, message: text } });
}

/** Posts to the alert channel when security notifications are on; never throws. */
export async function notifyMattermost(text) {
  try {
    const parsed = parseSettings(await getSettings());
    const cfg = parsed.integrations.mattermost;
    if (!cfg?.enabled || !cfg.notifySecurity || !cfg.notifyChannelId || !cfg.serverUrl || !cfg.botToken) return;
    await mattermostRequest(cfg, '/posts', {
      method: 'POST',
      body: { channel_id: cfg.notifyChannelId, message: text },
    });
  } catch (err) {
    console.warn('Mattermost notification failed:', err.message);
  }
}

export async function testIntegration(kind, override) {
  if (kind === 'email') return testEmail(override);
  if (kind === 'telegram') return testTelegram(override);
  if (kind === 'whatsapp') return testWhatsapp(override);
  if (kind === 'wazzup') return testWazzup(override);
  if (kind === 'mattermost') return testMattermost(override);
  if (kind === 'documents') return testDocuments(override);
  // Online editor: discovery, capabilities and the WOPI callback address (services/office/session.js).
  if (kind === 'documentsEditor') return (await import('./office/session.js')).testEditor(override);
  if (kind === 'google') return testGoogle(override);
  if (kind === 'activeDirectory') return testActiveDirectory(override);
  throw fail('Unknown integration');
}
