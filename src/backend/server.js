import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import config from './config/app.js';
import { avatarDir, ensureUploadDirs, logoDir } from './config/paths.js';
import { closePool, tryConnectDB } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { ipGuard } from './middleware/ipGuard.js';
import { getSettings, parseSettings } from './services/settings.js';
import { verifyToken } from './services/auth.js';
import { bootstrapSchema } from './services/schema.js';
import { APP_VERSION } from './config/version.js';
import apiRoutes from './routes/index.js';
import { tokenGate, versionPrefix } from './api/gate.js';

const app = express();
const PORT = config.server.port;

const DEFAULT_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  max: 100,
};

// Number of reverse proxies in front of Express. The bundled nginx is one hop;
// put another proxy (Traefik, NPM, Cloudflare) in front and set TRUST_PROXY_HOPS=2,
// otherwise req.ip is the outer proxy and IP lockouts / allow-lists misfire.
app.set('trust proxy', Math.max(0, Number(process.env.TRUST_PROXY_HOPS ?? 1) || 0));
ensureUploadDirs();

// /api/v1/* is the stable address for integrations (same handlers as /api/*).
app.use(versionPrefix);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: config.frontend.url,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// Server-Sent Events (chat) must reach the browser as they are written.
app.use(compression({ filter: (req, res) => !String(res.getHeader('Content-Type') || '').startsWith('text/event-stream') && compression.filter(req, res) }));

if (config.server.nodeEnv !== 'production') {
  app.use(morgan('dev'));
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: APP_VERSION, timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  const db = await tryConnectDB();
  if (!db.ok) {
    return res.status(503).json({
      status: 'not_ready',
      database: false,
    });
  }
  return res.json({ status: 'ready', database: true });
});

app.use(ipGuard);
// Only avatars and logos are public; every other upload (files, chat, tasks,
// counterparties, knowledge base) is served by its module after an access check.
const publicUploads = {
  fallthrough: false,
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'none'; script-src 'none'");
  },
};
app.use('/uploads/avatars', express.static(avatarDir, publicUploads));
app.use('/uploads/logos', express.static(logoDir, publicUploads));
app.use('/uploads', (req, res) => res.status(404).json({ success: false, error: 'Not found' }));

async function bootstrapFromDatabase() {
  const db = await tryConnectDB();
  if (!db.ok) {
    console.warn(`PostgreSQL not ready: ${db.error}`);
    console.warn('Starting in setup mode — open /setup to configure.');
    return { ...DEFAULT_RATE_LIMIT, appName: 'docker-app-skeleton', appVersion: APP_VERSION };
  }

  await bootstrapSchema();
  const settings = parseSettings(await getSettings());
  console.log(`PostgreSQL connected`);
  console.log(`App: ${settings.appName} v${settings.appVersion}`);

  return {
    windowMs: settings.rateLimit.windowMs,
    max: settings.rateLimit.max,
    userMax: settings.rateLimit.userMax,
    appName: settings.appName,
    appVersion: settings.appVersion,
  };
}

async function start() {
  if (!config.auth.jwtSecret) {
    if (config.server.nodeEnv === 'production') {
      console.error('JWT_SECRET is required in production. Run `make env` or set it in .env.');
      process.exit(1);
    }
    console.warn('JWT_SECRET is empty — run `make env` before enabling login.');
  }
  const boot = await bootstrapFromDatabase();

  // General API budget. The window is fixed at boot; the caps follow admin settings live.
  //  - signed-in people are counted per account (an office behind one NAT
  //    address must not share a budget) with a generous cap;
  //  - guests are counted per IP with the stricter cap;
  //  - bootstrap reads every page load makes, and file streams (gallery
  //    images, PDF pages, video ranges — access-checked per request), are free.
  // Sign-in, codes, link unlocking and uploads keep their own tighter limiters.
  const sessionUser = (req) => {
    if (req.rateUser !== undefined) return req.rateUser;
    let id = null;
    const token = req.cookies?.[config.auth.cookieName];
    if (token) {
      try {
        id = Number(verifyToken(token).sub) || null;
      } catch {
        id = null;
      }
    }
    req.rateUser = id;
    return id;
  };
  const FREE_READS = new Set(['/setup/status', '/settings', '/status', '/apps', '/notifications/unread']);
  const STREAM = /\/(app\/chat\/(stream|files\/\d+)|items\/\d+\/(file|preview\.pdf|attachments\/\d+(\/preview\.pdf)?)|nodes\/\d+\/(file|preview\.pdf)|shares\/\d+\/(file|thumb|preview\.pdf|cad)|d\/[\w-]+\/(file|thumb|preview\.pdf|cad)|res\/icons\/[\w.]+)$/;
  // API tokens are checked before the general limiter; they have their own per-token limit.
  app.use('/api', tokenGate);
  app.use(
    '/api/',
    rateLimit({
      windowMs: boot.windowMs,
      limit: async (req) => {
        let limits = boot;
        try {
          limits = parseSettings(await getSettings()).rateLimit;
        } catch {
          /* keep boot values */
        }
        return sessionUser(req) ? limits.userMax || boot.userMax : limits.max;
      },
      keyGenerator: (req) => (sessionUser(req) ? `user:${sessionUser(req)}` : `ip:${req.ip}`),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      // Sign-in has its own brute-force limiters; a busy guest IP must never block signing in.
      skip: (req) => Boolean(req.apiToken) || req.path.startsWith('/auth/') || (req.method === 'GET' && (FREE_READS.has(req.path) || STREAM.test(req.path))),
      handler: (req, res, next, options) => {
        res.status(options.statusCode).json({
          success: false,
          code: 'RATE_LIMITED',
          error: 'Too many requests. Try again later.',
          retryAfter: Math.ceil((req.rateLimit?.resetTime ? req.rateLimit.resetTime - Date.now() : options.windowMs) / 1000),
        });
      },
    })
  );

  // Cross-site request forgery: a browser marks every state-changing request
  // with its Origin; one from another site never reaches the routes. Tokens
  // and clients without an Origin (scripts, curl, server-to-server) are not
  // affected. Ports are ignored: the proxy may hide the public one.
  const hostOf = (value) => {
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      return null;
    }
  };
  app.use('/api', (req, res, next) => {
    if (req.apiToken || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    const from = hostOf(origin);
    const allowed = new Set([String(req.hostname || '').toLowerCase(), hostOf(config.frontend.url), hostOf(process.env.PUBLIC_URL || '')].filter(Boolean));
    if (from && allowed.has(from)) return next();
    return res.status(403).json({ success: false, code: 'ORIGIN_DENIED', error: 'Cross-site request blocked' });
  });

  app.use('/api', apiRoutes);

  app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  app.use(errorHandler);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${config.server.nodeEnv}`);
  });
  // Large uploads to file servers can take longer than Node's 5-minute default.
  server.requestTimeout = 60 * 60 * 1000;

  const shutdown = async (signal) => {
    console.log(`Received ${signal}, shutting down`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Shutdown timed out, exiting');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
