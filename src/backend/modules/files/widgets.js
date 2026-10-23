import { int } from '../../platform/widgets.js';
import { contextFromRequest } from '../shared/acl.js';
import { recent as recentNodes, usageOf } from './service.js';

/* Dashboard widget of Files: recent files and the person's storage usage. */

async function recentFiles(req, settings) {
  const ctx = contextFromRequest(req, 'files.admin');
  const limit = int(settings.limit, 3, 20, 6);
  const [items, usage] = await Promise.all([recentNodes(ctx), usageOf(ctx.userId)]);
  return {
    usage,
    items: items.slice(0, limit).map((node) => ({ id: node.id, name: node.name, ext: node.file?.ext, size: node.file?.size, updatedAt: node.updatedAt })),
  };
}

export function registerFilesWidgets(ctx) {
  ctx.registerWidget({ type: 'recentFiles', data: recentFiles });
}
