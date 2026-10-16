import { Router } from 'express';
import { query } from '../../config/database.js';
import { hasPermission } from '../../services/permissions.js';
import { updateAdminSettings } from '../../services/settings.js';
import { avatarOf } from '../shared/acl.js';
import { listLegalEntities } from '../../services/legalEntities.js';
import { portalRegional } from '../../services/regional.js';
import { managerOf } from './api.js';
import { activeProvider } from './providers.js';
import {
  canManageOrg,
  createUnit,
  deleteUnit,
  getUnit,
  listUnits,
  moveUnit,
  orgChart,
  orgSettings,
  setUserUnit,
  unitHistory,
  unitMembers,
  updateUnit,
  userPlacement,
} from './service.js';
import { httpError } from './logic.js';

/*
 * /api/app/org (signed-in people; tokens need the `org` area). Reading the
 * structure is open to everyone signed in (it is the company's map); changes
 * need `org.manage`. docs/org-structure.md → HTTP API.
 */

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};
const ok = (res, body, status = 200) => res.status(status).json({ success: true, ...body });
const permsOf = (req) => req.access?.permissions || req.user?.permissions || [];

export function privateRoutes() {
  const router = Router();

  router.get('/meta', wrap(async (req, res) => {
    const settings = await orgSettings();
    const perms = permsOf(req);
    const regional = await portalRegional().catch(() => ({ timeZone: 'UTC' }));
    const entities = canManageOrg(req) ? (await listLegalEntities()).map((entity) => ({ id: entity.id, label: entity.label, isDefault: entity.isDefault })) : [];
    ok(res, { types: settings.types, purposes: settings.purposes, canManage: canManageOrg(req), canAssign: canManageOrg(req) || hasPermission(perms, 'users.manage'), portalTimeZone: regional.timeZone || 'UTC', legalEntities: entities });
  }));

  // Unit types and purposes (org.manage; also Settings → Modules for settings.modules).
  router.put('/settings', wrap(async (req, res) => {
    if (!canManageOrg(req)) throw httpError(403, 'Only org structure managers can change it', 'FORBIDDEN');
    const body = req.body || {};
    const patch = {};
    for (const key of ['types', 'purposes']) if (body[key] !== undefined) patch[key] = body[key];
    const before = await orgSettings();
    // A type still used by a unit cannot disappear.
    if (Array.isArray(patch.types)) {
      const keys = new Set(patch.types.map((type) => String(type?.key || '')));
      const { rows } = await query(`SELECT DISTINCT type FROM org_units`);
      const used = rows.map((row) => row.type).filter((type) => !keys.has(type));
      if (used.length) throw httpError(409, 'Some units still have these types', 'TYPE_IN_USE', { types: used });
    }
    await updateAdminSettings({ modules: { org: { settings: patch } } });
    const after = await orgSettings();
    ok(res, { types: after.types, purposes: after.purposes, changed: JSON.stringify(before) !== JSON.stringify(after) });
  }));

  router.get('/units', wrap(async (req, res) => ok(res, { units: await listUnits({ includeClosed: req.query.closed !== '0' }) })));
  router.get('/chart', wrap(async (req, res) => ok(res, { tree: await orgChart({ includeClosed: req.query.closed === '1' }) })));
  router.get('/units/:id', wrap(async (req, res) => {
    const unit = await getUnit(req.params.id);
    const list = await listUnits();
    ok(res, { unit: list.find((item) => item.id === unit.id) || unit });
  }));
  router.get('/units/:id/history', wrap(async (req, res) => {
    await getUnit(req.params.id);
    ok(res, { history: await unitHistory(req.params.id) });
  }));
  router.get('/units/:id/members', wrap(async (req, res) => {
    await getUnit(req.params.id);
    ok(res, { members: await unitMembers(req.params.id, { withDescendants: req.query.subtree === '1' }) });
  }));

  router.post('/units', wrap(async (req, res) => ok(res, { unit: await createUnit(req, req.body || {}) }, 201)));
  router.put('/units/:id', wrap(async (req, res) => ok(res, { unit: await updateUnit(req, req.params.id, req.body || {}) })));
  router.post('/units/:id/move', wrap(async (req, res) => ok(res, { unit: await moveUnit(req, req.params.id, req.body || {}) })));
  router.delete('/units/:id', wrap(async (req, res) => ok(res, await deleteUnit(req, req.params.id))));

  // People for the head picker and the unit field of accounts (names only, active accounts).
  router.get('/people', wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const { rows } = await query(
      `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path, position_title, org_unit_id FROM users
       WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE
         AND ($1 = '' OR display_name ILIKE '%' || $1 || '%' OR username ILIKE '%' || $1 || '%')
       ORDER BY LOWER(COALESCE(display_name, username)) LIMIT 200`,
      [q]
    );
    const provider = await activeProvider();
    // Employees (also people without portal access) only for those who may see the directory.
    const employees = provider?.searchEmployees ? await provider.searchEmployees(q, { req, canManageOrg: canManageOrg(req) }) : null;
    ok(res, { people: rows.map((row) => ({ id: row.id, username: row.username, name: row.name, avatarUrl: avatarOf(row.avatar_path), position: row.position_title || null, unitId: row.org_unit_id })), employees });
  }));

  // The light unit / position of an account (Users admin page, «Оргструктура» members).
  router.get('/users/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const self = Number(req.user?.id) === id;
    if (!self && !hasPermission(permsOf(req), 'users.view') && !canManageOrg(req)) throw httpError(403, 'You cannot see this', 'FORBIDDEN');
    const placement = await userPlacement(id);
    if (!placement) throw httpError(404, 'User not found', 'NOT_FOUND');
    ok(res, { placement });
  }));
  router.put('/users/:id', wrap(async (req, res) => ok(res, { placement: await setUserUnit(req, req.params.id, req.body || {}) })));

  // Who would approve as «руководитель подразделения» of a person (route builder preview, profiles).
  router.get('/manager/:userId', wrap(async (req, res) => {
    const id = Number(req.params.userId);
    const self = Number(req.user?.id) === id;
    if (!self && !hasPermission(permsOf(req), 'users.view') && !canManageOrg(req) && !hasPermission(permsOf(req), 'approvals.admin')) throw httpError(403, 'You cannot see this', 'FORBIDDEN');
    const level = Math.max(1, Math.min(3, Number(req.query.level) || 1));
    const found = await managerOf(id, { level, detail: true });
    if (!found) return ok(res, { manager: null });
    const { rows } = await query(`SELECT id, COALESCE(display_name, username) AS name, avatar_path, position_title FROM users WHERE id = $1`, [found.userId]);
    ok(res, { manager: rows[0] ? { id: rows[0].id, name: rows[0].name, avatarUrl: avatarOf(rows[0].avatar_path), position: rows[0].position_title || null, unitId: found.unitId, explicit: Boolean(found.explicit) } : null });
  }));

  return router;
}
