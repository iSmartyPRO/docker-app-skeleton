/*
 * One HTTP 'upgrade' listener for Remote's WebSocket servers (guacd tunnel, Portal VNC).
 *
 * Two `ws` servers attached to the same HTTP server with `{ server, path }` each listen
 * to every upgrade, and `ws` answers 400 and ends the socket of a request whose path is
 * not its own — so whichever tunnel attached second never got a connection (and the
 * first one's sockets could be ended by the second server's 400). The servers run in
 * `noServer` mode instead and this listener hands each request to the server of its path.
 */
const routes = new Map();
const hooked = new WeakSet();

/**
 * Serves upgrades of `path` on `server` with the `ws` server `wss` (created with `noServer: true`).
 * `accept(req)`: false refuses the request (401) before the upgrade.
 */
export function routeUpgrade(server, path, wss, { accept = null } = {}) {
  routes.set(path, { wss, accept });
  if (hooked.has(server)) return;
  hooked.add(server);
  server.on('upgrade', (req, socket, head) => {
    const index = (req.url || '').indexOf('?');
    const pathname = index === -1 ? req.url : req.url.slice(0, index);
    const route = routes.get(pathname);
    if (route) {
      if (route.accept && !route.accept(req)) {
        if (socket.writable) socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }
      route.wss.handleUpgrade(req, socket, head, (ws) => route.wss.emit('connection', ws, req));
      return;
    }
    // Not ours. Another listener may take it; with none, refuse it rather than leave it hanging.
    if (server.listenerCount('upgrade') === 1 && socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    }
  });
}
