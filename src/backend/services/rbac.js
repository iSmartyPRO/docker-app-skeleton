import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/database.js';
import {
  ALL,
  LOCKED_ROLE,
  SYSTEM_ROLES,
  hasPermission,
  isSubset,
  normalizePermissions,
} from './permissions.js';
import { invalidateSettings } from './settings.js';
import { localeOrDefault, pick } from './i18n/index.js';

/*
 * Roles and groups.
 *
 *   app_roles           role definitions (permissions[])
 *   app_groups          departments / teams; one may be the default for new users
 *   group_roles         roles a group grants to its members
 *   user_roles          roles assigned to a user directly
 *   user_group_members  group membership
 *
 * Effective permissions = direct roles ∪ roles of the user's groups.
 */

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

// ── Schema & seed ───────────────────────────────────────────────────────────

export async function ensureRbacTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS app_roles (
      id SERIAL PRIMARY KEY,
      key VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(80) NOT NULL,
      description TEXT,
      permissions TEXT[] NOT NULL DEFAULT '{}',
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      sort INTEGER NOT NULL DEFAULT 100,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS app_groups (
      id SERIAL PRIMARY KEY,
      key VARCHAR(64) UNIQUE,
      name VARCHAR(80) NOT NULL,
      description TEXT,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS group_roles (
      group_id INTEGER NOT NULL REFERENCES app_groups(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, role_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS user_group_members (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES app_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, group_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS user_group_members_group_idx ON user_group_members (group_id)`);
  await query(`CREATE INDEX IF NOT EXISTS user_roles_role_idx ON user_roles (role_id)`);
}

const SEED_GROUPS = [
  {
    key: 'administrators',
    name: { en: 'Administrators', ky: 'Администраторлор', tr: 'Yöneticiler', zh: '管理员', ru: 'Администраторы' },
    description: {
      en: 'Operate the product: users, groups, branding and integrations.',
      ky: 'Продуктту жүргүзүшөт: колдонуучулар, топтор, тышкы көрүнүш жана интеграциялар.',
      tr: 'Ürünü yönetir: kullanıcılar, gruplar, marka görünümü ve entegrasyonlar.',
      zh: '运营产品：用户、组、品牌外观和集成。',
      ru: 'Ведут продукт: пользователи, группы, оформление и интеграции.',
    },
    roles: ['admin'],
  },
  {
    key: 'support',
    name: { en: 'Support', ky: 'Колдоо кызматы', tr: 'Destek', zh: '支持', ru: 'Поддержка' },
    description: {
      en: 'Help users with access: profiles, passwords, blocking.',
      ky: 'Колдонуучуларга кирүү боюнча жардам беришет: профилдер, сырсөздөр, бөгөттөө.',
      tr: 'Kullanıcılara erişim konusunda yardım eder: profiller, parolalar, engelleme.',
      zh: '协助用户解决访问问题：个人资料、密码、封禁。',
      ru: 'Помогают пользователям с доступом: профили, пароли, блокировки.',
    },
    roles: ['moderator'],
  },
  {
    key: 'auditors',
    name: { en: 'Auditors', ky: 'Аудиторлор', tr: 'Denetçiler', zh: '审计员', ru: 'Аудиторы' },
    description: {
      en: 'Read-only oversight of users, activity and settings.',
      ky: 'Өзгөртүү укугусуз көзөмөл: колдонуучулар, журнал, жөндөөлөр.',
      tr: 'Değişiklik yetkisi olmadan denetim: kullanıcılar, etkinlik ve ayarlar.',
      zh: '只读监督：用户、活动和设置。',
      ru: 'Контроль без права изменений: пользователи, журнал, настройки.',
    },
    roles: ['auditor'],
  },
  {
    key: 'employees',
    name: { en: 'Employees', ky: 'Кызматкерлер', tr: 'Çalışanlar', zh: '员工', ru: 'Сотрудники' },
    description: {
      en: 'Everyone in the organisation. New accounts join this group.',
      ky: 'Уюмдун бардык кызматкерлери. Жаңы эсептик жазуулар ушул топко кошулат.',
      tr: 'Kuruluştaki herkes. Yeni hesaplar bu gruba katılır.',
      zh: '组织中的所有人。新账户会自动加入此组。',
      ru: 'Все сотрудники организации. Новые учётные записи попадают сюда.',
    },
    roles: ['user'],
    isDefault: true,
  },
];

const DEMO_USERS = [
  { username: 'olivia.martin', displayName: 'Olivia Martin', group: 'administrators' },
  { username: 'daniel.kim', displayName: 'Daniel Kim', group: 'support' },
  { username: 'sofia.rossi', displayName: 'Sofia Rossi', group: 'auditors' },
  { username: 'liam.novak', displayName: 'Liam Novak', group: 'employees' },
  { username: 'emma.schulz', displayName: 'Emma Schulz', group: 'employees' },
];

/**
 * A sample account from the setup wizard, still as seeded (its example.com
 * address). Such accounts have no password, so they are never taken over by a
 * directory sign-in that merely shares the username.
 */
export function isDemoSeedAccount(user) {
  if (!user?.username) return false;
  const name = String(user.username).toLowerCase();
  return DEMO_USERS.some((demo) => demo.username === name) && String(user.email || '').toLowerCase() === `${name}@example.com`;
}

/** Marker for accounts that have no local password (SSO, invited, demo). */
export const NO_PASSWORD = '!';

async function roleIdsByKey(client = { query }) {
  const result = await client.query(`SELECT id, key FROM app_roles`);
  return Object.fromEntries(result.rows.map((row) => [row.key, row.id]));
}

async function seedGroups(client, locale) {
  const roles = await roleIdsByKey(client);
  // Seed data in the installer's language (inline per-language objects, English fallback).
  const lang = localeOrDefault(locale);
  for (const group of SEED_GROUPS) {
    const inserted = await client.query(
      `INSERT INTO app_groups (key, name, description, is_default)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO NOTHING
       RETURNING id`,
      [group.key, pick(group.name, lang), pick(group.description, lang), Boolean(group.isDefault)]
    );
    const id = inserted.rows[0]?.id;
    if (!id) continue;
    for (const key of group.roles) {
      if (roles[key]) {
        await client.query(
          `INSERT INTO group_roles (group_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, roles[key]]
        );
      }
    }
  }
}

/**
 * Idempotent: creates tables, inserts missing system roles, and — once per
 * database — seeds default groups and migrates users from the legacy
 * `users.role` column (admins become super administrators, so nobody loses
 * access on upgrade; everyone else joins the default group).
 */
export async function seedRbac({ locale } = {}) {
  await ensureRbacTables();
  for (const role of SYSTEM_ROLES) {
    await query(
      `INSERT INTO app_roles (key, name, description, permissions, is_system, sort)
       VALUES ($1, $2, $3, $4, TRUE, $5)
       ON CONFLICT (key) DO NOTHING`,
      [role.key, role.name, role.description, role.permissions, role.sort]
    );
  }
  // The locked role is always exactly "*", whatever happened before.
  await query(`UPDATE app_roles SET permissions = $1, is_system = TRUE WHERE key = $2`, [
    [ALL],
    LOCKED_ROLE,
  ]);

  const flag = await query(`SELECT value FROM app_settings WHERE key = 'rbac_seeded'`);
  if (flag.rows[0]?.value === 'true') return;
  // Fresh install: wait for the wizard so groups are named in its language.
  const anyUser = await query(`SELECT 1 FROM users LIMIT 1`);
  if (!anyUser.rows.length) return;

  await withTransaction(async (client) => {
    let seedLocale = locale || process.env.SEED_LOCALE;
    if (!seedLocale) {
      const first = await client.query(`SELECT locale FROM users ORDER BY id LIMIT 1`);
      seedLocale = first.rows[0]?.locale || 'en';
    }
    await seedGroups(client, seedLocale);

    const roles = await roleIdsByKey(client);
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT id, $1 FROM users WHERE role = 'admin'
       ON CONFLICT DO NOTHING`,
      [roles[LOCKED_ROLE]]
    );
    await client.query(
      `INSERT INTO user_group_members (user_id, group_id)
       SELECT u.id, g.id FROM users u CROSS JOIN app_groups g
       WHERE g.is_default AND u.role IS DISTINCT FROM 'admin'
       ON CONFLICT DO NOTHING`
    );
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('rbac_seeded', 'true')
       ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()`
    );
  });
}

/**
 * Sample accounts that show how roles and groups fit together. They have no
 * password (cannot sign in) until an administrator sets one.
 */
export async function seedDemoUsers() {
  const groups = await query(`SELECT id, key FROM app_groups WHERE key IS NOT NULL`);
  const groupIds = Object.fromEntries(groups.rows.map((row) => [row.key, row.id]));
  let created = 0;
  for (const demo of DEMO_USERS) {
    const inserted = await query(
      `INSERT INTO users (username, email, password_hash, role, display_name)
       VALUES ($1, $2, $3, 'user', $4)
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [demo.username, `${demo.username}@example.com`, NO_PASSWORD, demo.displayName]
    );
    const id = inserted.rows[0]?.id;
    if (!id) continue;
    created += 1;
    if (groupIds[demo.group]) {
      await query(
        `INSERT INTO user_group_members (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, groupIds[demo.group]]
      );
    }
  }
  return created;
}

// ── Reading access ──────────────────────────────────────────────────────────

function roleRow(row) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || '',
    permissions: row.permissions || [],
    isSystem: row.is_system,
    isLocked: row.key === LOCKED_ROLE,
  };
}

/**
 * Runs reads in parallel on the pool, one after another on a transaction
 * client (a single connection cannot run queries concurrently).
 */
async function runAll(client, tasks) {
  if (client.query === query) return Promise.all(tasks.map((task) => task()));
  const results = [];
  for (const task of tasks) results.push(await task());
  return results;
}

function graphFrom(roleRows, groupRows, groupRoleRows) {
  const roleById = new Map(roleRows.map((row) => [row.id, roleRow(row)]));
  const rolesOfGroup = new Map();
  for (const { group_id: groupId, role_id: roleId } of groupRoleRows) {
    if (!rolesOfGroup.has(groupId)) rolesOfGroup.set(groupId, []);
    rolesOfGroup.get(groupId).push(roleId);
  }
  return { roles: roleRows.map(roleRow), roleById, groups: groupRows, rolesOfGroup };
}

async function loadGraph(client = { query }) {
  const [roles, groups, groupRoles] = await runAll(client, [
    () => client.query(`SELECT * FROM app_roles ORDER BY sort, name`),
    () => client.query(`SELECT * FROM app_groups ORDER BY is_default DESC, name`),
    () => client.query(`SELECT group_id, role_id FROM group_roles`),
  ]);
  return graphFrom(roles.rows, groups.rows, groupRoles.rows);
}

/*
 * Everything getUserAccess needs in ONE round trip. It runs on every signed-in
 * request (middleware/auth → getSessionUser); as five queries it held a pooled
 * connection five times per request and was the main reason a small pool
 * queued under load. Only the columns accessFrom/roleRow read are fetched.
 */
const ACCESS_SQL = `
  SELECT
    (SELECT COALESCE(json_agg(json_build_object('id', r.id, 'key', r.key, 'name', r.name, 'description', r.description,
                                                'permissions', r.permissions, 'is_system', r.is_system) ORDER BY r.sort, r.name), '[]')
       FROM app_roles r) AS roles,
    (SELECT COALESCE(json_agg(json_build_object('id', g.id, 'name', g.name) ORDER BY g.is_default DESC, g.name), '[]')
       FROM app_groups g) AS groups,
    (SELECT COALESCE(json_agg(json_build_object('group_id', gr.group_id, 'role_id', gr.role_id)), '[]')
       FROM group_roles gr) AS group_roles,
    ARRAY(SELECT role_id FROM user_roles WHERE user_id = $1) AS direct,
    ARRAY(SELECT group_id FROM user_group_members WHERE user_id = $1) AS member`;

function accessFrom(graph, directRoleIds, groupIds) {
  const effective = new Set(directRoleIds);
  for (const groupId of groupIds) {
    for (const roleId of graph.rolesOfGroup.get(groupId) || []) effective.add(roleId);
  }
  const permissions = new Set();
  const roles = [];
  for (const roleId of effective) {
    const role = graph.roleById.get(roleId);
    if (!role) continue;
    roles.push({ id: role.id, key: role.key, name: role.name, isSystem: role.isSystem });
    for (const perm of role.permissions) permissions.add(perm);
  }
  roles.sort((a, b) => (graph.roleById.get(a.id)?.sort ?? 0) - (graph.roleById.get(b.id)?.sort ?? 0));
  return {
    roleIds: [...directRoleIds],
    groupIds: [...groupIds],
    roles,
    groups: groupIds
      .map((id) => graph.groups.find((group) => group.id === id))
      .filter(Boolean)
      .map((group) => ({ id: group.id, name: group.name })),
    permissions: permissions.has(ALL) ? [ALL] : [...permissions].sort(),
  };
}

/** Effective access for one user. */
export async function getUserAccess(userId, client = { query }) {
  const { rows } = await client.query(ACCESS_SQL, [userId]);
  const row = rows[0];
  return accessFrom(graphFrom(row.roles, row.groups, row.group_roles), row.direct, row.member);
}

/** Effective access for many users at once (lists). */
export async function getAccessMap(userIds, client = { query }) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const [graph, direct, member] = await runAll(client, [
    () => loadGraph(client),
    () => client.query(`SELECT user_id, role_id FROM user_roles WHERE user_id = ANY($1)`, [ids]),
    () => client.query(`SELECT user_id, group_id FROM user_group_members WHERE user_id = ANY($1)`, [ids]),
  ]);
  const directOf = new Map(ids.map((id) => [id, []]));
  const groupsOf = new Map(ids.map((id) => [id, []]));
  for (const row of direct.rows) directOf.get(row.user_id)?.push(row.role_id);
  for (const row of member.rows) groupsOf.get(row.user_id)?.push(row.group_id);
  return new Map(ids.map((id) => [id, accessFrom(graph, directOf.get(id), groupsOf.get(id))]));
}

export async function hasSuperadmin() {
  const result = await query(
    `SELECT EXISTS (
       SELECT 1 FROM user_roles ur JOIN app_roles r ON r.id = ur.role_id WHERE r.key = $1
     ) AS ok`,
    [LOCKED_ROLE]
  );
  return result.rows[0].ok;
}

async function countActiveSuperadmins(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count FROM users u
     WHERE u.is_active IS NOT FALSE AND u.is_blocked IS NOT TRUE AND u.id IN (
       SELECT ur.user_id FROM user_roles ur JOIN app_roles r ON r.id = ur.role_id
       WHERE $1 = ANY(r.permissions)
       UNION
       SELECT m.user_id FROM user_group_members m
       JOIN group_roles gr ON gr.group_id = m.group_id
       JOIN app_roles r ON r.id = gr.role_id
       WHERE $1 = ANY(r.permissions)
     )`,
    [ALL]
  );
  return result.rows[0].count;
}

/** Call at the end of a transaction: rolls it back if no super admin is left. */
export async function assertSuperadminRemains(client) {
  if ((await countActiveSuperadmins(client)) < 1) {
    throw httpError(409, 'This change would leave the product without an active super administrator', 'LAST_SUPERADMIN');
  }
}

export async function defaultGroupId(client = { query }) {
  const result = await client.query(`SELECT id FROM app_groups WHERE is_default ORDER BY id LIMIT 1`);
  return result.rows[0]?.id || null;
}

// ── Guards ──────────────────────────────────────────────────────────────────

/** Whether `actor` may manage a user holding `targetPermissions`. */
export function canManageTarget(actor, targetPermissions) {
  return isSubset(targetPermissions, actor.permissions);
}

/** Permissions in `before` that `after` no longer grants. */
export function lostPermissions(before, after) {
  const now = new Set(after || []);
  if (now.has(ALL)) return [];
  return (before || []).filter((perm) => !now.has(perm));
}

/** Users who hold any of these roles, directly or through a group. */
async function holdersOfRoles(client, roleIds) {
  if (!roleIds.length) return [];
  const { rows } = await client.query(
    `SELECT user_id FROM user_roles WHERE role_id = ANY($1)
     UNION
     SELECT m.user_id FROM user_group_members m JOIN group_roles gr ON gr.group_id = m.group_id
     WHERE gr.role_id = ANY($1)`,
    [roleIds]
  );
  return rows.map((row) => row.user_id);
}

async function membersOfGroup(client, groupId) {
  const { rows } = await client.query(`SELECT user_id FROM user_group_members WHERE group_id = $1`, [groupId]);
  return rows.map((row) => row.user_id);
}

/*
 * Role and group edits change the access of everyone holding them. Taking
 * access away is only allowed when the actor could manage each person who
 * actually loses something (the same rule as editing that person directly).
 * guardLosses() snapshots access before the change; verify() after it, in the
 * same transaction, throws (rolling back) on a loss the actor may not cause.
 */
async function guardLosses(client, actor, userIds) {
  const before = actor && userIds.length ? await getAccessMap(userIds, client) : new Map();
  return {
    async verify() {
      if (!before.size) return;
      const after = await getAccessMap([...before.keys()], client);
      for (const [userId, access] of before) {
        if (Number(userId) === Number(actor.id)) continue;
        if (!lostPermissions(access.permissions, after.get(userId)?.permissions).length) continue;
        if (!canManageTarget(actor, access.permissions)) {
          throw httpError(403, 'This change would take access away from users with more access than you have', 'CANNOT_MANAGE_MEMBERS');
        }
      }
    },
  };
}

async function permissionsOfRoles(client, roleIds) {
  if (!roleIds.length) return [];
  const result = await client.query(`SELECT permissions FROM app_roles WHERE id = ANY($1)`, [roleIds]);
  if (result.rows.length !== new Set(roleIds).size) throw httpError(400, 'Unknown role');
  return result.rows.flatMap((row) => row.permissions);
}

async function permissionsOfGroups(client, groupIds) {
  if (!groupIds.length) return [];
  const groups = await client.query(`SELECT id FROM app_groups WHERE id = ANY($1)`, [groupIds]);
  if (groups.rows.length !== new Set(groupIds).size) throw httpError(400, 'Unknown group');
  const result = await client.query(
    `SELECT r.permissions FROM group_roles gr JOIN app_roles r ON r.id = gr.role_id
     WHERE gr.group_id = ANY($1)`,
    [groupIds]
  );
  return result.rows.flatMap((row) => row.permissions);
}

function ids(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(Number).filter(Number.isInteger))];
}

/**
 * Replaces a user's direct roles and/or groups. The actor can only hand out
 * (or take away) access they hold themselves, never touch their own access,
 * and never leave the product without a super administrator.
 */
export async function setUserAccess(client, { userId, roleIds, groupIds, actor }) {
  if (roleIds === undefined && groupIds === undefined) return;
  if (actor && Number(actor.id) === Number(userId)) {
    throw httpError(400, 'You cannot change your own roles or groups');
  }
  const current = await getUserAccess(userId, client);
  if (actor && !canManageTarget(actor, current.permissions)) {
    throw httpError(403, 'You cannot manage a user with more access than you have');
  }

  if (roleIds !== undefined) {
    const next = ids(roleIds);
    const changed = [...new Set([...next, ...current.roleIds])].filter(
      (id) => next.includes(id) !== current.roleIds.includes(id)
    );
    if (actor && !isSubset(await permissionsOfRoles(client, changed), actor.permissions)) {
      throw httpError(403, 'You can only assign roles with permissions you hold yourself');
    }
    await permissionsOfRoles(client, next);
    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    for (const roleId of next) {
      await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleId]);
    }
  }

  if (groupIds !== undefined) {
    const next = ids(groupIds);
    const changed = [...new Set([...next, ...current.groupIds])].filter(
      (id) => next.includes(id) !== current.groupIds.includes(id)
    );
    if (actor && !isSubset(await permissionsOfGroups(client, changed), actor.permissions)) {
      throw httpError(403, 'You can only add users to groups whose roles you hold yourself');
    }
    await permissionsOfGroups(client, next);
    await client.query(`DELETE FROM user_group_members WHERE user_id = $1`, [userId]);
    for (const groupId of next) {
      await client.query(`INSERT INTO user_group_members (user_id, group_id) VALUES ($1, $2)`, [
        userId,
        groupId,
      ]);
    }
  }
}

// ── Roles ───────────────────────────────────────────────────────────────────

export async function listRoles() {
  const [graph, direct, viaGroups] = await Promise.all([
    loadGraph(),
    query(`SELECT role_id, COUNT(*)::int AS count FROM user_roles GROUP BY role_id`),
    query(
      `SELECT gr.role_id, COUNT(DISTINCT m.user_id)::int AS count
       FROM group_roles gr JOIN user_group_members m ON m.group_id = gr.group_id
       GROUP BY gr.role_id`
    ),
  ]);
  const directCount = Object.fromEntries(direct.rows.map((row) => [row.role_id, row.count]));
  const groupCount = Object.fromEntries(viaGroups.rows.map((row) => [row.role_id, row.count]));
  return graph.roles.map((role) => ({
    ...role,
    directUsers: directCount[role.id] || 0,
    groupUsers: groupCount[role.id] || 0,
    groups: graph.groups
      .filter((group) => (graph.rolesOfGroup.get(group.id) || []).includes(role.id))
      .map((group) => ({ id: group.id, name: group.name })),
  }));
}

function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function slugify(name) {
  const base = cleanText(name, 48)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'role'}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function createRole({ name, description, permissions }, actor) {
  const title = cleanText(name, 80);
  if (!title) throw httpError(400, 'Role name is required');
  const perms = normalizePermissions(permissions);
  if (perms.includes(ALL)) throw httpError(400, 'Only the built-in super administrator role grants full access');
  if (!isSubset(perms, actor.permissions)) {
    throw httpError(403, 'A role cannot grant permissions you do not hold');
  }
  const result = await query(
    `INSERT INTO app_roles (key, name, description, permissions, is_system, sort)
     VALUES ($1, $2, $3, $4, FALSE, 100)
     RETURNING *`,
    [slugify(title), title, cleanText(description, 300), perms]
  );
  return roleRow(result.rows[0]);
}

export async function updateRole(id, patch, actor) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM app_roles WHERE id = $1 FOR UPDATE`, [id]);
    const role = found.rows[0];
    if (!role) throw httpError(404, 'Role not found');
    if (role.key === LOCKED_ROLE) throw httpError(400, 'The super administrator role cannot be changed');

    const name = role.is_system ? role.name : cleanText(patch.name ?? role.name, 80) || role.name;
    const description = cleanText(patch.description ?? role.description, 300);
    let perms = role.permissions;
    if (patch.permissions !== undefined) {
      perms = normalizePermissions(patch.permissions);
      if (perms.includes(ALL)) throw httpError(400, 'Only the built-in super administrator role grants full access');
      const changed = [...new Set([...perms, ...role.permissions])].filter(
        (perm) => perms.includes(perm) !== role.permissions.includes(perm)
      );
      if (!isSubset(changed, actor.permissions)) {
        throw httpError(403, 'You can only change permissions you hold yourself');
      }
    }
    const removes = role.permissions.some((perm) => !perms.includes(perm));
    const guard = await guardLosses(client, actor, removes ? await holdersOfRoles(client, [role.id]) : []);
    const result = await client.query(
      `UPDATE app_roles SET name = $2, description = $3, permissions = $4, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, name, description, perms]
    );
    await guard.verify();
    await assertSuperadminRemains(client);
    return roleRow(result.rows[0]);
  });
}

export async function deleteRole(id, actor) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM app_roles WHERE id = $1`, [id]);
    const role = found.rows[0];
    if (!role) throw httpError(404, 'Role not found');
    if (role.is_system) throw httpError(400, 'Built-in roles cannot be deleted');
    if (!isSubset(role.permissions, actor.permissions)) {
      throw httpError(403, 'You cannot delete a role with permissions you do not hold');
    }
    const guard = await guardLosses(client, actor, await holdersOfRoles(client, [role.id]));
    await client.query(`DELETE FROM app_roles WHERE id = $1`, [id]);
    await guard.verify();
    await assertSuperadminRemains(client);
  });
}

// ── Groups ──────────────────────────────────────────────────────────────────

export async function listGroups() {
  const [graph, members] = await Promise.all([
    loadGraph(),
    query(`SELECT group_id, user_id FROM user_group_members`),
  ]);
  const membersOf = new Map();
  for (const row of members.rows) {
    if (!membersOf.has(row.group_id)) membersOf.set(row.group_id, []);
    membersOf.get(row.group_id).push(row.user_id);
  }
  return graph.groups.map((group) => ({
    id: group.id,
    key: group.key,
    name: group.name,
    description: group.description || '',
    isDefault: group.is_default,
    roleIds: graph.rolesOfGroup.get(group.id) || [],
    roles: (graph.rolesOfGroup.get(group.id) || [])
      .map((roleId) => graph.roleById.get(roleId))
      .filter(Boolean)
      .map((role) => ({ id: role.id, key: role.key, name: role.name, isSystem: role.isSystem })),
    memberIds: membersOf.get(group.id) || [],
    memberCount: (membersOf.get(group.id) || []).length,
  }));
}

/**
 * Creates or updates a group in one transaction: details, granted roles and
 * the member list. The actor must hold every permission the group grants, and
 * can only add or remove members they are allowed to manage.
 */
export async function saveGroup(id, input, actor) {
  return withTransaction(async (client) => {
    let group = null;
    if (id) {
      const found = await client.query(`SELECT * FROM app_groups WHERE id = $1 FOR UPDATE`, [id]);
      group = found.rows[0];
      if (!group) throw httpError(404, 'Group not found');
    }
    const name = cleanText(input.name ?? group?.name, 80);
    if (!name) throw httpError(400, 'Group name is required');
    const description = cleanText(input.description ?? group?.description, 300);

    const currentRoles = group
      ? (await client.query(`SELECT role_id FROM group_roles WHERE group_id = $1`, [group.id])).rows.map(
          (row) => row.role_id
        )
      : [];
    const grantedPerms = await permissionsOfRoles(client, currentRoles);
    if (group && !isSubset(grantedPerms, actor.permissions)) {
      throw httpError(403, 'You cannot edit a group that grants more access than you have');
    }

    if (group) {
      await client.query(
        `UPDATE app_groups SET name = $2, description = $3, updated_at = NOW() WHERE id = $1`,
        [group.id, name, description]
      );
    } else {
      const created = await client.query(
        `INSERT INTO app_groups (name, description) VALUES ($1, $2) RETURNING *`,
        [name, description]
      );
      group = created.rows[0];
    }

    if (input.isDefault === true && !group.is_default) {
      await client.query(`UPDATE app_groups SET is_default = (id = $1)`, [group.id]);
    }

    if (input.roleIds !== undefined) {
      const next = ids(input.roleIds);
      const changed = [...new Set([...next, ...currentRoles])].filter(
        (roleId) => next.includes(roleId) !== currentRoles.includes(roleId)
      );
      if (!isSubset(await permissionsOfRoles(client, changed), actor.permissions)) {
        throw httpError(403, 'A group cannot grant permissions you do not hold');
      }
      await permissionsOfRoles(client, next);
      const removes = currentRoles.some((roleId) => !next.includes(roleId));
      const guard = await guardLosses(client, actor, removes ? await membersOfGroup(client, group.id) : []);
      await client.query(`DELETE FROM group_roles WHERE group_id = $1`, [group.id]);
      for (const roleId of next) {
        await client.query(`INSERT INTO group_roles (group_id, role_id) VALUES ($1, $2)`, [group.id, roleId]);
      }
      await guard.verify();
    }

    if (input.memberIds !== undefined) {
      const next = ids(input.memberIds);
      const current = (
        await client.query(`SELECT user_id FROM user_group_members WHERE group_id = $1`, [group.id])
      ).rows.map((row) => row.user_id);
      const changed = [...new Set([...next, ...current])].filter(
        (userId) => next.includes(userId) !== current.includes(userId)
      );
      for (const userId of changed) {
        if (Number(userId) === Number(actor.id)) {
          throw httpError(400, 'You cannot change your own group membership');
        }
        const access = await getUserAccess(userId, client);
        if (!canManageTarget(actor, access.permissions)) {
          throw httpError(403, 'You cannot change the membership of a user with more access than you have');
        }
      }
      if (next.length) {
        const exists = await client.query(`SELECT COUNT(*)::int AS count FROM users WHERE id = ANY($1)`, [next]);
        if (exists.rows[0].count !== next.length) throw httpError(400, 'Unknown user');
      }
      await client.query(`DELETE FROM user_group_members WHERE group_id = $1`, [group.id]);
      for (const userId of next) {
        await client.query(`INSERT INTO user_group_members (user_id, group_id) VALUES ($1, $2)`, [
          userId,
          group.id,
        ]);
      }
    }

    await assertSuperadminRemains(client);
    return group.id;
  });
}

export async function deleteGroup(id, actor) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM app_groups WHERE id = $1`, [id]);
    const group = found.rows[0];
    if (!group) throw httpError(404, 'Group not found');
    if (group.is_default) throw httpError(400, 'Choose another default group before deleting this one');
    const roleIds = (await client.query(`SELECT role_id FROM group_roles WHERE group_id = $1`, [id])).rows.map(
      (row) => row.role_id
    );
    if (!isSubset(await permissionsOfRoles(client, roleIds), actor.permissions)) {
      throw httpError(403, 'You cannot delete a group that grants more access than you have');
    }
    const guard = await guardLosses(client, actor, await membersOfGroup(client, id));
    await client.query(`DELETE FROM app_groups WHERE id = $1`, [id]);
    await guard.verify();
    await assertSuperadminRemains(client);
    await pruneDirectoryGroupMap(client, id);
  });
  invalidateSettings();
}

/** Removes Active Directory mapping rules that point at a deleted group (Settings → Sign-in methods). */
export async function pruneDirectoryGroupMap(client, groupId) {
  const { rows } = await client.query(`SELECT value FROM app_settings WHERE key = 'auth' FOR UPDATE`);
  if (!rows[0]) return 0;
  let auth;
  try {
    auth = JSON.parse(rows[0].value);
  } catch {
    return 0;
  }
  const rules = Array.isArray(auth?.ldap?.groupMap) ? auth.ldap.groupMap : [];
  const kept = rules.filter((rule) => Number(rule?.groupId) !== Number(groupId));
  if (kept.length === rules.length) return 0;
  auth.ldap.groupMap = kept;
  await client.query(`UPDATE app_settings SET value = $1, updated_at = NOW() WHERE key = 'auth'`, [JSON.stringify(auth)]);
  return rules.length - kept.length;
}

/** Unusable hashes (SSO, demo, invited) never match a password. */
export function hasLocalPassword(hash) {
  return typeof hash === 'string' && hash.startsWith('$2');
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export { hasPermission };
