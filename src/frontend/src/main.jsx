// First: browsers without Kyrgyz Intl data get a fallback before any module formats a date.
import './i18n/intl-install';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initPwa } from './pwa/pwa';
import { initUpdates } from './pwa/update';
import { installChunkRecovery } from './lib/chunkReload';
import { loadInstalledPackages } from './platform/packages/loader';

// Before React renders: catches the browser's install prompt and registers the service worker.
initPwa();
initUpdates();
// A tab opened before a deploy reloads itself instead of showing a blank page.
installChunkRecovery();

// Installed module packages join the module registry before the routes are drawn
// (one small request; never blocks for more than a moment — platform/packages/loader.js).
loadInstalledPackages({ timeoutMs: 1500 }).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
