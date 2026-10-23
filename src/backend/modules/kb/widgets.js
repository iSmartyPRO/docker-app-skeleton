import { int } from '../../platform/widgets.js';
import { getHome as kbHome } from './service.js';
import { contextFromRequest as kbContext } from './access.js';

/* Dashboard widget of the knowledge base: recently updated articles. */

async function kbRecent(req, settings) {
  const home = await kbHome(kbContext(req));
  return {
    items: home.recent.slice(0, int(settings.limit, 3, 12, 6)).map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      file: item.file ? { ext: item.file.ext } : null,
      updatedAt: item.updatedAt,
      author: item.author,
    })),
  };
}

export function registerKbWidgets(ctx) {
  ctx.registerWidget({ type: 'kbRecent', data: kbRecent });
}
