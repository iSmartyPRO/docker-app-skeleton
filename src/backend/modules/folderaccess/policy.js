import { httpError } from '../shared/acl.js';

/*
 * Who may do what in Folder access (pure; the routes call these on every request).
 *
 *   superadmin  portal permission `*`: everything (both modes, groups, full journal)
 *   sysadmin    portal permission `folderaccess.groups`: membership of sg_ groups only
 *
 * The portal roles are an extra layer: every change is made with the acting
 * administrator's own AD account, so Active Directory has the final word.
 * API tokens get nothing; a "sign in as" session only reads.
 */

export const PERMISSION = 'folderaccess.groups';

export const MEMBERSHIP_ACTIONS = ['member_add', 'member_remove', 'member_move'];
export const GROUP_ACTIONS = ['group_create', 'group_describe', 'group_delete'];

/** { role, canWrite, readOnly } for a request-like object. */
export function accessOf({ permissions, impersonating = false, apiToken = false }) {
  const set = permissions instanceof Set ? permissions : new Set(permissions || []);
  if (apiToken) return { role: null, canWrite: false, readOnly: 'api_token' };
  const role = set.has('*') ? 'superadmin' : set.has(PERMISSION) ? 'sysadmin' : null;
  if (!role) return { role: null, canWrite: false, readOnly: 'forbidden' };
  if (impersonating) return { role, canWrite: false, readOnly: 'impersonation' };
  return { role, canWrite: true, readOnly: null };
}

export function accessFromRequest(req) {
  return accessOf({ permissions: req.access?.permissions || [], impersonating: Boolean(req.auth?.imp), apiToken: Boolean(req.apiToken) });
}

/** Groups a role sees: system administrators never see groups without the prefix. */
export function groupVisible(role, group) {
  if (role === 'superadmin') return true;
  if (role === 'sysadmin') return group.kind === 'sg';
  return false;
}

export function requireRole(access) {
  if (!access.role) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
}

export function requireWrite(access) {
  requireRole(access);
  if (!access.canWrite) {
    throw httpError(403, access.readOnly === 'impersonation' ? 'Not available while signed in as another user' : 'Read-only access', access.readOnly === 'impersonation' ? 'IMPERSONATION_LIMIT' : 'FA_READ_ONLY');
  }
}

export function requireSuperadmin(access) {
  requireWrite(access);
  if (access.role !== 'superadmin') throw httpError(403, 'Only a superadministrator can do this', 'FA_SUPERADMIN_ONLY');
}

/** NTFS mode: superadministrators only (reads too); a "sign in as" session still only reads. */
export function requireNtfs(access) {
  requireRole(access);
  if (access.role !== 'superadmin') throw httpError(403, 'Only a superadministrator can do this', 'FA_SUPERADMIN_ONLY');
}

// A group whose name or description does not fully parse is for superadministrators to sort out
// (sg_vpn_users, sg_it_admins, a description without a folder…). drive_unmapped is a settings gap, not one of these.
export const PARSE_ISSUES = ['name_format', 'org_unknown', 'description_missing', 'description_format', 'access_unknown', 'path_format', 'type_mismatch'];

/**
 * Why `role` may not change the membership of `group` (null = allowed).
 * System administrators: only sg_ groups that fully parse (type from the name, an accepted
 * organisation code, a well-formed description), are not protected / root, and lie in the
 * managed OU (the group search base, else the OU for new groups; see naming.describeGroup).
 */
export function groupRefusal(role, group) {
  if (!group) return 'FA_GROUP_NOT_FOUND';
  if (role === 'superadmin') return null;
  if (role !== 'sysadmin') return 'FORBIDDEN';
  if (group.kind !== 'sg') return 'FA_GROUP_NOT_ALLOWED';
  if (group.protected || group.root) return 'FA_GROUP_PROTECTED';
  if (group.inManagedOu === false) return 'FA_GROUP_NOT_ALLOWED';
  if (!group.nameType || (group.issues || []).some((issue) => PARSE_ISSUES.includes(issue))) return 'FA_GROUP_NEEDS_REVIEW';
  return null;
}

/** Why `role` may not put `member` into a group (null = allowed). Only people for system administrators. */
export function memberRefusal(role, member) {
  if (!member) return 'FA_MEMBER_NOT_FOUND';
  if (role === 'superadmin') return ['user', 'group', 'computer', 'foreign'].includes(member.kind) ? null : 'FA_MEMBER_KIND';
  if (role === 'sysadmin') return member.kind === 'user' ? null : 'FA_ONLY_USERS';
  return 'FORBIDDEN';
}

const REFUSALS = {
  FORBIDDEN: [403, 'You do not have permission for this action'],
  FA_GROUP_NOT_FOUND: [404, 'The group was not found'],
  FA_GROUP_NOT_ALLOWED: [403, 'This group is not a folder access group'],
  FA_GROUP_PROTECTED: [403, 'This group is protected: only a superadministrator can change it'],
  FA_GROUP_NEEDS_REVIEW: [403, 'The name or description of this group does not follow the rules: only a superadministrator can change it'],
  FA_MEMBER_NOT_FOUND: [404, 'The account was not found in the directory'],
  FA_MEMBER_KIND: [400, 'This kind of directory object cannot be added to a group'],
  FA_ONLY_USERS: [403, 'Only user accounts can be added'],
};

export function refusalError(code) {
  const [status, message] = REFUSALS[code] || [403, 'Not allowed'];
  return httpError(status, message, code);
}

export function assertGroupChange(role, group) {
  const code = groupRefusal(role, group);
  if (code) throw refusalError(code);
}

export function assertMemberAdd(role, group, member) {
  assertGroupChange(role, group);
  const code = memberRefusal(role, member);
  if (code) throw refusalError(code);
}

/** Journal rows a role sees: system administrators only membership changes. */
export function journalKinds(role) {
  if (role === 'superadmin') return null;
  if (role === 'sysadmin') return ['membership'];
  return [];
}

/**
 * What a role sees in the journal (journal.journalFilter): { kinds, groupPrefix, hiddenGroups }.
 * System administrators: membership changes of groups they see, i.e. with the prefix and
 * not protected (the groups without the prefix are for superadministrators only).
 */
export function journalScope(role, settings = {}) {
  const kinds = journalKinds(role);
  if (role !== 'sysadmin') return { kinds, groupPrefix: null, hiddenGroups: [] };
  return { kinds, groupPrefix: String(settings.prefix || 'sg_').toLowerCase(), hiddenGroups: [...(settings.protectedGroups || [])] };
}

/**
 * Why `entry` (a journal row) cannot be undone by `userId` with `role` (null = it can).
 * Only membership changes that changed something, once; a system administrator only their own.
 */
export function undoRefusal(role, userId, entry) {
  if (!entry) return 'NOT_FOUND';
  if (!role) return 'FORBIDDEN';
  if (!MEMBERSHIP_ACTIONS.includes(entry.action)) return 'FA_UNDO_UNSUPPORTED';
  if (!entry.ok || entry.outcome !== 'changed') return 'FA_UNDO_NOTHING';
  if (entry.undone_by) return 'FA_UNDO_DONE';
  if (role === 'sysadmin' && Number(entry.user_id) !== Number(userId)) return 'FA_UNDO_NOT_OWN';
  return null;
}

/** An undo that would also revert later changes (`later` = their journal ids) needs `confirm`. */
export function supersededRefusal(later, confirm = false) {
  return (later || []).length && confirm !== true ? 'FA_UNDO_SUPERSEDED' : null;
}

/** The inverse membership operation of a journal row: { action, group, toGroup, member }. */
export function inverseOf(entry) {
  switch (entry.action) {
    case 'member_add':
      return { action: 'member_remove', groupDn: entry.group_dn, memberDn: entry.member_dn };
    case 'member_remove':
      return { action: 'member_add', groupDn: entry.group_dn, memberDn: entry.member_dn };
    case 'member_move': {
      // Only what the move changed: it may have found the person already in the
      // target group (then only the removal is undone) or not in the source.
      const before = entry.before || {};
      if (before.inTo === true) return { action: 'member_add', groupDn: entry.group_dn, memberDn: entry.member_dn };
      if (before.inFrom === false) return { action: 'member_remove', groupDn: entry.to_group_dn, memberDn: entry.member_dn };
      return { action: 'member_move', groupDn: entry.to_group_dn, toGroupDn: entry.group_dn, memberDn: entry.member_dn };
    }
    default:
      return null;
  }
}
