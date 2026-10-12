import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { removeBlob } from '../shared/storage.js';

/** Empties trash older than the configured number of days (scheduler job). */
export async function purgeTrash() {
  const parsed = parseSettings(await getSettings());
  const days = Number(parsed.modules.files?.settings?.trashDays) || 30;
  const { rows } = await query(
    `SELECT id FROM fs_nodes n
     WHERE n.deleted_at < NOW() - make_interval(days => $1)
       AND (n.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM fs_nodes p WHERE p.id = n.parent_id AND p.deleted_at IS NOT NULL))
     LIMIT 500`,
    [days]
  );
  const { purgeSubtree } = await import('./service.js');
  for (const row of rows) {
    try {
      await purgeSubtree(row.id);
    } catch (err) {
      console.warn(`Trash purge skipped node ${row.id}:`, err.message);
    }
  }
  await purgeOrphans().catch((err) => console.warn('Files: purging files of deleted accounts failed:', err.message));
}

// ── Deleted accounts ────────────────────────────────────────────────────────

/**
 * Before-user-delete hook (services/hooks.js), inside the delete transaction.
 * Nothing is deleted here, so a rolled-back delete loses nothing:
 *   - nodes the person made in shared spaces stay, without an owner;
 *   - their own files lose their shares and public links and become
 *     ownerless (no owner, no space): nobody reaches them through Files;
 *   - purgeOrphans() removes those (rows and blobs) once the delete is
 *     committed, keeping the files the knowledge base still uses.
 */
export async function beforeUserDelete(client, userId) {
  const id = Number(userId);
  const personal = `SELECT id FROM fs_nodes WHERE owner_id = $1 AND space_id IS NULL`;
  await client.query(`DELETE FROM fs_shares WHERE node_id IN (${personal})`, [id]);
  await client.query(`UPDATE fs_links SET revoked_at = NOW(), version = version + 1 WHERE revoked_at IS NULL AND node_id IN (${personal})`, [id]);
  await client.query(`UPDATE fs_nodes SET owner_id = NULL WHERE owner_id = $1`, [id]);
  // After the commit (a rolled-back delete gives the files back their owner, and the sweep finds nothing).
  setTimeout(() => purgeOrphans().catch((err) => console.warn('Files: purging files of deleted accounts failed:', err.message)), 30_000).unref?.();
}

const ORPHAN = `n.space_id IS NULL AND n.owner_id IS NULL`;
const KB_USED = `(EXISTS (SELECT 1 FROM kb_items k WHERE k.file_node_id = n.id) OR EXISTS (SELECT 1 FROM kb_item_files f WHERE f.node_id = n.id))`;

/**
 * Personal files of deleted accounts. Files the knowledge base uses move to
 * the top (so deleting their folders cannot touch them) and stay until the KB
 * lets go of them; everything else is deleted and its blob removed.
 */
export async function purgeOrphans() {
  await query(`UPDATE fs_nodes n SET parent_id = NULL WHERE ${ORPHAN} AND n.parent_id IS NOT NULL AND ${KB_USED}`);
  const files = await query(`SELECT n.storage_key FROM fs_nodes n WHERE ${ORPHAN} AND n.kind = 'file' AND n.storage_key IS NOT NULL AND NOT ${KB_USED}`);
  const roots = await query(`DELETE FROM fs_nodes n WHERE ${ORPHAN} AND n.parent_id IS NULL AND NOT ${KB_USED} RETURNING n.id`);
  if (!roots.rows.length) return 0;
  const keys = [...new Set(files.rows.map((row) => row.storage_key))];
  // A blob another node still points at stays.
  const kept = keys.length ? await query(`SELECT DISTINCT storage_key FROM fs_nodes WHERE storage_key = ANY($1)`, [keys]) : { rows: [] };
  const stillUsed = new Set(kept.rows.map((row) => row.storage_key));
  await Promise.all(keys.filter((key) => !stillUsed.has(key)).map((key) => removeBlob(key)));
  console.log(`Files: removed ${roots.rows.length} item(s) left by deleted accounts`);
  return roots.rows.length;
}
