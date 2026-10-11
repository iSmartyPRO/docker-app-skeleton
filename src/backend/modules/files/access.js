import { query } from '../../config/database.js';
import { LEVEL, httpError, levelOn } from '../shared/acl.js';

/*
 * Access to a node:
 *   base  — the owner of a personal node, or the space access level
 *           (files.admin = manage on every space; never on personal files)
 *   share — the highest view/edit grant on the node or any ancestor, for the
 *           user or one of their groups
 * level = max(base, share). In the trash only the owner / space managers see a
 * node. Sharing never grants "manage": only owners and space managers share,
 * publish links, restore and delete for good.
 */

export { LEVEL };

/** The node and its ancestors, root first. */
export async function chainOf(nodeId) {
  const { rows } = await query(
    `WITH RECURSIVE up AS (
       SELECT n.*, 0 AS depth FROM fs_nodes n WHERE n.id = $1
       UNION ALL
       SELECT p.*, up.depth + 1 FROM fs_nodes p JOIN up ON p.id = up.parent_id WHERE up.depth < 64
     ) SELECT * FROM up ORDER BY depth DESC`,
    [nodeId]
  );
  return rows;
}

export async function spaceLevel(ctx, spaceId) {
  return levelOn('fs_space_acl', spaceId, ctx);
}

async function shareLevels(ctx, nodeIds) {
  if (!nodeIds.length) return new Map();
  const { rows } = await query(
    `SELECT node_id, MAX(level)::int AS level FROM fs_shares
     WHERE node_id = ANY($1)
       AND ((subject_type = 'user' AND subject_id = $2) OR (subject_type = 'group' AND subject_id = ANY($3)))
     GROUP BY node_id`,
    [nodeIds, ctx.userId, [...ctx.groupIds]]
  );
  return new Map(rows.map((row) => [row.node_id, row.level]));
}

/**
 * Everything needed to authorize an action on a node.
 * `visibleChain` is the part of the path the user may see (for breadcrumbs).
 */
export async function nodeAccess(ctx, nodeId) {
  const id = Number(nodeId);
  if (!Number.isInteger(id) || id < 1) throw httpError(404, 'Not found', 'NOT_FOUND');
  const chain = await chainOf(id);
  if (!chain.length) throw httpError(404, 'Not found', 'NOT_FOUND');
  const node = chain[chain.length - 1];
  // A token narrowed to some spaces reaches nothing outside them (personal files included).
  const narrowed = ctx.limits?.fs_space_acl;
  if (narrowed && !(node.space_id && narrowed.has(Number(node.space_id)))) {
    return { node, chain, visibleChain: [], level: 0, base: 0, trashed: false, owner: false };
  }
  const base = node.space_id ? await spaceLevel(ctx, node.space_id) : node.owner_id === ctx.userId ? LEVEL.manage : 0;
  const shares = await shareLevels(ctx, chain.map((row) => row.id));
  let share = 0;
  let firstShared = -1;
  chain.forEach((row, index) => {
    const level = shares.get(row.id);
    if (level) {
      share = Math.max(share, level);
      if (firstShared === -1) firstShared = index;
    }
  });
  const trashed = chain.some((row) => row.deleted_at);
  let level = Math.max(base, Math.min(share, LEVEL.edit));
  if (trashed) level = base >= LEVEL.manage ? LEVEL.manage : 0;
  const visibleChain = base > 0 ? chain : firstShared >= 0 ? chain.slice(firstShared) : [];
  return { node, chain, visibleChain, level, base, trashed, owner: base >= LEVEL.manage };
}

export async function requireNode(ctx, nodeId, needed) {
  const access = await nodeAccess(ctx, nodeId);
  if (access.level < needed) {
    throw httpError(
      access.level === 0 ? 404 : 403,
      access.level === 0 ? 'Not found' : 'You do not have permission for this action',
      access.level === 0 ? 'NOT_FOUND' : 'FORBIDDEN'
    );
  }
  return access;
}

/** Levels of several children of one folder, given the folder's level. */
export async function childLevels(ctx, parentLevel, childIds) {
  const shares = await shareLevels(ctx, childIds);
  return (id) => Math.max(parentLevel, Math.min(shares.get(id) || 0, LEVEL.edit));
}
