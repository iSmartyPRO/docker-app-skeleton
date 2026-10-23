import { randomUUID } from 'crypto';
import { query, withTransaction } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { recordSecurityEvent } from '../../services/security.js';
import { assertCanManage, createUser } from '../../services/users.js';
import { getUserAccess } from '../../services/rbac.js';
import { unlinkDirectory } from '../../services/userLinks.js';
import { DIRECTORY_DEFAULTS } from '../catalog.js';
import { actorCredential, credentialStatus, isImpersonation, markAllStale, markLoginsStale, parkCredential, savePassword } from './driveLink.js';
import { canonDn, childDn, firstRdn, isUnder, nameOf, parentDn, parseDn } from './dn.js';
import { DEMO_BASE, DEMO_EXCLUDED, DEMO_ROOT, demoDirectoryExists, demoProvider } from './demoDirectory.js';
import { ldapProvider, moduleError } from './ldap.js';
import {
  UAC,
  cleanChanges,
  cleanFilter,
  compileFilter,
  freeLogin,
  httpError,
  isHiddenAccount,
  loginCandidates,
  loginFromTemplate,
  loginValid,
  mailFromTemplate,
  matchesFilter,
  ouPath,
  ouPathOf,
  passwordIssues,
  placeOf,
  rowOf,
  scopeOf,
  scopeRefusal,
  secureChannel,
  upnSuffixes,
  visible,
} from './logic.js';

/*
 * The AD directory module («Каталог AD», docs/directory.md).
 *
 * Reads use the portal's service account (LDAP) or the demo table; every change runs as
 * the ACTING administrator's own AD account — the same credential the File server's
 * «Доступ» uses (drive_credentials, drive/access/credentials.js), never the service
 * account. Every change is checked against the scope first (inside the managed root, not
 * in an excluded OU, not a hidden account; DNs compared RDN by RDN), confirmed by the
 * person in the UI, journalled (ad_journal) and reported to Activity.
 */

// ── providers (replaceable for tests) ───────────────────────────────────────

let factories = { ldap: ldapProvider, demo: demoProvider };

/** Tests: replace how providers are made ({ ldap(cfg, settings), demo() }); null restores. */
export function setProviderFactory(next) {
  factories = next ? { ...factories, ...next } : { ldap: ldapProvider, demo: demoProvider };
}

// ── context ─────────────────────────────────────────────────────────────────

const has = (perms, perm) => perms.has('*') || perms.has(perm);

/** What the person may do here. A «sign in as» session only reads. */
export function rightsOf(req) {
  const perms = new Set(req?.access?.permissions || []);
  const admin = has(perms, 'ad.admin');
  const manage = admin || has(perms, 'ad.manage');
  const passwords = admin || has(perms, 'ad.passwords');
  const view = manage || passwords || has(perms, 'ad.view');
  const impersonating = isImpersonation(req);
  return {
    view,
    manage: manage && !impersonating,
    passwords: passwords && !impersonating,
    admin: admin && !impersonating,
    superadmin: perms.has('*'),
    readOnly: impersonating && (manage || passwords) ? 'impersonation' : null,
    usersManage: has(perms, 'users.manage') && !impersonating,
    employeesHr: has(perms, 'employees.hr') && !impersonating,
    employeesView: has(perms, 'employees.view') || has(perms, 'employees.hr'),
    settings: has(perms, 'settings.modules'),
  };
}

/** Effective settings: the demo directory brings its own root and exclusions. */
function demoSettings(settings) {
  const inDemo = (dn) => (dn && isUnder(dn, DEMO_ROOT) ? dn : '');
  return {
    ...settings,
    rootDn: DEMO_ROOT,
    excluded: [...DEMO_EXCLUDED, ...settings.excluded.filter((entry) => !/,/.test(entry) || isUnder(entry, DEMO_ROOT))],
    defaultUserOu: inDemo(settings.defaultUserOu) || `OU=Users,OU=HQ,${DEMO_ROOT}`,
    disabledOu: inDemo(settings.disabledOu) || `OU=Disabled,${DEMO_ROOT}`,
    unitOus: (settings.unitOus || []).filter((item) => isUnder(item.ou, DEMO_ROOT)),
    upnSuffixes: ['example.local'],
    mailTemplate: settings.mailTemplate || '{login}@example.local',
  };
}

/**
 * Everything a request needs: { mode: 'ldap' | 'demo' | 'off', provider, settings, scope, rights,
 * cfg, channel ('ldaps' | 'starttls' | 'demo' | null), drive: { prefix, access }, employees }.
 */
export async function directoryContext(req) {
  const parsed = parseSettings(await getSettings());
  const stored = { ...DIRECTORY_DEFAULTS, ...(parsed.modules.directory?.settings || {}) };
  const cfg = parsed.integrations.activeDirectory;
  const adReady = Boolean(cfg?.enabled && cfg.host && cfg.baseDn);
  let mode = 'off';
  let settings = stored;
  let provider = null;
  if (adReady) {
    mode = 'ldap';
    provider = factories.ldap(cfg, stored);
  } else if (await demoDirectoryExists()) {
    mode = 'demo';
    settings = demoSettings(stored);
    provider = factories.demo();
  }
  const driveState = parsed.modules.drive || {};
  return {
    mode,
    provider,
    settings,
    stored,
    scope: scopeOf(settings),
    rights: rightsOf(req),
    cfg: adReady ? cfg : null,
    channel: mode === 'demo' ? 'demo' : mode === 'ldap' ? secureChannel(cfg, stored) : null,
    drive: { prefix: String(driveState.settings?.access?.prefix || 'sg_'), access: Boolean(driveState.enabled && driveState.settings?.access?.enabled) },
    employees: Boolean(parsed.modules.employees?.enabled),
    baseDn: mode === 'demo' ? DEMO_BASE : cfg?.baseDn || null,
  };
}

function requireView(ctx) {
  if (!ctx.rights.view) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
}

function requireReady(ctx) {
  requireView(ctx);
  if (ctx.mode === 'off') throw httpError(409, 'Active Directory is not set up (Settings → Integrations)', 'AD_OFF');
  if (!ctx.scope.root) throw httpError(409, 'Choose the managed root in the module settings', 'AD_NO_ROOT');
}

function requireRight(ctx, right) {
  requireReady(ctx);
  if (ctx.rights.readOnly === 'impersonation') throw httpError(403, 'Not available while signed in as another user', 'IMPERSONATION_LIMIT');
  const ok = Array.isArray(right) ? right.some((item) => ctx.rights[item]) : ctx.rights[right];
  if (!ok) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
}

/** Folder access groups (sg_…) belong to File server → Access. */
const isDriveGroup = (ctx, object) => Boolean(object?.login || object?.cn) && String(object.login || object.cn).toLowerCase().startsWith(ctx.drive.prefix.toLowerCase());

// ── overview ────────────────────────────────────────────────────────────────

export async function overview(req) {
  const ctx = await directoryContext(req);
  requireView(ctx);
  const out = {
    mode: ctx.mode,
    rights: ctx.rights,
    setup: {
      adConfigured: ctx.mode === 'ldap',
      demo: ctx.mode === 'demo',
      rootSet: Boolean(ctx.scope.root),
      rootDn: ctx.settings.rootDn || null,
    },
    root: ctx.scope.root ? { dn: ctx.settings.rootDn, name: nameOf(ctx.settings.rootDn) } : null,
    channel: ctx.channel,
    passwordsAvailable: Boolean(ctx.channel),
    settings: {
      allowCreate: ctx.settings.allowCreate,
      loginTemplate: ctx.settings.loginTemplate,
      upnSuffixes: upnSuffixes(ctx.settings, ctx.baseDn || ''),
      mailTemplate: ctx.settings.mailTemplate,
      editableAttributes: ctx.settings.editableAttributes,
      passwordMinLength: ctx.settings.passwordMinLength,
      passwordComplexity: ctx.settings.passwordComplexity,
      passwordHint: ctx.settings.passwordHint,
      mustChangeDefault: ctx.settings.mustChangeDefault,
      inactiveDays: ctx.settings.inactiveDays,
      disabledOu: ctx.settings.disabledOu || null,
      defaultUserOu: ctx.settings.defaultUserOu || null,
      excludedCount: ctx.settings.excluded.length + ctx.settings.hiddenAccounts.length,
    },
    drive: ctx.drive,
    employees: ctx.employees,
    credential: null,
  };
  if (ctx.mode === 'ldap' && (ctx.rights.manage || ctx.rights.passwords)) {
    out.credential = await credentialStatus(req.user.id).catch(() => null);
  }
  return out;
}

// ── tree ────────────────────────────────────────────────────────────────────

const emptyCounts = () => ({ user: 0, group: 0, computer: 0 });
// Objects read per child OU for its counter (past it the counter shows «N+»).
const TREE_COUNT_LIMIT = 2000;

/** Counts of the visible objects among light entries (each DN parsed once, by placeOf). */
function countVisible(ctx, objects) {
  const counts = emptyCounts();
  for (const object of objects) if (visible(object, ctx.scope)) counts[object.kind] = (counts[object.kind] || 0) + 1;
  return counts;
}

const sum = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

/**
 * Children (OUs and containers) of `dn` (default: the root) with the number of users, groups and
 * computers in each subtree. Excluded OUs and hidden accounts are never listed or counted. The
 * subtree is never read whole: each child is counted with a bounded search (`truncated` past
 * TREE_COUNT_LIMIT) and its expand arrow comes from a one-level search of a few entries.
 */
export async function tree(req, dn) {
  const ctx = await directoryContext(req);
  requireReady(ctx);
  const at = dn ? String(dn) : ctx.settings.rootDn;
  const refusal = scopeRefusal(at, ctx.scope, { allowRoot: true });
  if (refusal) throw refusal;
  const inside = (child) => placeOf(child.dn, ctx.scope) === 'inside';
  // Enough sub-OUs to see past the excluded ones that could come first.
  const containerLimit = Math.min(50, 1 + ctx.scope.excludedDns.length + ctx.scope.patterns.length);
  const summary = await ctx.provider.treeSummary(at, { limit: TREE_COUNT_LIMIT, containerLimit, keepChild: inside });
  const self = countVisible(ctx, summary.self.objects);
  const children = summary.details.map((child) => {
    const counts = countVisible(ctx, child.objects);
    // All sub-OUs read were excluded but there may be more: show the arrow (expanding answers).
    const hasChildren = child.containers.some(inside) || child.containersTruncated;
    return { dn: child.dn, kind: child.kind, name: child.name, description: child.description, counts, total: sum(counts), truncated: child.truncated, hasChildren };
  });
  const truncated = summary.self.truncated || children.some((child) => child.truncated);
  return {
    node: { dn: at, name: nameOf(at), root: canonDn(at) === canonDn(ctx.settings.rootDn), path: ouPathOf(at, ctx.scope), self, total: sum(self) + children.reduce((n, child) => n + child.total, 0), truncated },
    children: children.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ── lists ───────────────────────────────────────────────────────────────────

async function portalLinks(objects) {
  const guids = objects.map((object) => object.guid).filter(Boolean);
  const dns = objects.map((object) => String(object.dn).toLowerCase());
  if (!objects.length) return new Map();
  const { rows } = await query(
    `SELECT id, username, display_name, is_active, directory_guid, LOWER(external_id) AS dn FROM users
      WHERE auth_source = 'ldap' AND (directory_guid = ANY($1::text[]) OR LOWER(external_id) = ANY($2::text[]))`,
    [guids, dns]
  );
  const out = new Map();
  for (const object of objects) {
    const row = rows.find((item) => (object.guid && item.directory_guid === object.guid) || canonDn(item.dn) === canonDn(object.dn));
    if (row) out.set(object.dn, { id: row.id, username: row.username, displayName: row.display_name, active: row.is_active !== false });
  }
  return out;
}

async function employeeLinks(ctx, objects, users) {
  if (!ctx.employees || !ctx.rights.employeesView || !objects.length) return new Map();
  const names = objects.flatMap((object) => [object.login, object.upn]).filter(Boolean).map((value) => value.toLowerCase());
  const userIds = [...users.values()].map((user) => user.id);
  try {
    const { rows } = await query(
      `SELECT id, last_name, first_name, middle_name, status, LOWER(ad_account) AS ad_account, user_id FROM employees
        WHERE LOWER(ad_account) = ANY($1::text[]) OR user_id = ANY($2::int[])`,
      [names, userIds]
    );
    const out = new Map();
    for (const object of objects) {
      const user = users.get(object.dn);
      const row = rows.find((item) => (item.ad_account && [object.login, object.upn].filter(Boolean).map((v) => v.toLowerCase()).includes(item.ad_account)) || (user && item.user_id === user.id));
      if (row) out.set(object.dn, { id: row.id, name: [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' '), status: row.status, by: row.ad_account ? 'adAccount' : 'user' });
    }
    return out;
  } catch {
    return new Map();
  }
}

/**
 * Users, groups and computers of an OU (`ou`, default the root; `scope=sub` with the subtree) or,
 * with `q`, a search across the whole root. Filters: kinds, flags (enabled, disabled, locked,
 * pwdExpired, neverLogged, inactive + inactiveDays). Paged: page, pageSize (≤ 500).
 */
export async function listObjects(req, input = {}) {
  const ctx = await directoryContext(req);
  requireReady(ctx);
  const spec = cleanFilter(input, ctx.settings);
  const searchAll = Boolean(spec.text) && input.within !== '1';
  const base = searchAll ? ctx.settings.rootDn : String(input.ou || ctx.settings.rootDn);
  const refusal = scopeRefusal(base, ctx.scope, { allowRoot: true });
  if (refusal) throw refusal;
  const scope = searchAll || spec.flags.length ? 'sub' : spec.scope;
  const maxPwdAgeDays = await ctx.provider.maxPwdAgeDays();
  // Visibility is applied by the provider before its size cut, so hidden objects never take places.
  const { objects, truncated, limit } = await ctx.provider.list(base, compileFilter(spec, { maxPwdAgeDays }), scope, spec, { keep: (object) => visible(object, ctx.scope) });
  const rows = objects.filter((object) => visible(object, ctx.scope) && matchesFilter(object, spec)).sort((a, b) => a.name.localeCompare(b.name));
  const pageSize = Math.min(500, Math.max(10, Number(input.pageSize) || 100));
  const page = Math.max(1, Number(input.page) || 1);
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  const users = await portalLinks(slice);
  const employees = await employeeLinks(ctx, slice, users);
  return {
    items: slice.map((object) => ({ ...rowOf(object), path: ouPath(object.dn, ctx.scope), drive: object.kind === 'group' && isDriveGroup(ctx, object), portalUser: users.get(object.dn) || null, employee: employees.get(object.dn) || null })),
    total: rows.length,
    page,
    pageSize,
    truncated,
    limit: truncated ? limit : null,
    base,
    scope,
    searchAll,
  };
}

// ── one object ──────────────────────────────────────────────────────────────

/** The object at `dn`, re-read (service account / demo) and checked against the scope. */
async function loadObject(ctx, dn, { kinds = null } = {}) {
  const refusal = scopeRefusal(dn, ctx.scope);
  if (refusal) throw refusal;
  const object = await ctx.provider.object(dn);
  if (!object) throw httpError(404, 'The object was not found in Active Directory', 'AD_NOT_FOUND');
  // The server's own spelling of the DN decides (never the one in the request).
  const again = scopeRefusal(object.dn, ctx.scope);
  if (again) throw again;
  if (isHiddenAccount(object, ctx.scope)) throw httpError(403, 'The object is hidden by the module settings', 'AD_EXCLUDED');
  if (kinds && !kinds.includes(object.kind)) throw httpError(400, 'This action is not available for this object', 'AD_WRONG_KIND');
  return object;
}

const assertNotProtected = (ctx, object) => {
  if (object.protected && !ctx.rights.admin) throw httpError(403, 'A protected (administrative) account: only AD directory administrators may change it', 'AD_PROTECTED');
};

/** Folder access groups (sg_…) are written only by File server → Access: never moved, edited or put into groups here. */
const assertNotDriveGroup = (ctx, object) => {
  if (object.kind === 'group' && isDriveGroup(ctx, object)) throw httpError(403, 'Folder access groups are managed in File server → Access', 'AD_DRIVE_GROUP');
};

/**
 * Several objects at once with the checks of loadObject, read in batches (provider.byDns: one
 * search per 40 DNs) instead of one bind per DN. → [{ dn, object } | { dn, error }] in request order;
 * scope refusals and missing objects become `error`, other failures propagate.
 */
async function loadObjects(ctx, dns, { kinds = null } = {}) {
  const out = dns.map((dn) => ({ dn, error: scopeRefusal(dn, ctx.scope) }));
  const wanted = out.filter((item) => !item.error).map((item) => item.dn);
  const found = wanted.length ? await ctx.provider.byDns(wanted) : [];
  const byCanon = new Map(found.map((object) => [canonDn(object.dn), object]));
  for (const item of out) {
    if (item.error) continue;
    const object = byCanon.get(canonDn(item.dn));
    if (!object) item.error = httpError(404, 'The object was not found in Active Directory', 'AD_NOT_FOUND');
    else if (scopeRefusal(object.dn, ctx.scope)) item.error = scopeRefusal(object.dn, ctx.scope);
    else if (isHiddenAccount(object, ctx.scope)) item.error = httpError(403, 'The object is hidden by the module settings', 'AD_EXCLUDED');
    else if (kinds && !kinds.includes(object.kind)) item.error = httpError(400, 'This action is not available for this object', 'AD_WRONG_KIND');
    else item.object = object;
  }
  return out;
}

function groupInfo(ctx, group) {
  const place = placeOf(group.dn, ctx.scope);
  const drive = isDriveGroup(ctx, group);
  const hidden = place === 'inside' && isHiddenAccount(group, ctx.scope);
  const reason = drive ? 'drive' : place !== 'inside' ? (place === 'excluded' ? 'excluded' : 'outside') : hidden ? 'excluded' : null;
  return {
    // Nothing above the root, in an excluded OU or hidden is shown by its DN: by name only.
    dn: place === 'inside' && !hidden ? group.dn : null,
    name: group.cn || group.name,
    login: group.login,
    description: group.description,
    security: group.groupType?.security ?? true,
    groupScope: group.groupType?.scope || null,
    place,
    drive,
    editable: !reason && ctx.rights.manage,
    readOnly: reason,
  };
}

/** The card of a user, group or computer: attributes, groups (with type), members, links, history, available actions. */
export async function objectCard(req, dn) {
  const ctx = await directoryContext(req);
  requireReady(ctx);
  const object = await loadObject(ctx, String(dn || ''));
  const out = { object: { ...object, path: ouPath(object.dn, ctx.scope) } };
  const groups = object.memberOf.length ? await ctx.provider.byDns(object.memberOf) : [];
  const byCanon = new Map(groups.map((group) => [canonDn(group.dn), group]));
  out.groups = object.memberOf
    .map((groupDn) => byCanon.get(canonDn(groupDn)) || { dn: groupDn, cn: nameOf(groupDn), kind: 'group' })
    .map((group) => groupInfo(ctx, group))
    .sort((a, b) => Number(a.drive) - Number(b.drive) || a.name.localeCompare(b.name));
  delete out.object.memberOf;
  if (object.kind === 'group') {
    const members = object.members || [];
    const found = members.length ? await ctx.provider.byDns(members.slice(0, 500)) : [];
    const known = new Map(found.map((item) => [canonDn(item.dn), item]));
    out.members = members.slice(0, 500).map((memberDn) => {
      const item = known.get(canonDn(memberDn));
      const place = placeOf(memberDn, ctx.scope);
      const hidden = item ? isHiddenAccount(item, ctx.scope) : false;
      return {
        dn: memberDn,
        name: item?.name || nameOf(memberDn),
        login: item?.login || null,
        kind: item?.kind || 'other',
        enabled: item?.enabled ?? null,
        place: hidden ? 'excluded' : place,
        // Excluded / hidden members are shown by name only.
        ...(place === 'excluded' || hidden ? { dn: null } : {}),
      };
    });
    out.memberTotal = members.length;
    out.group = groupInfo(ctx, object);
    delete out.object.members;
  }
  if (object.manager) {
    const [manager] = await ctx.provider.byDns([object.manager]).catch(() => []);
    const inScope = placeOf(object.manager, ctx.scope) === 'inside' && !(manager && isHiddenAccount(manager, ctx.scope));
    out.manager = { dn: inScope ? object.manager : null, name: manager?.name || nameOf(object.manager), inScope };
    if (!inScope) out.object.manager = null;
  }
  const users = await portalLinks([object]);
  out.portalUser = users.get(object.dn) || null;
  const employees = await employeeLinks(ctx, [object], users);
  out.employee = employees.get(object.dn) || null;
  out.history = await historyOf(object);
  out.actions = actionsFor(ctx, object);
  out.mode = ctx.mode;
  return out;
}

function actionsFor(ctx, object) {
  const account = object.kind === 'user' || object.kind === 'computer';
  // Folder access groups are changed only in File server → Access.
  const guarded = object.kind === 'group' && isDriveGroup(ctx, object) ? 'drive' : object.protected && !ctx.rights.admin ? 'protected' : null;
  const manage = ctx.rights.manage ? guarded : 'rights';
  const secure = ctx.channel ? null : 'secure';
  return {
    edit: object.kind !== 'computer' ? manage : 'kind',
    move: manage,
    enable: account ? manage : 'kind',
    unlock: object.kind === 'user' ? (ctx.rights.manage || ctx.rights.passwords ? guarded : 'rights') : 'kind',
    password: object.kind === 'user' ? (ctx.rights.passwords ? guarded || secure : 'rights') : 'kind',
    groups: object.kind === 'user' || object.kind === 'computer' || object.kind === 'group' ? manage : 'kind',
    portalUser: object.kind === 'user' ? (ctx.mode === 'demo' ? 'demo' : ctx.rights.usersManage ? null : 'rights') : 'kind',
    employee: object.kind === 'user' && ctx.employees ? (ctx.rights.employeesHr ? null : 'rights') : 'kind',
  };
}

async function historyOf(object) {
  const { rows } = await query(
    `SELECT id, at, action, user_name, ad_account, details, ok, outcome, error_code FROM ad_journal
      WHERE LOWER(target_dn) = LOWER($1) OR ($2::text IS NOT NULL AND details->>'guid' = $2::text) ORDER BY at DESC, id DESC LIMIT 20`,
    [object.dn, object.guid || null]
  );
  return rows.map(journalShape);
}

// ── journal ─────────────────────────────────────────────────────────────────

const clip = (value, max) => (value == null ? null : String(value).slice(0, max));

function actorOf(req, account) {
  return { userId: req.user?.id || null, name: req.user?.displayName || req.user?.username || null, login: req.user?.username || null, adAccount: account || null, ip: req.ip || null, userAgent: req.get?.('user-agent') || null };
}

/** One journal row; a database failure after AD changed never turns the change into a failure. */
export async function record(actor, entry, { demo = false } = {}) {
  try {
    const { rows } = await query(
      `INSERT INTO ad_journal (batch, action, user_id, user_name, user_login, ad_account, ip, user_agent, target_dn, target_name, target_kind, details, ok, outcome, error_code, error, demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [
        clip(entry.batch, 40),
        clip(entry.action, 32),
        actor.userId,
        clip(actor.name, 255),
        clip(actor.login, 255),
        clip(actor.adAccount, 255),
        clip(actor.ip, 64),
        clip(actor.userAgent, 300),
        clip(entry.target?.dn, 2000),
        clip(entry.target?.name, 255),
        clip(entry.target?.kind, 16),
        entry.details == null ? null : JSON.stringify(entry.details),
        entry.ok !== false,
        entry.outcome || (entry.ok === false ? 'failed' : 'changed'),
        clip(entry.errorCode, 40),
        clip(entry.error, 500),
        demo,
      ]
    );
    return rows[0].id;
  } catch (err) {
    console.warn('AD directory: journalling a change failed:', err.message);
    return null;
  }
}

function journalShape(row) {
  return {
    id: Number(row.id),
    at: row.at,
    action: row.action,
    user: row.user_name,
    adAccount: row.ad_account,
    target: row.target_dn ? { dn: row.target_dn, name: row.target_name, kind: row.target_kind } : null,
    details: row.details || null,
    ok: row.ok,
    outcome: row.outcome,
    errorCode: row.error_code,
    demo: row.demo,
  };
}

export const JOURNAL_ACTIONS = ['user_create', 'attributes', 'move', 'enable', 'disable', 'unlock', 'password_reset', 'member_add', 'member_remove', 'portal_user', 'portal_link', 'portal_unlink', 'employee_link', 'employee_unlink'];

export async function listJournal(req, input = {}) {
  const ctx = await directoryContext(req);
  requireView(ctx);
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('$?', `$${params.length}`));
  };
  const actions = String(input.actions || '').split(',').filter((item) => JOURNAL_ACTIONS.includes(item));
  if (actions.length) add('action = ANY($?::text[])', actions);
  if (input.result === 'failed') where.push('ok = FALSE');
  if (input.mine === '1') add('user_id = $?', req.user.id);
  const q = String(input.q || '').trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    add(`(target_name ILIKE $? OR target_dn ILIKE $${params.length + 1} OR user_name ILIKE $${params.length + 1} OR ad_account ILIKE $${params.length + 1})`, like);
  }
  const dn = String(input.dn || '').trim();
  if (dn) add('LOWER(target_dn) = LOWER($?)', dn.slice(0, 2000));
  const pageSize = Math.min(200, Math.max(10, Number(input.pageSize) || 50));
  const page = Math.max(1, Number(input.page) || 1);
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await query(`SELECT COUNT(*)::int AS n FROM ad_journal ${sql}`, params)).rows[0].n);
  const { rows } = await query(`SELECT * FROM ad_journal ${sql} ORDER BY at DESC, id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  return { items: rows.map(journalShape), total, page, pageSize };
}

// ── writes ──────────────────────────────────────────────────────────────────

const event = (req, kind, detail, severity = 'info') => recordSecurityEvent({ kind, severity, username: req.user?.username, ip: req.ip, detail: String(detail).slice(0, 200) }).catch(() => {});

/**
 * Runs `fn(writer, actor)` as the acting administrator (LDAP) or on the demo table. `secure`:
 * the operation needs LDAPS / StartTLS (passwords) and is refused without one. Whenever
 * StartTLS is configured, every session (not only `secure` ones) is upgraded before the bind. A password AD rejects is parked
 * like in File server → Access, so a stale one never locks the account.
 */
async function asAdmin(req, ctx, fn, { secure = false } = {}) {
  if (secure && !ctx.channel) throw httpError(400, 'Password operations need a secure channel to the domain controller (LDAPS or StartTLS)', 'AD_SECURE_REQUIRED');
  if (ctx.mode === 'demo') {
    const actor = actorOf(req, 'demo');
    return ctx.provider.write(null, (writer) => fn(writer, actor));
  }
  // Finding the administrator's own account reaches AD too: its FA_AD_* errors get this module's codes.
  const credential = await actorCredential(req.user.id, { cfg: ctx.cfg }).catch((err) => {
    throw moduleError(err);
  });
  const actor = actorOf(req, credential.account);
  try {
    // With StartTLS configured EVERY bind as the administrator is protected (it carries their own
    // domain password), not only password changes; with LDAPS the connection is already TLS.
    return await ctx.provider.write(credential, (writer) => fn(writer, actor), { startTls: ctx.channel === 'starttls' });
  } catch (err) {
    if (err.code === 'FA_CREDENTIALS_FAILED' && err.details?.reason && err.park !== false) await parkCredential(credential, err.details.reason, { impersonating: isImpersonation(req) });
    throw err;
  }
}

const target = (object) => ({ dn: object.dn, name: object.name, kind: object.kind });
const failure = (err) => ({ ok: false, code: err.code || 'AD_ERROR', error: err.message });

/** Runs one step; a module error becomes a failed result (other errors propagate). */
async function step(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (!err.statusCode || err.statusCode >= 500 && !String(err.code || '').startsWith('AD_')) throw err;
    return failure(err);
  }
}

/** The OU a new object or a move goes to: in scope, an OU or container, existing. */
async function loadOu(ctx, dn) {
  const refusal = scopeRefusal(dn, ctx.scope, { allowRoot: true });
  if (refusal) throw refusal;
  if (canonDn(dn) === canonDn(ctx.settings.rootDn)) return { dn: ctx.settings.rootDn, name: nameOf(ctx.settings.rootDn), kind: 'ou' };
  const ou = await ctx.provider.object(dn);
  if (!ou || !['ou', 'container'].includes(ou.kind)) throw httpError(400, 'Choose an organisational unit inside the managed root', 'AD_BAD_OU');
  const again = scopeRefusal(ou.dn, ctx.scope, { allowRoot: true });
  if (again) throw again;
  return ou;
}

// — attributes —

export async function updateAttributes(req, { dn, changes }) {
  const ctx = await directoryContext(req);
  requireRight(ctx, 'manage');
  const object = await loadObject(ctx, String(dn || ''), { kinds: ['user', 'group'] });
  assertNotDriveGroup(ctx, object);
  assertNotProtected(ctx, object);
  const clean = cleanChanges(changes, ctx.settings.editableAttributes);
  const current = { givenName: object.givenName, sn: object.sn, initials: object.initials, displayName: object.name, description: object.description, title: object.title, department: object.department, company: object.company, mail: object.mail, telephoneNumber: object.phone, mobile: object.mobile, physicalDeliveryOfficeName: object.office, employeeID: object.employeeId, l: object.city, manager: object.manager };
  const diff = clean.filter((change) => (current[change.type] || '') !== (change.values[0] || ''));
  if (!diff.length) return { outcome: 'unchanged', object: await objectCardFor(req, object.dn) };
  const manager = diff.find((change) => change.type === 'manager' && change.values.length);
  if (manager) {
    const [found] = await ctx.provider.byDns(manager.values);
    if (!found || found.kind !== 'user') throw httpError(400, 'The manager was not found in Active Directory', 'AD_BAD_MANAGER', { field: 'manager' });
  }
  const details = { guid: object.guid, changes: diff.map((change) => ({ type: change.type, before: current[change.type] || null, after: change.values[0] || null })) };
  await asAdmin(req, ctx, async (writer, actor) => {
    try {
      await writer.modify(object.dn, diff.map((change) => ({ operation: 'replace', type: change.type, values: change.values })));
    } catch (err) {
      await record(actor, { action: 'attributes', target: target(object), details, ok: false, errorCode: err.code, error: err.message }, { demo: ctx.mode === 'demo' });
      throw err;
    }
    await record(actor, { action: 'attributes', target: target(object), details }, { demo: ctx.mode === 'demo' });
  });
  event(req, 'ad_changed', `attributes · ${object.login || object.name} · ${diff.map((change) => change.type).join(', ')}`);
  return { outcome: 'changed', object: await objectCardFor(req, object.dn) };
}

const objectCardFor = (req, dn) => objectCard(req, dn).catch(() => null);

// — enable / disable / move / offboard (bulk with preview) —

const BULK_MAX = 200;
export const BULK_ACTIONS = ['enable', 'disable', 'move', 'offboard'];

/**
 * Enables, disables, moves or offboards (disable + move to the «Disabled» OU) several objects.
 * `dryRun: true` answers the preview: what would change and what is refused, nothing is written.
 */
export async function bulk(req, { action, dns, targetOu, dryRun = false }) {
  const ctx = await directoryContext(req);
  requireRight(ctx, 'manage');
  if (!BULK_ACTIONS.includes(action)) throw httpError(400, 'Unknown action', 'AD_ACTION');
  const list = [...new Set((Array.isArray(dns) ? dns : [dns]).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!list.length) throw httpError(400, 'Choose at least one object', 'AD_NOTHING');
  if (list.length > BULK_MAX) throw httpError(400, `At most ${BULK_MAX} objects at once`, 'AD_TOO_MANY');
  let ou = null;
  if (action === 'move' || action === 'offboard') {
    const where = action === 'offboard' ? ctx.settings.disabledOu : targetOu;
    if (!where) throw httpError(400, action === 'offboard' ? 'Set the OU for disabled accounts in the module settings' : 'Choose the target OU', action === 'offboard' ? 'AD_NO_DISABLED_OU' : 'AD_BAD_OU');
    ou = await loadOu(ctx, where);
  }
  const plan = [];
  const loaded = await loadObjects(ctx, list);
  for (const { dn, object, error } of loaded) {
    try {
      if (error) throw error;
      assertNotDriveGroup(ctx, object);
      assertNotProtected(ctx, object);
      if (action !== 'move' && !['user', 'computer'].includes(object.kind)) throw httpError(400, 'This action is not available for this object', 'AD_WRONG_KIND');
      if (action === 'move' && !['user', 'group', 'computer'].includes(object.kind)) throw httpError(400, 'This action is not available for this object', 'AD_WRONG_KIND');
    } catch (err) {
      if (!err.statusCode || err.statusCode >= 500) throw err;
      plan.push({ dn, name: object?.name || nameOf(dn), kind: object?.kind || null, refused: err.code });
      continue;
    }
    const inOu = ou ? canonDn(object.parentDn) === canonDn(ou.dn) : false;
    const changes = [];
    if ((action === 'disable' || action === 'offboard') && object.enabled) changes.push('disable');
    if (action === 'enable' && object.enabled === false) changes.push('enable');
    if ((action === 'move' || action === 'offboard') && !inOu) changes.push('move');
    plan.push({ dn: object.dn, name: object.name, login: object.login, kind: object.kind, enabled: object.enabled, from: ouPath(object.dn, ctx.scope), to: ou ? ouPathOf(ou.dn, ctx.scope) : null, changes, object });
  }
  const preview = plan.map(({ object, ...rest }) => rest);
  if (dryRun) return { dryRun: true, action, target: ou ? { dn: ou.dn, name: ou.name } : null, items: preview };
  const batch = randomUUID();
  const results = await asAdmin(req, ctx, async (writer, actor) => {
    const out = [];
    for (const item of plan) {
      if (item.refused || !item.changes.length) {
        out.push({ dn: item.dn, name: item.name, ok: !item.refused, outcome: item.refused ? 'refused' : 'unchanged', code: item.refused || null });
        continue;
      }
      const { object } = item;
      let done = { ok: true, outcome: 'changed' };
      for (const change of item.changes) {
        if (change === 'disable' || change === 'enable') {
          const uac = object.uac || UAC.NORMAL_ACCOUNT;
          const next = change === 'disable' ? uac | UAC.ACCOUNTDISABLE : uac & ~UAC.ACCOUNTDISABLE;
          const result = await step(() => writer.modify(object.dn, [{ operation: 'replace', type: 'userAccountControl', values: [String(next)] }]));
          await record(actor, { action: change, batch, target: target(object), details: { guid: object.guid, via: action }, ok: result.ok, errorCode: result.code, error: result.error }, { demo: ctx.mode === 'demo' });
          if (!result.ok) {
            done = result;
            break;
          }
        } else if (change === 'move') {
          const newDn = `${firstRdn(object.dn)},${ou.dn}`;
          const result = await step(() => writer.move(object.dn, newDn));
          await record(actor, { action: 'move', batch, target: { ...target(object), dn: result.ok ? newDn : object.dn }, details: { guid: object.guid, from: object.dn, to: newDn, via: action }, ok: result.ok, errorCode: result.code, error: result.error }, { demo: ctx.mode === 'demo' });
          if (!result.ok) {
            done = result;
            break;
          }
        }
      }
      out.push({ dn: object.dn, name: object.name, ...done, outcome: done.ok ? 'changed' : 'failed' });
    }
    return out;
  });
  const changed = results.filter((item) => item.outcome === 'changed').length;
  const failed = results.filter((item) => item.outcome === 'failed').length;
  if (changed || failed) event(req, 'ad_changed', `${action} · ${changed} changed, ${failed} failed${ou ? ` → ${ou.name}` : ''}`, failed ? 'warning' : 'info');
  return { action, results, changed, failed, unchanged: results.filter((item) => item.outcome === 'unchanged').length, refused: results.filter((item) => item.outcome === 'refused').length };
}

// — unlock / password —

export async function unlock(req, { dn }) {
  const ctx = await directoryContext(req);
  requireRight(ctx, ['manage', 'passwords']);
  const object = await loadObject(ctx, String(dn || ''), { kinds: ['user'] });
  assertNotProtected(ctx, object);
  if (!object.locked) return { outcome: 'unchanged' };
  await asAdmin(req, ctx, async (writer, actor) => {
    const result = await step(() => writer.modify(object.dn, [{ operation: 'replace', type: 'lockoutTime', values: ['0'] }]));
    await record(actor, { action: 'unlock', target: target(object), details: { guid: object.guid }, ok: result.ok, errorCode: result.code, error: result.error }, { demo: ctx.mode === 'demo' });
    if (!result.ok) throw Object.assign(httpError(400, result.error, result.code));
  });
  event(req, 'ad_changed', `unlock · ${object.login || object.name}`);
  return { outcome: 'changed' };
}

/**
 * Sets a new password (never stored or logged), optionally «must change at next logon» and
 * unlocking. Refused without LDAPS / StartTLS (AD itself refuses unicodePwd in clear).
 */
export async function resetPassword(req, { dn, password, mustChange = true, unlock: alsoUnlock = true }) {
  const ctx = await directoryContext(req);
  requireRight(ctx, 'passwords');
  const object = await loadObject(ctx, String(dn || ''), { kinds: ['user'] });
  assertNotProtected(ctx, object);
  if (!ctx.channel) throw httpError(400, 'Password operations need a secure channel to the domain controller (LDAPS or StartTLS)', 'AD_SECURE_REQUIRED');
  const issues = passwordIssues(password, { minLength: ctx.settings.passwordMinLength, complexity: ctx.settings.passwordComplexity }, { login: object.login, name: object.name });
  if (issues.length) throw httpError(400, 'The password does not meet the policy', 'AD_PASSWORD_WEAK', { issues });
  const details = { guid: object.guid, mustChange: Boolean(mustChange), unlock: Boolean(alsoUnlock && object.locked) };
  // Two steps, reported apart: once the password is set it IS changed, even when the flags
  // (must change at next logon, unlock) fail afterwards — like the create wizard's steps.
  const flagsStep = await asAdmin(
    req,
    ctx,
    async (writer, actor) => {
      try {
        await writer.setPassword(object.dn, String(password));
      } catch (err) {
        await record(actor, { action: 'password_reset', target: target(object), details: { ...details, steps: ['password'] }, ok: false, errorCode: err.code, error: err.message }, { demo: ctx.mode === 'demo' });
        throw err;
      }
      const extra = [];
      if (mustChange) extra.push({ operation: 'replace', type: 'pwdLastSet', values: ['0'] });
      if (alsoUnlock && object.locked) extra.push({ operation: 'replace', type: 'lockoutTime', values: ['0'] });
      const flags = extra.length ? await step(() => writer.modify(object.dn, extra)) : { ok: true };
      await record(
        actor,
        { action: 'password_reset', target: target(object), details: { ...details, passwordSet: true, flagsSet: flags.ok, ...(flags.ok ? {} : { steps: ['flags'] }) }, ok: true, outcome: flags.ok ? 'changed' : 'partial', errorCode: flags.code, error: flags.error },
        { demo: ctx.mode === 'demo' }
      );
      return flags;
    },
    { secure: true }
  );
  event(req, 'ad_password_reset', `${object.login || object.name}${mustChange ? ' · must change' : ''}${flagsStep.ok ? '' : ' · flags failed'}`, 'warning');
  const steps = [{ step: 'password', ok: true }, ...(details.mustChange || details.unlock ? [{ step: 'flags', ...pick(flagsStep) }] : [])];
  if (!flagsStep.ok) return { outcome: 'partial', mustChange: false, steps, warnings: ['flags_failed'] };
  return { outcome: 'changed', mustChange: Boolean(mustChange), steps, warnings: [] };
}

// — group membership —

/**
 * Adds or removes members in groups (one member in several groups from a user card, or several
 * members in one group from a group card). Groups and members must be in scope; folder access
 * groups (sg_…) are refused (File server → Access manages them).
 */
export async function membership(req, { groups, members, action }) {
  const ctx = await directoryContext(req);
  requireRight(ctx, 'manage');
  if (!['add', 'remove'].includes(action)) throw httpError(400, 'Unknown action', 'AD_ACTION');
  const groupDns = [...new Set((Array.isArray(groups) ? groups : [groups]).map(String).filter(Boolean))];
  const memberDns = [...new Set((Array.isArray(members) ? members : [members]).map(String).filter(Boolean))];
  if (!groupDns.length || !memberDns.length) throw httpError(400, 'Choose a group and a member', 'AD_NOTHING');
  if (groupDns.length * memberDns.length > 100) throw httpError(400, 'At most 100 changes at once', 'AD_TOO_MANY');
  const groupObjects = [];
  for (const { object: group, error } of await loadObjects(ctx, groupDns, { kinds: ['group'] })) {
    if (error) throw error;
    assertNotDriveGroup(ctx, group);
    assertNotProtected(ctx, group);
    groupObjects.push(group);
  }
  const memberObjects = [];
  // Removing: a member that is out of scope may still be taken out of an in-scope group.
  const outside = (dn) => action === 'remove' && placeOf(dn, ctx.scope) !== 'inside';
  for (const dn of memberDns) if (placeOf(dn, ctx.scope) === 'invalid') throw httpError(400, 'Not a valid distinguished name', 'AD_BAD_DN');
  const loadedMembers = new Map((await loadObjects(ctx, memberDns.filter((dn) => !outside(dn)), { kinds: ['user', 'group', 'computer'] })).map((item) => [item.dn, item]));
  for (const dn of memberDns) {
    if (outside(dn)) {
      memberObjects.push({ dn, name: nameOf(dn), kind: 'other' });
      continue;
    }
    const { object: member, error } = loadedMembers.get(dn);
    if (error) throw error;
    // A protected account's groups are changed only by AD directory administrators; a folder
    // access group's own memberships belong to File server → Access.
    assertNotProtected(ctx, member);
    assertNotDriveGroup(ctx, member);
    memberObjects.push(member);
  }
  const batch = randomUUID();
  const results = await asAdmin(req, ctx, async (writer, actor) => {
    const out = [];
    for (const group of groupObjects) {
      for (const member of memberObjects) {
        const result = await step(() => (action === 'add' ? writer.addMember(group.dn, member.dn) : writer.removeMember(group.dn, member.dn)));
        const outcome = !result.ok ? 'failed' : result.value === 'unchanged' ? 'unchanged' : 'changed';
        await record(
          actor,
          { action: action === 'add' ? 'member_add' : 'member_remove', batch, target: target(member), details: { guid: member.guid, group: { dn: group.dn, name: group.cn || group.name } }, ok: result.ok, outcome, errorCode: result.code, error: result.error },
          { demo: ctx.mode === 'demo' }
        );
        out.push({ group: group.cn || group.name, member: member.name, ok: result.ok, outcome, code: result.code || null, error: result.error || null });
      }
    }
    return out;
  });
  const changed = results.filter((item) => item.outcome === 'changed').length;
  const failed = results.filter((item) => !item.ok).length;
  // New groups reach the File server only through a new SMB session (drive/sessions.js).
  if (changed && ctx.mode !== 'demo') {
    if (memberObjects.some((member) => member.kind !== 'user' && member.kind !== 'computer')) markAllStale();
    else markLoginsStale(memberObjects.map((member) => member.login));
  }
  if (changed || failed) event(req, 'ad_changed', `${action === 'add' ? '+' : '−'} members · ${changed} changed, ${failed} failed`, failed ? 'warning' : 'info');
  return { results, changed, failed, unchanged: results.filter((item) => item.outcome === 'unchanged').length };
}

/** Groups to add to (in scope, not folder access groups) whose name contains `q`. */
export async function findGroups(req, q) {
  const ctx = await directoryContext(req);
  requireReady(ctx);
  const spec = cleanFilter({ q, kinds: 'group' }, ctx.settings);
  if (spec.text.length < 1) return [];
  const { objects } = await ctx.provider.list(ctx.settings.rootDn, compileFilter(spec), 'sub', spec, { keep: (object) => visible(object, ctx.scope) });
  return objects
    .filter((object) => visible(object, ctx.scope) && !isDriveGroup(ctx, object))
    .slice(0, 30)
    .map((object) => ({ ...groupInfo(ctx, object), path: ouPath(object.dn, ctx.scope) }));
}

/** Users (and groups / computers) in scope whose name contains `q`, for pickers. */
export async function findObjects(req, q, kinds = 'user') {
  const ctx = await directoryContext(req);
  requireReady(ctx);
  const spec = cleanFilter({ q, kinds }, ctx.settings);
  if (spec.text.length < 2) return [];
  const { objects } = await ctx.provider.list(ctx.settings.rootDn, compileFilter(spec), 'sub', spec, { keep: (object) => visible(object, ctx.scope) });
  return objects.filter((object) => visible(object, ctx.scope)).slice(0, 30).map((object) => ({ dn: object.dn, name: object.name, login: object.login, kind: object.kind, enabled: object.enabled, path: ouPath(object.dn, ctx.scope) }));
}

// — new users —

/** The login the template makes for a person, the first free one, the UPN suffixes and the mail. */
export async function suggestLogin(req, person = {}) {
  const ctx = await directoryContext(req);
  // It tells whether a login exists anywhere in the domain (hidden accounts too): creators only.
  requireRight(ctx, 'manage');
  const base = loginFromTemplate(ctx.settings.loginTemplate, person);
  const suffixes = upnSuffixes(ctx.settings, ctx.baseDn || '');
  if (!base) return { base: '', login: '', taken: false, suffixes, mail: '' };
  const candidates = loginCandidates(base);
  const taken = await ctx.provider.takenLogins(candidates);
  const login = freeLogin(base, taken.logins);
  return { base, login, taken: taken.logins.has(base.toLowerCase()), suffixes, mail: mailFromTemplate(ctx.settings.mailTemplate, person, login || base, suffixes[0] || '') };
}

/** Is this login / UPN free in the whole domain? */
export async function checkLogin(req, { login, upn }) {
  const ctx = await directoryContext(req);
  requireRight(ctx, 'manage');
  const value = String(login || '').trim().toLowerCase();
  if (!loginValid(value)) return { valid: false, taken: false, upnTaken: false };
  const taken = await ctx.provider.takenLogins([value], upn ? [String(upn).toLowerCase()] : []);
  return { valid: true, taken: taken.logins.has(value), upnTaken: upn ? taken.upns.has(String(upn).toLowerCase()) : false, suggestion: taken.logins.has(value) ? freeLogin(value, (await ctx.provider.takenLogins(loginCandidates(value))).logins) : null };
}

const cleanName = (value, max = 64) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

const CN_MAX = 64;

/**
 * The CN of a new user (AD allows 64 characters; displayName may be longer): the name cut to
 * fit, and with `login` the twin form «Name (login)» where the name is cut, never the login.
 */
export function cnFor(displayName, login = null) {
  const suffix = login ? ` (${login})` : '';
  return `${String(displayName).slice(0, CN_MAX - suffix.length).trimEnd()}${suffix}`;
}

/**
 * Creates a user (wizard): names → login (free in the domain) → OU (in scope) → UPN / mail →
 * initial password (secure channel only) + must change → groups. Without a password the
 * account is created disabled (AD does not enable an account without one).
 * → { dn, login, steps: [{ step, ok, code }], warnings }.
 */
export async function createUserAccount(req, input = {}) {
  const ctx = await directoryContext(req);
  requireRight(ctx, 'manage');
  if (!ctx.settings.allowCreate) throw httpError(403, 'Creating users is turned off in the module settings', 'AD_CREATE_OFF');
  const givenName = cleanName(input.givenName);
  const sn = cleanName(input.sn);
  if (!givenName || !sn) throw httpError(400, 'Enter the first and last name', 'AD_NAME_REQUIRED', { field: givenName ? 'sn' : 'givenName' });
  const displayName = cleanName(input.displayName, 256) || `${givenName} ${sn}`;
  const login = String(input.login || '').trim().toLowerCase();
  if (!loginValid(login)) throw httpError(400, 'The login may have 2–20 Latin letters, digits, dots, dashes and underscores', 'AD_BAD_LOGIN', { field: 'login' });
  const suffixes = upnSuffixes(ctx.settings, ctx.baseDn || '');
  const suffix = String(input.upnSuffix || suffixes[0] || '').toLowerCase();
  if (!suffixes.includes(suffix)) throw httpError(400, 'Choose a UPN suffix from the list', 'AD_BAD_UPN', { field: 'upnSuffix' });
  const upn = `${login}@${suffix}`;
  const mail = String(input.mail || '').trim();
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw httpError(400, 'Not an e-mail address', 'AD_BAD_MAIL', { field: 'mail' });
  const ou = await loadOu(ctx, String(input.ou || ctx.settings.defaultUserOu || ''));
  const password = input.password ? String(input.password) : '';
  if (password) {
    if (!ctx.channel) throw httpError(400, 'Password operations need a secure channel to the domain controller (LDAPS or StartTLS)', 'AD_SECURE_REQUIRED', { field: 'password' });
    const issues = passwordIssues(password, { minLength: ctx.settings.passwordMinLength, complexity: ctx.settings.passwordComplexity }, { login, name: displayName });
    if (issues.length) throw httpError(400, 'The password does not meet the policy', 'AD_PASSWORD_WEAK', { issues, field: 'password' });
  }
  const taken = await ctx.provider.takenLogins([login], [upn]);
  if (taken.logins.has(login)) throw httpError(409, 'This login is already taken in the domain', 'AD_LOGIN_TAKEN', { field: 'login', suggestion: freeLogin(login, (await ctx.provider.takenLogins(loginCandidates(login))).logins) });
  if (taken.upns.has(upn)) throw httpError(409, 'This UPN is already taken in the domain', 'AD_UPN_TAKEN', { field: 'login' });
  const groupObjects = [];
  for (const dn of [...new Set((input.groups || []).map(String))].slice(0, 30)) {
    const group = await loadObject(ctx, dn, { kinds: ['group'] });
    assertNotDriveGroup(ctx, group);
    // Same rule as membership(): a protected (adminCount) group needs ad.admin.
    assertNotProtected(ctx, group);
    groupObjects.push(group);
  }
  const optional = { title: 64 * 2, department: 64, company: 64, telephoneNumber: 64, mobile: 64, description: 1024, physicalDeliveryOfficeName: 128, employeeID: 16 };
  // Two people with the same name in one OU: the second CN carries the login («Anna Smith (a.smith2)»).
  let dn = childDn('CN', cnFor(displayName), ou.dn);
  if (await ctx.provider.object(dn).catch(() => null)) dn = childDn('CN', cnFor(displayName, login), ou.dn);
  const attrs = {
    objectClass: ['top', 'person', 'organizationalPerson', 'user'],
    cn: parseDn(dn)[0].value,
    givenName,
    sn,
    displayName,
    sAMAccountName: login,
    userPrincipalName: upn,
    // Created disabled; enabled once a password is set (AD refuses an enabled account without one).
    userAccountControl: String(UAC.NORMAL_ACCOUNT | UAC.ACCOUNTDISABLE),
  };
  if (mail) attrs.mail = mail;
  const initials = cleanName(input.initials, 6);
  if (initials) attrs.initials = initials;
  for (const [key, max] of Object.entries(optional)) {
    const value = cleanName(input[key], max);
    if (value) attrs[key] = value;
  }
  const enable = input.enabled !== false && Boolean(password);
  const mustChange = Boolean(password) && input.mustChange !== false;
  const batch = randomUUID();
  const created = await asAdmin(
    req,
    ctx,
    async (writer, actor) => {
      const steps = [];
      const object = { dn, name: displayName, kind: 'user' };
      try {
        await writer.add(dn, attrs);
      } catch (err) {
        await record(actor, { action: 'user_create', batch, target: object, details: { login, upn, ou: ou.dn }, ok: false, errorCode: err.code, error: err.message }, { demo: ctx.mode === 'demo' });
        throw err;
      }
      steps.push({ step: 'create', ok: true });
      if (password) {
        const set = await step(() => writer.setPassword(dn, password));
        steps.push({ step: 'password', ...pick(set) });
        if (set.ok) {
          const flags = [];
          if (enable) flags.push({ operation: 'replace', type: 'userAccountControl', values: [String(UAC.NORMAL_ACCOUNT)] });
          if (mustChange) flags.push({ operation: 'replace', type: 'pwdLastSet', values: ['0'] });
          if (flags.length) steps.push({ step: 'enable', ...pick(await step(() => writer.modify(dn, flags))) });
        }
      }
      for (const group of groupObjects) {
        const result = await step(() => writer.addMember(group.dn, dn));
        steps.push({ step: 'group', group: group.cn || group.name, ...pick(result) });
      }
      const details = { login, upn, ou: ou.dn, mail: mail || null, passwordSet: steps.some((item) => item.step === 'password' && item.ok), enabled: steps.some((item) => item.step === 'enable' && item.ok) && enable, mustChange, groups: groupObjects.map((group) => group.cn || group.name), steps: steps.filter((item) => !item.ok).map((item) => item.step) };
      await record(actor, { action: 'user_create', batch, target: object, details }, { demo: ctx.mode === 'demo' });
      return { steps, details };
    },
    { secure: Boolean(password) }
  );
  const warnings = [];
  if (!password) warnings.push('created_disabled');
  else if (!created.details.passwordSet) warnings.push('password_failed');
  event(req, 'ad_changed', `user created · ${login} · ${ou.name}`);
  let employee = null;
  if (input.employeeId) employee = await linkEmployee(req, { dn, employeeId: input.employeeId, login }).catch((err) => ({ error: err.code || 'ERROR' }));
  return { dn, login, upn, steps: created.steps, warnings, employee };
}

const pick = (result) => (result.ok ? { ok: true } : { ok: false, code: result.code, error: result.error });

// ── links to the portal ─────────────────────────────────────────────────────

function requirePortalLinks(ctx) {
  requireReady(ctx);
  if (ctx.mode === 'demo') throw httpError(409, 'Not available in the demo directory', 'AD_DEMO_ONLY');
  if (!ctx.rights.usersManage) throw httpError(403, 'Linking portal accounts needs the users.manage permission', 'FORBIDDEN');
}

/** Creates a portal account for an AD user and links it (sign-in with the domain login follows). */
export async function createPortalUser(req, { dn, username }) {
  const ctx = await directoryContext(req);
  requirePortalLinks(ctx);
  const object = await loadObject(ctx, String(dn || ''), { kinds: ['user'] });
  const linked = await portalLinks([object]);
  if (linked.get(object.dn)) throw httpError(409, 'This AD account is already linked to a portal account', 'DIRECTORY_TAKEN', { username: linked.get(object.dn).username });
  const name = String(username || object.login || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);
  const actor = { id: req.user.id, permissions: new Set(req.access?.permissions || []) };
  let email = object.mail || null;
  if (email && (await query(`SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`, [email])).rows.length) email = null;
  const user = await createUser({ username: name, email, displayName: object.name }, actor);
  await setPortalLink(user.id, object);
  await record(actorOf(req, null), { action: 'portal_user', target: target(object), details: { guid: object.guid, userId: user.id, username: user.username } }, { demo: false });
  recordSecurityEvent({ kind: 'directory_linked', severity: 'info', username: req.user?.username, ip: req.ip, detail: `@${user.username} · ${object.login}` }).catch(() => {});
  return { user: { id: user.id, username: user.username, displayName: user.displayName } };
}

async function setPortalLink(userId, object) {
  const guid = object.guid ? String(object.guid).toLowerCase() : null;
  await withTransaction(async (client) => {
    if (guid) await client.query(`UPDATE users SET directory_guid = NULL WHERE directory_guid = $1 AND id <> $2`, [guid, userId]);
    await client.query(`UPDATE users SET external_id = $2, directory_guid = $3, auth_source = 'ldap', updated_at = NOW() WHERE id = $1`, [userId, object.dn, guid]);
  });
}

/**
 * May the caller re-point portal account `userId` (link / unlink)? The same rule as the admin
 * console (services/users.js assertCanManage: never a user with more access than the caller),
 * and a superadministrator's account only by a superadministrator. A refusal is journalled and
 * reported to Activity.
 */
async function assertMayRelink(req, userId, { action, object, username }) {
  const actor = req.actor || { id: req.user.id, permissions: new Set(req.access?.permissions || []) };
  try {
    const access = await getUserAccess(userId);
    if ((access.permissions || []).includes('*') && !actor.permissions.has('*')) {
      throw httpError(403, 'Only a superadministrator may link or unlink a superadministrator account', 'AD_LINK_SUPERADMIN');
    }
    await assertCanManage(actor, userId).catch((err) => {
      if (err.statusCode === 403) throw httpError(403, err.message, 'AD_LINK_FORBIDDEN');
      throw err;
    });
  } catch (err) {
    if (err.statusCode === 403) {
      await record(actorOf(req, null), { action, target: target(object), details: { guid: object.guid || null, userId, username: username || null }, ok: false, outcome: 'refused', errorCode: err.code, error: err.message });
      event(req, 'ad_changed', `${action} refused · @${username || userId} · ${object.login || object.name}`, 'warning');
    }
    throw err;
  }
}

/** Links an existing portal account to an AD user. */
export async function linkPortalUser(req, { dn, userId }) {
  const ctx = await directoryContext(req);
  requirePortalLinks(ctx);
  const object = await loadObject(ctx, String(dn || ''), { kinds: ['user'] });
  const id = Number(userId) || 0;
  const { rows } = await query(`SELECT id, username, auth_source, external_id FROM users WHERE id = $1`, [id]);
  if (!rows[0]) throw httpError(404, 'User not found', 'NOT_FOUND');
  const linked = (await portalLinks([object])).get(object.dn);
  if (linked && linked.id !== id) throw httpError(409, 'This AD account is already linked to a portal account', 'DIRECTORY_TAKEN', { username: linked.username });
  // Signing in with this AD account will land in that portal account: never one the caller could not manage.
  await assertMayRelink(req, id, { action: 'portal_link', object, username: rows[0].username });
  await setPortalLink(id, object);
  await record(actorOf(req, null), { action: 'portal_link', target: target(object), details: { guid: object.guid, userId: id, username: rows[0].username } });
  recordSecurityEvent({ kind: 'directory_linked', severity: 'info', username: req.user?.username, ip: req.ip, detail: `@${rows[0].username} · ${object.login}` }).catch(() => {});
  return { user: { id, username: rows[0].username } };
}

export async function unlinkPortalUser(req, { dn }) {
  const ctx = await directoryContext(req);
  requirePortalLinks(ctx);
  const object = await loadObject(ctx, String(dn || ''), { kinds: ['user'] });
  const linked = (await portalLinks([object])).get(object.dn);
  if (!linked) return { outcome: 'unchanged' };
  await assertMayRelink(req, linked.id, { action: 'portal_unlink', object, username: linked.username });
  await unlinkDirectory(linked.id);
  await record(actorOf(req, null), { action: 'portal_unlink', target: target(object), details: { guid: object.guid, userId: linked.id, username: linked.username } });
  recordSecurityEvent({ kind: 'directory_unlinked', severity: 'info', username: req.user?.username, ip: req.ip, detail: `@${linked.username}` }).catch(() => {});
  return { outcome: 'changed' };
}

// ── links to employees (module «Сотрудники») ────────────────────────────────

function requireEmployeeLinks(ctx) {
  requireReady(ctx);
  if (!ctx.employees) throw httpError(409, 'The Employees module is off', 'EMPLOYEES_OFF');
  if (!ctx.rights.employeesHr) throw httpError(403, 'Linking employees needs the employees.hr permission', 'FORBIDDEN');
}

/** Employees (HR view) whose name contains `q`, for the link picker. */
export async function findEmployees(req, q) {
  const ctx = await directoryContext(req);
  requireEmployeeLinks(ctx);
  const text = String(q || '').trim().slice(0, 60);
  if (text.length < 2) return [];
  const like = `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const { rows } = await query(
    `SELECT id, last_name, first_name, middle_name, status, ad_account FROM employees
      WHERE (last_name || ' ' || first_name || ' ' || COALESCE(middle_name, '')) ILIKE $1 OR (first_name || ' ' || last_name) ILIKE $1
      ORDER BY LOWER(last_name), LOWER(first_name) LIMIT 20`,
    [like]
  );
  return rows.map((row) => ({ id: row.id, name: [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' '), status: row.status, adAccount: row.ad_account }));
}

/** Writes the AD login into the employee card (employees.ad_account). */
export async function linkEmployee(req, { dn, employeeId, login: knownLogin }) {
  const ctx = await directoryContext(req);
  requireEmployeeLinks(ctx);
  const object = knownLogin ? { dn, login: knownLogin, name: nameOf(dn), kind: 'user' } : await loadObject(ctx, String(dn || ''), { kinds: ['user'] });
  const id = Number(employeeId) || 0;
  const { rows } = await query(
    `UPDATE employees e SET ad_account = $2, updated_at = NOW() FROM (SELECT id, ad_account FROM employees WHERE id = $1) old
      WHERE e.id = old.id RETURNING e.id, e.last_name, e.first_name, old.ad_account AS before`,
    [id, object.login]
  );
  if (!rows[0]) throw httpError(404, 'Employee not found', 'NOT_FOUND');
  // `before`: the demo purge puts the card back from the journal (demo logins never survive it).
  await record(actorOf(req, null), { action: 'employee_link', target: target(object), details: { guid: object.guid || null, employeeId: id, login: object.login, before: rows[0].before || null } }, { demo: ctx.mode === 'demo' });
  return { employee: { id, name: `${rows[0].last_name} ${rows[0].first_name}` } };
}

export async function unlinkEmployee(req, { employeeId }) {
  const ctx = await directoryContext(req);
  requireEmployeeLinks(ctx);
  const id = Number(employeeId) || 0;
  const { rows } = await query(`UPDATE employees e SET ad_account = NULL, updated_at = NOW() FROM (SELECT id, ad_account FROM employees WHERE id = $1) old WHERE e.id = old.id RETURNING old.ad_account`, [id]);
  if (!rows[0]) throw httpError(404, 'Employee not found', 'NOT_FOUND');
  await record(actorOf(req, null), { action: 'employee_unlink', target: null, details: { employeeId: id, login: rows[0].ad_account } }, { demo: ctx.mode === 'demo' });
  return { outcome: rows[0].ad_account ? 'changed' : 'unchanged' };
}

/**
 * The «AD» section of an employee card (employees/extensions.js): the linked account (by the
 * card's AD login, else by the linked portal account's DN) and what the viewer may do.
 */
export async function employeeSection(req, employee) {
  const ctx = await directoryContext(req);
  if (!ctx.rights.view) return { available: false, reason: 'rights' };
  if (ctx.mode === 'off') return { available: false, reason: 'off' };
  if (!ctx.scope.root) return { available: false, reason: 'root' };
  let object = null;
  let by = null;
  const login = String(employee.adAccount || '').trim();
  if (login) {
    const spec = cleanFilter({ kinds: 'user' }, ctx.settings);
    const value = login.includes('@') ? login.split('@')[0] : login.includes('\\') ? login.slice(login.lastIndexOf('\\') + 1) : login;
    const { objects } = await ctx.provider.list(ctx.settings.rootDn, compileFilter({ ...spec, text: value }), 'sub', { ...spec, text: value });
    object = objects.find((item) => String(item.login || '').toLowerCase() === value.toLowerCase()) || null;
    by = object ? 'adAccount' : null;
    if (!object) return { available: true, mode: ctx.mode, account: null, missing: login, rights: sectionRights(ctx) };
  } else if (employee.userId) {
    const { rows } = await query(`SELECT external_id FROM users WHERE id = $1 AND auth_source = 'ldap'`, [employee.userId]);
    if (rows[0]?.external_id && placeOf(rows[0].external_id, ctx.scope) === 'inside') {
      object = await ctx.provider.object(rows[0].external_id).catch(() => null);
      by = object ? 'user' : null;
    }
  }
  if (object && !visible(object, ctx.scope)) return { available: true, mode: ctx.mode, account: { hidden: true }, rights: sectionRights(ctx) };
  const suggestion = object ? null : await suggestLogin(req, { first: employee.firstName, last: employee.lastName, middle: employee.middleName }).catch(() => null);
  return {
    available: true,
    mode: ctx.mode,
    by,
    account: object ? { ...rowOf(object), path: ouPath(object.dn, ctx.scope) } : null,
    suggestion,
    rights: sectionRights(ctx),
  };
}

const sectionRights = (ctx) => ({ create: ctx.rights.manage && ctx.settings.allowCreate, link: ctx.rights.employeesHr, open: ctx.rights.view });

// ── the administrator's domain password, settings helpers ──────────────────

/** Saves the acting administrator's own domain password (checked with a bind first). */
export async function saveCredential(req, password) {
  const ctx = await directoryContext(req);
  requireReady(ctx);
  if (ctx.mode !== 'ldap') throw httpError(409, 'Not needed in the demo directory', 'AD_DEMO_ONLY');
  if (!ctx.rights.manage && !ctx.rights.passwords) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
  try {
    // The check bind carries the administrator's own password: over StartTLS when it is configured.
    const { login } = await savePassword(ctx.cfg, req.user.id, password, { startTls: ctx.channel === 'starttls' });
    event(req, 'ad_credential', `saved for ${login}`);
    return { login };
  } catch (err) {
    if (err.code === 'FA_PASSWORD_WRONG') event(req, 'ad_credential', `rejected (${err.details?.reason || 'AUTH_FAILED'})`, 'warning');
    throw moduleError(err);
  }
}

/** Settings → OU picker: children of `dn` from the integration's base DN (marks what is excluded). */
export async function browse(req, dn) {
  const ctx = await directoryContext(req);
  requireView(ctx);
  if (!ctx.rights.admin && !ctx.rights.settings) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
  if (ctx.mode === 'off') throw httpError(409, 'Active Directory is not set up (Settings → Integrations)', 'AD_OFF');
  const at = String(dn || ctx.baseDn);
  if (!parseDn(at)) throw httpError(400, 'Not a valid distinguished name', 'AD_BAD_DN');
  const children = await ctx.provider.children(at);
  return {
    dn: at,
    name: nameOf(at),
    parent: parseDn(at).length > 1 && !(ctx.baseDn && canonDn(at) === canonDn(ctx.baseDn)) ? parentDn(at) : null,
    children: children.map((child) => ({ ...child, place: ctx.scope.root ? placeOf(child.dn, ctx.scope) : null })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Settings → «Check the secure channel»: can the service account bind over LDAPS / StartTLS? */
export async function checkSecureChannel(req) {
  const ctx = await directoryContext(req);
  requireView(ctx);
  if (!ctx.rights.admin && !ctx.rights.settings) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
  if (ctx.mode === 'off') throw httpError(409, 'Active Directory is not set up (Settings → Integrations)', 'AD_OFF');
  if (!ctx.channel) return { channel: null, ok: false };
  return { channel: ctx.channel, ...(await ctx.provider.checkSecure(ctx.channel)) };
}
