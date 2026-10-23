/*
 * Version of the module SDK (server: ./server.js, browser:
 * src/frontend/src/platform/sdk/version.js — the two move together; a test
 * checks it). Packages record the SDK they were built against (manifest.json
 * `sdk`); the loader refuses a package built for another major version or a
 * newer SDK than this core has. No imports: scripts read it.
 */
export const SDK_VERSION = '1.1.0';
