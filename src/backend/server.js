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
import { trustProxy } from './services/security.js';
import { getSettings, getSettingsView, parseSettings } from './services/settings.js';
import { verifyToken } from './services/auth.js';
import { bootstrapSchema, schemaBootstrapped } from './services/schema.js';
import { APP_VERSION } from './config/version.js';
import apiRoutes from './routes/index.js';
import { requestIds } from './services/incidents.js';
import { installProcessGuards } from './services/processGuards.js';
import { stopScheduler } from './services/scheduler.js';
import { tokenGate, versionPrefix } from './api/gate.js';
import { shellMiddleware } from './services/linkPreview/index.js';
import { maskToken } from './services/office/tokens.js';
import { readyHandler } from './services/readiness.js';
import { mountModulePackages, startModuleServer } from './platform/packages/index.js';
import { runShutdownHooks } from './platform/registry.js';

const app = express();
const PORT = config.server.port;

const DEFAULT_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  max: 100,
};

// Only the loopback nginx may set the client address (see trustProxy); TRUST_PROXY_HOPS
// counts the proxies in front (2 with another proxy such as Traefik/NPM/Cloudflare).
app.set('trust proxy', trustProxy(process.env.TRUST_PROXY_HOPS));
ensureUploadDirs();

// Every request carries an id (and the browser's session id) for incident lookup.
app.use(requestIds);
// Page navigations handed over by nginx: index.html with link-preview tags
// (services/linkPreview). Before helmet and the IP guard, like the static file;
// it runs the IP check itself (a refused address gets the plain page, no lookup).
app.use(shellMiddleware());
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
// WOPI file transfers (Collabora) are passed through as they are.
app.use(compression({ filter: (req, res) => !String(res.getHeader('Content-Type') || '').startsWith('text/event-stream') && !req.path.startsWith('/api/wopi/') && compression.filter(req, res) }));

if (config.server.nodeEnv !== 'production') {
  // Access tokens of the online editor (?access_token=) and link read tokens (?t=) never reach the log.
  morgan.token('url', (req) => maskToken(req.originalUrl || req.url));
  app.use(morgan('dev'));
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: APP_VERSION, timestamp: new Date().toISOString() });
});

// Draining after SIGTERM answers 503, so a load balancer stops sending new work here.
app.get('/ready', readyHandler({ draining: () => shuttingDown, connect: tryConnectDB, bootstrapped: schemaBootstrapped, bootstrapLate: () => bootstrapLate() }));

app.use(ipGuard);
// Module packages: the @portal/sdk resolver and their browser code under /modules/<id>/<version>/ (docs/module-packages.md).
mountModulePackages(app);
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

/*
 * The database was not reachable at boot (e.g. Postgres still starting). Once
 * setup is locked nothing else would ever create the schema or start the
 * scheduler, so keep trying in the background (5 s, doubling up to 5 min)
 * until it works. A fresh install still goes through the setup wizard, which
 * bootstraps the schema itself; a successful attempt here is harmless then.
 */
let lateBootstrap = null;
function bootstrapLate() {
  if (!lateBootstrap) {
    lateBootstrap = bootstrapSchema()
      .then(() => {
        console.log('PostgreSQL connected; schema bootstrapped after a delayed start');
      })
      .finally(() => {
        lateBootstrap = null;
      });
  }
  return lateBootstrap;
}

function retryBootstrap(attempt = 0) {
  const delay = Math.min(5000 * 2 ** attempt, 5 * 60 * 1000);
  const timer = setTimeout(async () => {
    if (schemaBootstrapped() || shuttingDown) return;
    const db = await tryConnectDB();
    if (db.ok) {
      try {
        await bootstrapLate();
        return;
      } catch (err) {
        console.warn(`Schema bootstrap failed (attempt ${attempt + 1}): ${err.message}`);
      }
    } else if (attempt % 5 === 4) {
      console.warn(`PostgreSQL still not reachable (attempt ${attempt + 1}): ${db.error}`);
    }
    retryBootstrap(attempt + 1);
  }, delay);
  timer.unref?.();
}

let shuttingDown = false;

async function bootstrapFromDatabase() {
  const db = await tryConnectDB();
  if (!db.ok) {
    console.warn(`PostgreSQL not ready: ${db.error}`);
    console.warn('Starting in setup mode — open /setup to configure.');
    retryBootstrap();
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
  // The tab icon and the manifest are fetched by the browser on every page load.
  const FREE_READS = new Set(['/setup/status', '/settings', '/status', '/apps', '/notifications/unread', '/pwa/icon', '/pwa/manifest.webmanifest']);
  const STREAM = /\/(app\/chat\/(stream|files\/\d+)|items\/\d+\/(file|preview\.pdf|attachments\/\d+(\/preview\.pdf)?)|nodes\/\d+\/(file|preview\.pdf)|shares\/\d+\/(file|thumb|preview\.pdf|cad)|d\/[\w-]+\/(file|thumb|preview\.pdf|cad)|res\/icons\/[\w.]+)$/;
  // Uploads through public links: Drive (PUT /d/…/upload|replace) and Files (POST /l/…/upload, /l/…/nodes/:id/replace).
  const LINK_UPLOAD = { PUT: /^\/d\/[\w-]+\/(upload|replace)$/, POST: /^\/l\/[\w-]+\/(upload|nodes\/\d+\/replace)$/ };
  // API tokens are checked before the general limiter; they have their own per-token limit.
  // WOPI calls carry `Authorization: Bearer <WOPI token>` (not an API token): the WOPI router checks them.
  app.use('/api', (req, res, next) => (req.path.startsWith('/wopi/') ? next() : tokenGate(req, res, next)));
  app.use(
    '/api/',
    rateLimit({
      windowMs: boot.windowMs,
      limit: async (req) => {
        let limits = boot;
        try {
          limits = (await getSettingsView()).rateLimit;
        } catch {
          /* keep boot values */
        }
        return sessionUser(req) ? limits.userMax || boot.userMax : limits.max;
      },
      keyGenerator: (req) => (sessionUser(req) ? `user:${sessionUser(req)}` : `ip:${req.ip}`),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      // Sign-in has its own brute-force limiters; a busy guest IP must never block signing in.
      // Uploads through public links (one request per file) have their own per-link
      // limits (modules/drive/routes.js, modules/files/routes.js).
      // WOPI (online editor) calls come from the Collabora server with their own limiter.
      skip: (req) => Boolean(req.apiToken) || req.path.startsWith('/auth/') || req.path.startsWith('/wopi/') || (req.method === 'GET' && (FREE_READS.has(req.path) || STREAM.test(req.path))) || Boolean(LINK_UPLOAD[req.method]?.test(req.path)),
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

  // Modules hooked on the HTTP server (Remote: the WebSocket bridges to guacd and Portal VNC agents) — ctx.onHttpServer.
  startModuleServer(server);

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    // Live streams and idle keep-alive sockets would keep close() waiting
    // forever: end the chat streams, drop idle connections, and give requests
    // in flight a moment before every remaining connection (other streams
    // included) is closed.
    // No new background jobs start; the ones running finish within the grace period.
    stopScheduler();
    // Modules end their live streams (Chat) — ctx.onShutdown.
    await runShutdownHooks();
    server.closeIdleConnections?.();
    setTimeout(() => server.closeAllConnections?.(), 3000).unref();
    setTimeout(() => {
      console.error('Shutdown timed out, exiting');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

installProcessGuards();

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
