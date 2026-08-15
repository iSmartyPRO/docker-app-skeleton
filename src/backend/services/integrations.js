import net from 'net';
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

export async function testActiveDirectory(override = {}) {
  const parsed = parseSettings(await getSettings());
  const cfg = { ...parsed.integrations.activeDirectory, ...override };
  const host = cfg.host || parsed.integrations.activeDirectory.host;
  const port = Number(cfg.port || parsed.integrations.activeDirectory.port || 389);
  if (!host) throw fail('Active Directory host is required');

  await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port, timeout: 5000 }, () => {
      socket.end();
      resolve();
    });
    socket.on('error', (err) => reject(fail(err.message)));
    socket.on('timeout', () => {
      socket.destroy();
      reject(fail('Active Directory connection timed out'));
    });
  });

  return { ok: true, message: `Reached ${host}:${port}` };
}

export async function testIntegration(kind, override) {
  if (kind === 'email') return testEmail(override);
  if (kind === 'telegram') return testTelegram(override);
  if (kind === 'whatsapp') return testWhatsapp(override);
  if (kind === 'activeDirectory') return testActiveDirectory(override);
  throw fail('Unknown integration');
}
