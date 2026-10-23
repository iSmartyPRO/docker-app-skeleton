import { query } from '../../config/database.js';
import { bounds, dayKeys, int, pick, seriesOf } from '../../platform/widgets.js';
import { driveContext, home as driveHome, listShortcuts } from './service.js';
import { ACTION_GROUPS } from './activity.js';

/* Dashboard widgets of the File server: shares and shortcuts, and activity (drive.audit). */

async function drive(req, settings) {
  const ctx = driveContext(req);
  const kind = pick(settings.list, ['recent', 'favorites'], 'recent');
  const [state, items] = await Promise.all([driveHome(ctx), listShortcuts(kind, ctx)]);
  return {
    title: state.drive?.title || null,
    shares: (state.shares || []).map((share) => ({ id: share.id, title: share.title, color: share.color, state: share.state })),
    items: items.slice(0, int(settings.limit, 3, 20, 6)),
  };
}

async function driveActivity(req, settings, tz) {
  const days = int(settings.period, 7, 90, 14);
  const { today, since } = await bounds(tz, days);
  const groupCase = `CASE ${Object.entries(ACTION_GROUPS)
    .map(([group, actions]) => `WHEN a.action IN (${actions.map((action) => `'${action}'`).join(',')}) THEN '${group}'`)
    .join(' ')} ELSE 'other' END`;
  const [perDay, totals, people] = await Promise.all([
    query(
      `SELECT to_char(a.at AT TIME ZONE $2, 'YYYY-MM-DD') AS day, ${groupCase} AS grp, COUNT(*)::int AS count
       FROM drive_activity a WHERE a.at >= $1 GROUP BY 1, 2`,
      [since, tz]
    ),
    query(
      `SELECT COUNT(*)::int AS events, COUNT(DISTINCT a.user_id)::int AS people, COUNT(*) FILTER (WHERE NOT a.ok)::int AS failures
       FROM drive_activity a WHERE a.at >= $1`,
      [since]
    ),
    query(
      `SELECT a.user_id AS id, MAX(COALESCE(u.display_name, u.username, a.user_name)) AS name, COUNT(*)::int AS count
       FROM drive_activity a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.at >= $1 AND a.user_id IS NOT NULL GROUP BY a.user_id ORDER BY count DESC LIMIT 5`,
      [since]
    ),
  ]);
  const keys = dayKeys(today, days, tz);
  const groups = ['browse', 'download', 'change', 'delete'];
  const series = Object.fromEntries(groups.map((group) => [group, seriesOf(keys, perDay.rows.filter((row) => row.grp === group))]));
  return { days: keys, series, ...totals.rows[0], top: people.rows };
}

export function registerDriveWidgets(ctx) {
  ctx.registerWidget({ type: 'drive', data: drive });
  ctx.registerWidget({ type: 'driveActivity', permission: 'drive.audit', data: driveActivity });
}
