import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const envCandidates = [
  process.env.ENV_FILE_PATH,
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../.env'),
  '/app/.env',
].filter(Boolean);

for (const path of envCandidates) {
  if (existsSync(path)) {
    dotenv.config({ path });
    break;
  }
}

const postgresFromUrl = () => {
  if (!process.env.DATABASE_URL) return null;
  try {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: Number(url.port) || 5432,
      database: url.pathname.replace(/^\//, '') || 'docker_app_skeleton',
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  } catch {
    return null;
  }
};

const dbFromUrl = postgresFromUrl();

/** Bootstrap settings from .env only (DB connection + container startup). */
export default {
  server: {
    port: Number(process.env.PORT) || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  postgres: {
    host: process.env.POSTGRES_HOST || dbFromUrl?.host || 'localhost',
    port: Number(process.env.POSTGRES_PORT || dbFromUrl?.port || 5432),
    database: process.env.POSTGRES_DB || dbFromUrl?.database || 'docker_app_skeleton',
    user: process.env.POSTGRES_USER || dbFromUrl?.user || 'docker_app_skeleton',
    password: process.env.POSTGRES_PASSWORD || dbFromUrl?.password || '',
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:8092',
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || '',
    cookieName: 'da_session',
    tokenTtl: '7d',
    cookieMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
};
