import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { notify } from '../../services/notifications.js';
import { requestAs } from '../../api/events.js';
import { canView, crmContext } from './access.js';
import { crmMessage } from './messages.js';
import { userZone } from './util.js';

/*
 * crm:reminders (every minute): an open activity with remind_minutes reminds
 * its responsible person once, that many minutes before due_at. reminded_at
 * is the one-shot marker; changing due_at or remind_minutes clears it.
 * Reminders more than a day late (the server was down) are dropped.
 */
export async function runReminders() {
  const parsed = parseSettings(await getSettings());
  const module = parsed.modules.crm;
  if (!module?.enabled || module.settings.activityReminders === false) return;
  const { rows } = await query(
    `UPDATE crm_activities a SET reminded_at = NOW()
     FROM crm_deals d
     WHERE d.id = a.deal_id AND d.deleted_at IS NULL
       AND a.done_at IS NULL AND a.reminded_at IS NULL AND a.remind_minutes IS NOT NULL
       AND a.due_at IS NOT NULL AND a.owner_id IS NOT NULL
       AND a.due_at - make_interval(mins => a.remind_minutes) <= NOW()
       AND a.due_at > NOW() - INTERVAL '1 day'
     RETURNING a.id, a.title, a.due_at, a.owner_id, d.id AS deal_id, d.title AS deal_title, d.pipeline_id, d.owner_id AS deal_owner, d.created_by AS deal_creator`
  );
  for (const row of rows) {
    try {
      // Only while the person may still open the deal.
      const req = await requestAs(row.owner_id);
      if (!req) continue;
      const { rows: watchers } = await query(`SELECT user_id FROM crm_deal_watchers WHERE deal_id = $1`, [row.deal_id]);
      const deal = { id: row.deal_id, pipeline_id: row.pipeline_id, owner_id: row.deal_owner, created_by: row.deal_creator };
      if (!canView(crmContext(req, module.settings), deal, watchers.map((item) => item.user_id))) continue;
      await notify({
        userIds: [row.owner_id],
        kind: 'crm.activity_due',
        module: 'crm',
        link: `/app/crm/deals/${row.deal_id}`,
        render: crmMessage('activityDue', { title: row.title, deal: row.deal_title, dueAt: row.due_at, zone: await userZone(query, row.owner_id) }),
      });
    } catch (err) {
      console.warn(`[crm] reminder for activity ${row.id} failed:`, err.message);
    }
  }
}
