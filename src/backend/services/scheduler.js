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
  jobs.set(name, { name, everyMs, run, timeoutMs, lastRun: 0, running: false, stats: { runs: 0, failures: 0, lastStartedAt: null, lastFinishedAt: null, lastDurationMs: null, lastError: null, lastErrorAt: null, skipped: 0 } });
}

/** Registered jobs with what this process saw of them (the System page). */
export function listJobs() {
  return [...jobs.values()]
    .map((job) => ({ name: job.name, everyMs: job.everyMs, running: job.running, ...job.stats }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function runJob(job) {
  job.running = true;
  job.lastRun = Date.now();
  let client;
  try {
    client = await getPool().connect();
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [lockId(job.name)]);
    if (!rows[0]?.ok) {
      // Another instance runs it right now.
      job.stats.skipped += 1;
      return;
    }
    // The job keeps its lock and slot until it really ends: giving them back
    // while it still runs would start a second copy on top of the first. A
    // job that runs too long is only reported.
    const limit = job.timeoutMs || 5 * 60 * 1000;
    const started = Date.now();
    const watchdog = setInterval(() => {
      console.warn(`Job ${job.name} is still running after ${Math.round((Date.now() - started) / 1000)} s`);
    }, limit);
    watchdog.unref?.();
    job.stats.lastStartedAt = new Date(started).toISOString();
    try {
      await job.run();
      job.stats.runs += 1;
    } catch (err) {
      job.stats.failures += 1;
      job.stats.lastError = String(err?.message || err).slice(0, 300);
      job.stats.lastErrorAt = new Date().toISOString();
      throw err;
    } finally {
      job.stats.lastDurationMs = Date.now() - started;
      job.stats.lastFinishedAt = new Date().toISOString();
      clearInterval(watchdog);
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
  // Stopped (shutdown): a job that just finished must not start the next one.
  if (!timer) return;
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
