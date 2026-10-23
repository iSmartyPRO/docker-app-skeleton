/*
 * The portal backend under the kit's supervision — what start.sh does in the container:
 * node server.js is started again at once when it exits with 75 (a restart the module
 * installer asked for); any other exit is reported. Every start has its own log file.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { start, stop, sleep } from './proc.mjs';
import { Client } from './http.mjs';

export const RESTART_EXIT_CODE = 75;

export class Backend {
  /**
   * name: label in logs; dir: the backend folder (src/backend of a checkout); env: full environment;
   * port: its PORT; logDir: where boot logs go.
   */
  constructor({ name, dir, env, port, logDir }) {
    Object.assign(this, { name, dir, env, port, logDir });
    this.base = `http://127.0.0.1:${port}`;
    this.boots = [];
    this.restarts = 0;
    this.current = null;
    this.stopping = false;
    this.lastExit = null;
    this.anon = new Client(this.base);
  }

  get log() {
    return this.boots[this.boots.length - 1]?.log || null;
  }

  spawnOnce() {
    const index = this.boots.length + 1;
    const log = join(this.logDir, `${this.name}-boot-${String(index).padStart(2, '0')}.log`);
    const proc = start(`${this.name} #${index}`, process.execPath, ['server.js'], { cwd: this.dir, env: this.env, log });
    const boot = { index, pid: proc.pid, log, startedAt: Date.now(), exit: null };
    this.boots.push(boot);
    this.current = proc;
    proc.exited.then((result) => {
      boot.exit = result;
      this.lastExit = result;
      if (this.current === proc) this.current = null;
      if (!this.stopping && result.code === RESTART_EXIT_CODE) {
        this.restarts += 1;
        this.spawnOnce();
      }
    });
    return boot;
  }

  async start({ timeoutMs = 120_000 } = {}) {
    this.stopping = false;
    this.spawnOnce();
    return this.waitReady({ timeoutMs });
  }

  /** The boot id the shell sees, or null while the server does not answer. */
  async bootId() {
    const res = await this.anon.get('/api/modules/installed', { timeoutMs: 5000 });
    if (res.status === 200) return res.body?.bootId || null;
    // A core older than the package platform (no shell list): the process id stands in (it never restarts itself).
    if (res.status === 404 && this.current) return `legacy-${this.current.pid}`;
    return null;
  }

  /**
   * Waits until the server answers /health and /api/modules/installed with a boot id other than
   * `notBootId` (after a restart). Throws when node exited for good or on timeout.
   */
  async waitReady({ notBootId = null, timeoutMs = 120_000 } = {}) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (!this.current && this.lastExit && this.lastExit.code !== RESTART_EXIT_CODE) {
        throw new Error(`${this.name}: node exited with ${this.lastExit.code ?? this.lastExit.signal} — ${this.tail(15)}`);
      }
      const health = await this.anon.get('/health', { timeoutMs: 3000 });
      if (health.status === 200) {
        const id = await this.bootId();
        if (id && id !== notBootId) {
          this.bootIdNow = id;
          return id;
        }
      }
      await sleep(700);
    }
    throw new Error(`${this.name}: not ready within ${Math.round(timeoutMs / 1000)} s — ${this.tail(15)}`);
  }

  /** After an action that restarts the app: waits for the new process (boot id changes). */
  async waitRestart(previousBootId, { timeoutMs = 180_000 } = {}) {
    return this.waitReady({ notBootId: previousBootId, timeoutMs });
  }

  async stop() {
    this.stopping = true;
    const proc = this.current;
    if (proc) await stop(proc.pid, { graceMs: 15_000 });
    this.current = null;
  }

  tail(lines = 30) {
    const log = this.log;
    if (!log || !existsSync(log)) return '(no log)';
    const text = readFileSync(log, 'utf8').trim().split('\n');
    return text.slice(-lines).join(' | ').slice(-3000);
  }

  /** Lines of every boot log matching `re` (e.g. errors). */
  grep(re) {
    const out = [];
    for (const boot of this.boots) {
      if (!existsSync(boot.log)) continue;
      for (const line of readFileSync(boot.log, 'utf8').split('\n')) if (re.test(line)) out.push(`#${boot.index}: ${line.slice(0, 300)}`);
    }
    return out;
  }
}
