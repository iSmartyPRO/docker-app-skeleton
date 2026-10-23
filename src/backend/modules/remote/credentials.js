import { query } from '../../config/database.js';
import { seal, unseal } from '../../services/secrets.js';
import { httpError, intId } from '../shared/acl.js';

/*
 * Password manager (docs/specs/remote-access.ru.md «Учётные данные»).
 *
 * A credential is personal (owner_id = a user — only they use it) or shared
 * (owner_id NULL — any operator with remote access; only an administrator may
 * create one). The password is sealed and never returned to the browser.
 */

const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

function shape(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    domain: row.domain,
    scope: row.owner_id ? 'personal' : 'shared',
    mine: row.owner_id != null,
    hasPassword: Boolean(row.password),
    updatedAt: row.updated_at,
  };
}

/** Credentials this person may use: their own personal ones and every shared one. */
export async function listCredentials(ctx) {
  const { rows } = await query(
    `SELECT * FROM remote_credentials WHERE owner_id = $1 OR owner_id IS NULL ORDER BY owner_id IS NULL, LOWER(name)`,
    [ctx.userId]
  );
  return rows.map(shape);
}

async function credentialRow(id) {
  const { rows } = await query(`SELECT * FROM remote_credentials WHERE id = $1`, [intId(id)]);
  return rows[0] || null;
}

/** May this person use (not manage) a credential row? */
function canUse(ctx, row) {
  return row && (row.owner_id === ctx.userId || row.owner_id == null);
}

/** May this person manage a credential row? Owners manage personal; admins manage shared. */
function canManage(ctx, row) {
  if (!row) return false;
  if (row.owner_id == null) return ctx.isAdmin;
  return row.owner_id === ctx.userId;
}

export async function saveCredential(ctx, input = {}, id = null) {
  const current = id ? await credentialRow(id) : null;
  if (id && !current) throw httpError(404, 'Credential not found', 'NOT_FOUND');
  if (current && !canManage(ctx, current)) throw httpError(403, 'You cannot change this credential', 'FORBIDDEN');

  const scope = input.scope === 'shared' ? 'shared' : current ? (current.owner_id ? 'personal' : 'shared') : 'personal';
  if (scope === 'shared' && !ctx.isAdmin) throw httpError(403, 'Only an administrator manages shared credentials', 'FORBIDDEN');
  const ownerId = scope === 'shared' ? null : current?.owner_id ?? ctx.userId;

  const name = text(input.name ?? current?.name, 120);
  if (!name) throw httpError(400, 'Name is required', 'NAME_REQUIRED');
  const username = text(input.username ?? current?.username, 160);
  const domain = text(input.domain ?? current?.domain, 120);
  const password = input.password === undefined ? current?.password ?? '' : input.password ? seal(String(input.password)) : '';

  let row;
  if (current) {
    ({ rows: [row] } = await query(
      `UPDATE remote_credentials SET name=$1, username=$2, domain=$3, password=$4, owner_id=$5, updated_at=NOW() WHERE id=$6 RETURNING *`,
      [name, username, domain, password, ownerId, current.id]
    ));
  } else {
    ({ rows: [row] } = await query(
      `INSERT INTO remote_credentials (name, username, domain, password, owner_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, username, domain, password, ownerId, ctx.userId]
    ));
  }
  return shape(row);
}

export async function deleteCredential(ctx, id) {
  const row = await credentialRow(id);
  if (!row) throw httpError(404, 'Credential not found', 'NOT_FOUND');
  if (!canManage(ctx, row)) throw httpError(403, 'You cannot delete this credential', 'FORBIDDEN');
  await query(`DELETE FROM remote_credentials WHERE id = $1`, [row.id]);
}

/** Resolves a vault credential for a session → { username, domain, password }. */
export async function resolveVault(ctx, id) {
  const row = await credentialRow(id);
  if (!canUse(ctx, row)) throw httpError(403, 'You cannot use this credential', 'FORBIDDEN');
  return {
    username: row.username || '',
    domain: row.domain || '',
    password: unseal(row.password, { label: `remote credential ${row.id}` }) || '',
  };
}
