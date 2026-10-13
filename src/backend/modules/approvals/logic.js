/*
 * Pure pieces of the approvals engine (no database): route cleaning,
 * stage conditions, stage closing, SLA arithmetic. Unit-tested in
 * test/approvals.test.js.
 */

export const STATUSES = ['pending', 'question', 'approved', 'rejected', 'returned', 'withdrawn'];
/** A document is "in approval" while the process is in one of these. */
export const ACTIVE_STATUSES = ['pending', 'question'];
export const DECISIONS = ['approve', 'reject', 'question', 'return', 'delegate'];
export const APPROVER_KINDS = ['user', 'role', 'group', 'permission'];
export const CONDITION_OPS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'in', 'nin', 'empty', 'filled'];
export const FIELD_TYPES = ['number', 'money', 'select', 'text', 'ref', 'bool'];
export const MAX_STAGES = 12;
export const MAX_APPROVERS = 20;
export const MAX_CONDITIONS = 6;

export function httpError(statusCode, message, code, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (details) error.details = details;
  return error;
}

const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const stageId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A { ru, en } title or a string, picked for a locale. */
export function localized(value, locale = 'ru') {
  if (value && typeof value === 'object') return value[locale] || value.ru || value.en || '';
  return value == null ? '' : String(value);
}

// ── Types ───────────────────────────────────────────────────────────────────

/** Field definitions a module offers for stage conditions. */
export function cleanFields(fields) {
  const out = [];
  for (const raw of Array.isArray(fields) ? fields : []) {
    if (!raw || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(String(raw.key || ''))) continue;
    const type = FIELD_TYPES.includes(raw.type) ? raw.type : 'text';
    const field = { key: String(raw.key), type, label: raw.label || raw.key };
    if (Array.isArray(raw.options)) {
      field.options = raw.options
        .slice(0, 500)
        .map((option) => (option && typeof option === 'object' ? { value: option.value, label: option.label ?? String(option.value) } : { value: option, label: String(option) }))
        .filter((option) => option.value !== undefined && option.value !== null);
    }
    if (typeof raw.options === 'function') field.loadOptions = raw.options;
    if (type === 'money' && Array.isArray(raw.currencies)) field.currencies = raw.currencies.map(String);
    out.push(field);
  }
  return out;
}

// ── Routes ──────────────────────────────────────────────────────────────────

function cleanApprover(raw) {
  if (!raw || !APPROVER_KINDS.includes(raw.kind)) return null;
  if (raw.kind === 'permission') {
    const key = String(raw.key || raw.id || '');
    return /^[a-z][a-z0-9_.]{1,60}$/.test(key) ? { kind: 'permission', key } : null;
  }
  const id = Number(raw.id);
  return Number.isInteger(id) && id > 0 ? { kind: raw.kind, id } : null;
}

function cleanCondition(raw, fields) {
  if (!raw || !CONDITION_OPS.includes(raw.op)) return null;
  const field = fields ? fields.find((item) => item.key === raw.field) : { key: raw.field, type: 'text' };
  if (!field || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(String(raw.field || ''))) return null;
  const out = { field: field.key, op: raw.op };
  if (raw.op === 'empty' || raw.op === 'filled') return out;
  if (raw.op === 'in' || raw.op === 'nin') {
    const list = (Array.isArray(raw.value) ? raw.value : [raw.value]).filter((value) => value !== undefined && value !== null && value !== '').slice(0, 100);
    if (!list.length) return null;
    out.value = list.map((value) => (typeof value === 'number' ? value : text(value, 200)));
    return out;
  }
  if (['gt', 'gte', 'lt', 'lte'].includes(raw.op) || field.type === 'number' || field.type === 'money') {
    const number = Number(raw.value);
    if (!Number.isFinite(number)) return null;
    out.value = number;
  } else if (field.type === 'bool') {
    out.value = raw.value === true || raw.value === 'true';
  } else {
    if (raw.value === undefined || raw.value === null || raw.value === '') return null;
    out.value = typeof raw.value === 'number' ? raw.value : text(raw.value, 200);
  }
  if (field.type === 'money' && raw.currency && /^[A-Z]{3}$/.test(String(raw.currency).toUpperCase())) out.currency = String(raw.currency).toUpperCase();
  return out;
}

/**
 * A route as sent by the route builder, made safe. `fields` are the type's
 * condition fields (conditions on unknown fields are dropped).
 */
export function cleanRoute(input = {}, fields = null) {
  const stages = [];
  const seenIds = new Set();
  for (const raw of (Array.isArray(input.stages) ? input.stages : []).slice(0, MAX_STAGES)) {
    if (!raw || typeof raw !== 'object') continue;
    const approvers = [];
    const seen = new Set();
    for (const item of (Array.isArray(raw.approvers) ? raw.approvers : []).slice(0, MAX_APPROVERS)) {
      const approver = cleanApprover(item);
      if (!approver) continue;
      const key = `${approver.kind}:${approver.id ?? approver.key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      approvers.push(approver);
    }
    if (!approvers.length) continue;
    let id = /^[a-z0-9_-]{1,32}$/i.test(String(raw.id || '')) ? String(raw.id) : stageId();
    if (seenIds.has(id)) id = stageId();
    seenIds.add(id);
    stages.push({
      id,
      name: text(raw.name, 80),
      mode: raw.mode === 'any' ? 'any' : 'all',
      approvers,
      conditions: (Array.isArray(raw.conditions) ? raw.conditions : []).slice(0, MAX_CONDITIONS).map((item) => cleanCondition(item, fields)).filter(Boolean),
    });
  }
  const escalateTo = [];
  for (const item of (Array.isArray(input.escalateTo) ? input.escalateTo : []).slice(0, MAX_APPROVERS)) {
    const approver = cleanApprover(item);
    if (approver) escalateTo.push(approver);
  }
  return {
    name: text(input.name, 120),
    stages,
    restartFrom: input.restartFrom === 'current' ? 'current' : 'first',
    escalateTo,
  };
}

// ── Conditions ──────────────────────────────────────────────────────────────

const isEmpty = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
const same = (a, b) => (typeof a === 'number' || typeof b === 'number' ? Number(a) === Number(b) : String(a).toLowerCase() === String(b).toLowerCase());

/** One condition against the document's field values. */
export function conditionHolds(condition, values = {}) {
  const actual = values[condition.field];
  switch (condition.op) {
    case 'empty':
      return isEmpty(actual);
    case 'filled':
      return !isEmpty(actual);
    case 'in':
    case 'nin': {
      const list = Array.isArray(actual) ? actual : [actual];
      const hit = !isEmpty(actual) && list.some((item) => condition.value.some((wanted) => same(item, wanted)));
      return condition.op === 'in' ? hit : !hit;
    }
    default:
      break;
  }
  if (condition.currency) {
    const currency = values[`${condition.field}Currency`] ?? values.currency;
    if (!currency || String(currency).toUpperCase() !== condition.currency) return false;
  }
  if (['gt', 'gte', 'lt', 'lte'].includes(condition.op)) {
    const number = Number(actual);
    if (isEmpty(actual) || !Number.isFinite(number)) return false;
    if (condition.op === 'gt') return number > condition.value;
    if (condition.op === 'gte') return number >= condition.value;
    if (condition.op === 'lt') return number < condition.value;
    return number <= condition.value;
  }
  if (condition.op === 'eq') return !isEmpty(actual) && (Array.isArray(actual) ? actual.some((item) => same(item, condition.value)) : same(actual, condition.value));
  if (condition.op === 'neq') return isEmpty(actual) || (Array.isArray(actual) ? !actual.some((item) => same(item, condition.value)) : !same(actual, condition.value));
  return false;
}

/** Every condition of a stage holds (a stage without conditions always applies). */
export function stageApplies(stage, values) {
  return (stage.conditions || []).every((condition) => conditionHolds(condition, values));
}

/**
 * The stages a document goes through: the route's stages whose conditions
 * hold, in order. `skipped` lists the others for the path strip.
 */
export function planStages(route, values = {}) {
  const stages = [];
  const skipped = [];
  for (const stage of route?.stages || []) {
    if (stageApplies(stage, values)) stages.push(stage);
    else skipped.push({ id: stage.id, name: stage.name });
  }
  return { stages, skipped };
}

/**
 * The stages of a running process after its document changed: the stages up
 * to the current one stay (they were reached), the rest follow the new plan
 * (route order, without the stages already reached). `changed` is false when
 * the stages still to come are the same ones, so their snapshot is kept.
 */
export function replanStages(stages = [], current = 0, plan = { stages: [], skipped: [] }) {
  const reached = stages.slice(0, current + 1);
  const reachedIds = new Set(reached.map((stage) => stage.id));
  const tail = (plan.stages || []).filter((stage) => !reachedIds.has(stage.id));
  const oldTail = stages.slice(current + 1);
  const oldIds = oldTail.map((stage) => stage.id);
  const newIds = tail.map((stage) => stage.id);
  const changed = oldIds.join('\u0000') !== newIds.join('\u0000');
  return {
    changed,
    stages: changed ? [...reached, ...tail] : stages,
    skipped: (plan.skipped || []).filter((stage) => !reachedIds.has(stage.id)),
    added: newIds.filter((id) => !oldIds.includes(id)),
    removed: oldIds.filter((id) => !newIds.includes(id)),
  };
}

/** Field values for conditions: the module's `fields` plus amount and currency of the summary. */
export function conditionValues(summary = {}) {
  const values = { ...(summary.fields || {}) };
  if (values.amount === undefined && summary.amount !== undefined && summary.amount !== null) values.amount = Number(summary.amount);
  if (values.currency === undefined && summary.currency) values.currency = summary.currency;
  return values;
}

// ── Stage state ─────────────────────────────────────────────────────────────

/**
 * Whether a stage is done: `any` closes on the first approval, `all` when
 * every seat approved. Seats: [{ decision: 'approved' | null }].
 */
export function stageClosed(mode, seats) {
  const approved = seats.filter((seat) => seat.decision === 'approved').length;
  if (!seats.length) return true;
  return mode === 'any' ? approved > 0 : approved === seats.length;
}

/** Where a restart begins: the first stage, or the stage with the same id when the route says "current". */
export function restartIndex(restartFrom, plannedStages, currentStageId) {
  if (restartFrom !== 'current' || !currentStageId) return 0;
  const index = plannedStages.findIndex((stage) => stage.id === currentStageId);
  return index >= 0 ? index : 0;
}

// ── Urgency and SLA ─────────────────────────────────────────────────────────

export function urgencyLevel(settings, key) {
  const levels = settings?.urgencies?.length ? settings.urgencies : [];
  return levels.find((level) => level.key === key) || levels.find((level) => level.key === settings?.defaultUrgency) || levels[levels.length - 1] || { key: 'normal', hours: 72 };
}

export function normalizeUrgency(settings, key) {
  return urgencyLevel(settings, key).key;
}

/** Rank of an urgency (0 = most urgent), following the order of the levels in the settings. */
export function urgencyRank(settings, key) {
  const index = (settings?.urgencies || []).findIndex((level) => level.key === key);
  return index >= 0 ? index : 50;
}

/** Deadline and reminder moment of a stage that starts at `start`. */
export function stageTimes(settings, urgency, start = new Date()) {
  const hours = urgencyLevel(settings, urgency).hours;
  const startMs = new Date(start).getTime();
  const span = hours * 3600 * 1000;
  const percent = Math.min(95, Math.max(10, Number(settings?.reminderPercent) || 75));
  return { dueAt: new Date(startMs + span), remindAt: new Date(startMs + Math.round((span * percent) / 100)), hours };
}

/** 'overdue' | 'soon' | 'ok' | 'none' — the colour of a deadline. */
export function slaState(dueAt, soonHours = 24, now = Date.now()) {
  if (!dueAt) return 'none';
  const due = new Date(dueAt).getTime();
  if (due <= now) return 'overdue';
  if (due - now <= soonHours * 3600 * 1000) return 'soon';
  return 'ok';
}

/** Validated text of a decision: required for reject, return and question. */
export function decisionText(action, comment) {
  const value = String(comment ?? '').trim().slice(0, 4000);
  if (['reject', 'question', 'return'].includes(action) && !value) {
    throw httpError(400, action === 'question' ? 'Write the question' : 'A comment is required', 'COMMENT_REQUIRED');
  }
  return value;
}
