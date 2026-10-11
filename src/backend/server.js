import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import config from './config/app.js';
import { ensureUploadDirs, uploadRoot } from './config/paths.js';
import { closePool, tryConnectDB } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { ipGuard } from './middleware/ipGuard.js';
import { getSettings, parseSettings } from './services/settings.js';
import { bootstrapSchema } from './services/schema.js';
import { APP_VERSION } from './config/version.js';
import apiRoutes from './routes/index.js';

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
app.use(compression());

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
app.use(
  '/uploads',
  express.static(uploadRoot, {
    fallthrough: false,
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'none'; script-src 'none'");
    },
  })
);

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

  // The window is fixed at boot; the request cap follows admin settings live.
  app.use(
    '/api/',
    rateLimit({
      windowMs: boot.windowMs,
      limit: async () => {
        try {
          return parseSettings(await getSettings()).rateLimit.max;
        } catch {
          return boot.max;
        }
      },
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      // File streams (images in a gallery, PDF pages, video ranges) are access-checked
      // per request and would exhaust the API budget in seconds.
      skip: (req) => req.method === 'GET' && /\/items\/\d+\/(file|preview\.pdf)$/.test(req.path),
      message: { success: false, error: 'Too many requests. Try again later.' },
    })
  );

  app.use('/api', apiRoutes);

  app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  app.use(errorHandler);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${config.server.nodeEnv}`);
  });

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
