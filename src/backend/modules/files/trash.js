import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';

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
}
