/*
 * Public API of Files for other modules (docs/files.md). Files is an optional
 * link (manifest `enhances`), so they reach it at run time — usually
 * `modules.loaded('files')?.api` (installed, even while switched off: the
 * knowledge base keeps its attachments in Files' storage either way).
 *
 *   nodeAccess(ctx, nodeId)        → { level, node, … } | null — may the person open the node
 *   usageOf(userId)                → { used, quota }
 *   Knowledge base storage: ensureKbFileLinks, migrateKbFiles, ensureKbFolder,
 *   uploadForKb, usableFile, attachmentShape.
 * Everything else in this folder is internal.
 */

export { nodeAccess } from './access.js';
export { usageOf } from './service.js';
export { ensureKbFileLinks } from './schema.js';
export { ensureKbFolder, uploadForKb, usableFile, attachmentShape, migrateKbFiles } from './kb.js';
