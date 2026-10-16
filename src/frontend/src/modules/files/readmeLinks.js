/*
 * Links and pictures of a folder README in Files (and its public links):
 * Files addresses nodes by id, so "docs/plan.pdf" or "../Images/logo.png"
 * is found by walking the folders by name. Only places the person (or the
 * link visitor) may list are walked: the same requests as browsing.
 */

/**
 * `chain`: the places from the top the README can reach down to this folder
 * (e.g. [space, folder, folder]); `items`: this folder's listing (used without
 * a request); `list(place)` → Promise<items> of another place.
 * Returns `resolve(target)` → Promise<node | place | null> for a target from
 * lib/readme parseHref, and `local(target)` → the node when it is right here.
 */
export function nodeResolver({ chain, items, list }) {
  const listings = new Map();
  const listOf = (place, index) => {
    if (index === chain.length - 1 && place === chain[index]) return Promise.resolve(items);
    const key = place.key;
    if (!listings.has(key)) listings.set(key, Promise.resolve(list(place)).catch(() => []));
    return listings.get(key);
  };
  const startOf = (target) => {
    const index = target.root ? 0 : chain.length - 1 - target.up;
    return index >= 0 && index < chain.length ? index : -1;
  };

  const local = (target) => {
    if (target?.kind !== 'relative' || target.root || target.up || target.segments.length !== 1) return null;
    return items.find((node) => node.name === target.segments[0]) || null;
  };

  const resolve = async (target) => {
    if (target?.kind !== 'relative') return null;
    const index = startOf(target);
    if (index < 0) return null;
    let place = chain[index];
    let fromChain = true;
    if (!target.segments.length) return place;
    for (let step = 0; step < target.segments.length; step += 1) {
      const name = target.segments[step];
      const children = await (fromChain ? listOf(place, index) : listOf(place, -1));
      const node = children.find((item) => item.name === name);
      if (!node) return null;
      if (step === target.segments.length - 1) return node;
      if (node.kind !== 'folder') return null;
      place = { key: `folder:${node.id}`, type: 'folder', id: node.id, node };
      fromChain = false;
    }
    return null;
  };

  return { local, resolve };
}
