import { useMemo } from 'react';
import { useLocale } from '../../../context/LocaleContext';
import { useMp } from '../MpContext';
import { descendants, formatArea, formatShortMoney, matches, shortLabel } from '../lib';
import { nodeFill } from './colors';

/**
 * The plan without a drawing: every sellable or construction object as a
 * coloured tile, grouped by the level above it. Works from the first minute
 * of a project (before an architect draws contours) and on small phones.
 */
export default function TilesView({ tree, root, layer, filter, filtering, selectedId, onSelect, userId }) {
  const { locale } = useLocale();
  const { settings } = useMp();
  const groups = useMemo(() => {
    const inside = root ? descendants(tree, root.id) : [...tree.byId.values()];
    const objects = inside.filter((node) => node.kind !== 'level' && (node.unit || node.type?.stageSet || node.kind === 'object'));
    // Apartments inside a building group under the building's sections; others under their parent level.
    const map = new Map();
    for (const node of objects) {
      const parent = tree.byId.get(node.parentId);
      const key = parent?.id || 0;
      if (!map.has(key)) map.set(key, { parent, items: [] });
      map.get(key).items.push(node);
    }
    return [...map.values()].sort((a, b) => (a.parent?.depth || 0) - (b.parent?.depth || 0) || (a.parent?.sort || 0) - (b.parent?.sort || 0));
  }, [tree, root]);
  if (!groups.length) return null;
  return (
    <div className="mp-tiles">
      {groups.map((group) => (
        <section key={group.parent?.id || 0} className="mp-tiles__group">
          <h3>
            {group.parent ? shortLabel(group.parent) : '—'}
            {group.parent?.name && group.parent?.code && <span>{group.parent.name}</span>}
          </h3>
          <div className="mp-tiles__grid">
            {group.items.map((node) => {
              const fill = nodeFill(node, layer, { settings, tree });
              const dim = filtering && !(node.unit ? matches(node, filter, userId) : descendants(tree, node.id).some((item) => item.unit && matches(item, filter, userId)));
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`mp-tile${node.id === selectedId ? ' is-selected' : ''}${dim ? ' is-dim' : ''}${!node.unit ? ' is-object' : ''}`}
                  style={{ '--c': fill }}
                  onClick={() => onSelect(node)}
                >
                  <b>{shortLabel(node)}</b>
                  {node.unit?.price !== undefined && node.unit?.price !== null && <span>{formatShortMoney(node.unit.price, node.unit.currency, locale)}</span>}
                  {node.unit && (node.unit.areaTotal || node.unit.areaPlot) ? <em>{formatArea(node.unit.areaTotal || node.unit.areaPlot, locale)}</em> : null}
                  {!node.unit && <em title={node.type?.name}>{node.type?.name}</em>}
                  {layer === 'build' && node.readiness !== null && node.readiness !== undefined && <i>{Math.round(node.readiness)}%</i>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
