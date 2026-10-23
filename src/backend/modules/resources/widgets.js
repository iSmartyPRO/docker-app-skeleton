import { int } from '../../platform/widgets.js';
import { board, resourcesContext } from './service.js';

/* Dashboard widget of Online resources: the link tiles (the person's own order), and the categories for its settings. */

async function links(req, settings) {
  const data = await board(resourcesContext(req));
  let items = data.items;
  const category = Number(settings.category);
  if (Number.isInteger(category) && category > 0) items = items.filter((item) => item.categoryId === category);
  // The person's own order and hidden tiles from the resources page.
  const order = data.layout?.order || [];
  const hidden = new Set(data.layout?.hidden || []);
  items = items.filter((item) => !hidden.has(item.id));
  if (order.length) {
    const rank = new Map(order.map((id, index) => [id, index]));
    items = [...items].sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6));
  }
  return { items: items.slice(0, int(settings.limit, 2, 40, 12)), categories: data.categories };
}

export function registerResourcesWidgets(ctx) {
  ctx.registerWidget({ type: 'links', data: links, options: async (req) => ({ categories: (await board(resourcesContext(req))).categories }) });
}
