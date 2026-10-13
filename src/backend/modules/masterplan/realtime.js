import { randomBytes } from 'crypto';

/*
 * Live updates of the site plan over Server-Sent Events, one stream per open
 * masterplan page: GET /api/app/masterplan/stream?project=<id>.
 *
 * Events carry ids only ("units 12, 13 of project 3 changed", version), never
 * data: the page fetches the changed units through the API, so field hiding
 * stays on the server. The hub lives in this process (one backend process).
 */

const connections = new Map(); // id → { userId, projectId, res }
const HEARTBEAT_MS = 25000;

function write(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function openStream(req, res, projectId) {
  const id = randomBytes(9).toString('base64url');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  connections.set(id, { userId: req.user.id, projectId, res });
  write(res, 'hello', { connection: id, projectId });
  const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  const close = () => {
    clearInterval(beat);
    connections.delete(id);
  };
  req.on('close', close);
  res.on('error', close);
}

/** Tells every page open on the project that something changed. */
export function publish(projectId, event, data) {
  for (const entry of connections.values()) {
    if (entry.projectId !== Number(projectId)) continue;
    try {
      write(entry.res, event, { projectId: Number(projectId), ...data });
    } catch {
      /* the close handler cleans up */
    }
  }
}

export const unitsChanged = (projectId, ids, extra = {}) => publish(projectId, 'units', { ids: [...new Set(ids.map(Number))], ...extra });
export const treeChanged = (projectId) => publish(projectId, 'tree', {});

export const streamCount = () => connections.size;
