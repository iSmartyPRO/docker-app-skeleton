import { createHash } from 'crypto';
import { getPool } from '../config/database.js';

/*
 * Minimal job runner for reminders and housekeeping. Each job runs at most
 * every `everyMs`, inside a Postgres advisory lock, so several app instances
 * never run the same job at the same time. Failures are logged, never thrown.
 */

const jobs = new Map();
let timer = null;

function lockId(name) {
  return createHash('sha256').update(`job:${name}`).digest().readInt32BE(0);
}

export function registerJob({ name, everyMs = 60_000, run, timeoutMs }) {
  jobs.set(name, { name, everyMs, run, timeoutMs, lastRun: 0, running: false });
}

async function runJob(job) {
  job.running = true;
  job.lastRun = Date.now();
  let client;
  try {
    client = await getPool().connect();
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [lockId(job.name)]);
    if (!rows[0]?.ok) return;
    try {
      // A job that hangs (an unreachable server, a stuck query) gives its slot
      // back after a while instead of blocking reminders and everything else.
      let timer;
      await Promise.race([
        job.run(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timed out')), job.timeoutMs || 5 * 60 * 1000);
          timer.unref?.();
        }),
      ]).finally(() => clearTimeout(timer));
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId(job.name)]).catch(() => {});
    }
  } catch (err) {
    console.warn(`Job ${job.name} failed:`, err.message);
  } finally {
    client?.release();
    job.running = false;
  }
}

// Each running job holds a pooled connection for its lock and needs more for
// its own queries, so only a few run at once; the rest wait for the next slot.
const MAX_PARALLEL = 3;
let active = 0;

function tick() {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (active >= MAX_PARALLEL) break;
    if (job.running || now - job.lastRun < job.everyMs) continue;
    active += 1;
    runJob(job).finally(() => {
      active -= 1;
      // Free slot: start whatever is still due without waiting for the interval.
      setImmediate(tick);
    });
  }
}

export function startScheduler(intervalMs = 20_000) {
  if (timer || process.env.DISABLE_SCHEDULER === 'true') return;
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, 5_000).unref?.();
}

export function stopScheduler() {
  clearInterval(timer);
  timer = null;
}
