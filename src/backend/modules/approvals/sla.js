import { query } from '../../config/database.js';
import { notify } from '../../services/notifications.js';
import { emitEvent } from '../../api/events.js';
import { getApprovalType, listApprovalTypes } from './registry.js';
import { approvalMessage } from './messages.js';
import { peopleOf } from './people.js';

/*
 * approvals:sla (every minute).
 *
 *   reminder    once per stage, when `reminderPercent` of the reaction time
 *               has passed (remind_at): to the people who still have to decide
 *   escalation  once per stage, when the deadline passed (due_at): approvers
 *               get "overdue", the route's escalation people (default: the
 *               module's administrators) get the escalation notice
 *
 * The markers (reminded_at, escalated_at) are set by the same UPDATE that
 * selects the rows, so a reminder is never sent twice, even with several app
 * instances. A stage waiting for an answer (status 'question') is paused.
 * Imports of the engine are lazy to keep schema.js → sla.js free of cycles.
 */
export async function runSla(now = new Date()) {
  const { approvalSettings, escalationPeople, canSeeProcess, processShape } = await import('./engine.js');
  const settings = await approvalSettings();
  const result = { reminded: 0, escalated: 0 };
  // Only registered types: an approval whose module's package is not installed cannot be decided
  // (409 MODULE_ABSENT), so nobody is reminded of it — it is reminded / escalated once the module is back.
  const present = listApprovalTypes().map((type) => type.key);

  const { rows: due } = await query(
    `UPDATE approval_processes SET reminded_at = $1
     WHERE status = 'pending' AND reminded_at IS NULL AND remind_at IS NOT NULL AND remind_at <= $1 AND due_at > $1 AND type = ANY($2::text[])
     RETURNING *`,
    [now, present]
  );
  for (const process of due) {
    try {
      const type = getApprovalType(process.type);
      const people = await openPeople(process);
      await notify({ userIds: people, kind: 'approval.reminder', module: 'approvals', link: linkOf(process), render: approvalMessage('reminder', { doc: docOf(process, type) }) });
      await logSystemEvent(process, 'reminder', { people: people.length });
      result.reminded += 1;
    } catch (err) {
      console.warn(`[approvals] reminder for process ${process.id} failed:`, err.message);
    }
  }

  const { rows: overdue } = await query(
    `UPDATE approval_processes SET escalated_at = $1, reminded_at = COALESCE(reminded_at, $1)
     WHERE status = 'pending' AND escalated_at IS NULL AND due_at IS NOT NULL AND due_at <= $1 AND type = ANY($2::text[])
     RETURNING *`,
    [now, present]
  );
  for (const process of overdue) {
    try {
      const type = getApprovalType(process.type);
      const people = await openPeople(process);
      const doc = docOf(process, type);
      await notify({ userIds: people, kind: 'approval.reminder', module: 'approvals', link: linkOf(process), render: approvalMessage('overdue', { doc }) });
      let targets = [];
      if (settings.escalation !== false) {
        targets = (await escalationPeople(process, type)).filter((id) => !people.includes(id));
        const names = await approverNames(process);
        const stage = process.stages?.[process.current_stage];
        await notify({
          userIds: targets,
          kind: 'approval.escalation',
          module: 'approvals',
          link: linkOf(process),
          render: approvalMessage('escalation', { doc, stage: stage?.name || `#${process.current_stage + 1}`, approvers: names }),
        });
      }
      await logSystemEvent(process, 'escalated', { people: people.length, escalatedTo: targets });
      await emitEvent('approval.overdue', { data: { approval: processShape(process, type) }, visible: (req) => canSeeProcess(req, process) });
      result.escalated += 1;
    } catch (err) {
      console.warn(`[approvals] escalation for process ${process.id} failed:`, err.message);
    }
  }
  return result;
}

async function openSeats(process) {
  const { rows } = await query(`SELECT * FROM approval_seats WHERE process_id = $1 AND round = $2 AND stage_index = $3 AND decision IS NULL`, [
    process.id,
    process.round,
    process.current_stage,
  ]);
  return rows;
}

async function openPeople(process) {
  return peopleOf(await openSeats(process));
}

async function approverNames(process) {
  const { describeApprovers } = await import('./people.js');
  const seats = await openSeats(process);
  const labels = await describeApprovers(seats.map((seat) => ({ kind: seat.delegated_to ? 'user' : seat.kind, id: seat.delegated_to || seat.ref_id, key: seat.ref_key })));
  return labels.map((label) => label.name).join(', ');
}

function docOf(process, type) {
  return {
    typeTitle: type?.title || process.type,
    title: process.title,
    number: process.number,
    amount: process.amount === null ? null : Number(process.amount),
    currency: process.currency,
    dueAt: process.due_at,
  };
}

const linkOf = (process) => process.url || `/app/approvals?process=${process.id}`;

async function logSystemEvent(process, action, data) {
  await query(`INSERT INTO approval_events (process_id, round, stage_index, action, data) VALUES ($1, $2, $3, $4, $5)`, [
    process.id,
    process.round,
    process.current_stage,
    action,
    JSON.stringify(data || {}),
  ]);
}
