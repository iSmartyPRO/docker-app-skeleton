import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = dirname(fileURLToPath(import.meta.url));

function readAppVersion() {
  const files = [
    resolve(here, '../../VERSION'),
    resolve(here, '../VERSION'),
    resolve(here, 'VERSION'),
  ];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const value = readFileSync(file, 'utf8').trim().split(/\r?\n/, 1)[0].trim();
    if (value) return value;
  }

  const fromEnv = String(process.env.VITE_APP_VERSION || process.env.APP_VERSION || '').trim();
  if (fromEnv) return fromEnv;

  const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8'));
  return pkg.version || '0.0.1';
}

// Unique per build: the running app compares it with /version.json to notice a deploy.
const BUILD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Writes dist/version.json next to index.html (served with no-cache). */
function buildVersionFile() {
  return {
    name: 'build-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID, version: readAppVersion() }) });
    },
  };
}

/*
 * Neutral page title and description for index.html (%PORTAL_NAME%,
 * %PORTAL_DESCRIPTION%). The app server replaces them per request with the
 * portal's own settings (backend services/linkPreview); these build-time
 * values only show while it is unavailable. Override with VITE_APP_NAME /
 * VITE_APP_DESCRIPTION at build time.
 */
function portalDefaults() {
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const name = String(process.env.VITE_APP_NAME || '').trim() || 'Портал';
  const description = String(process.env.VITE_APP_DESCRIPTION || '').trim() || 'Корпоративный портал';
  return {
    name: 'portal-defaults',
    transformIndexHtml(html) {
      return html.replaceAll('%PORTAL_NAME%', escape(name)).replaceAll('%PORTAL_DESCRIPTION%', escape(description));
    },
  };
}

export default defineConfig({
  plugins: [react(), buildVersionFile(), portalDefaults()],
  define: {
    __APP_VERSION__: JSON.stringify(readAppVersion()),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ready': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: app deploys do not bust the antd/react cache.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd'],
        },
      },
    },
  },
});
