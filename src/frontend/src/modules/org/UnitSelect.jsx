import { useMemo } from 'react';
import { TreeSelect } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useOrg } from './api';
import { buildTree, typeLabel, typeOf } from './lib';

/**
 * A unit of the org structure, for any module:
 *
 *   import UnitSelect from '../org/UnitSelect';
 *   <UnitSelect value={unitId} onChange={setUnitId} />
 *   <UnitSelect purpose="warehouse" />            // only units with that purpose (and their parents, disabled)
 *   <UnitSelect types={['site']} />               // only units of these types
 *   <UnitSelect multiple />                       // several units
 *
 * Closed units are hidden unless they are the current value.
 */
export default function UnitSelect({ value, onChange, purpose, types, multiple = false, placeholder, allowClear = true, exclude = [], style, disabled, size, 'aria-label': ariaLabel }) {
  const { t } = useLocale();
  const { units, meta, loading } = useOrg();
  const treeData = useMemo(() => {
    const selected = new Set([].concat(value ?? []).map(Number));
    const excluded = new Set(exclude.map(Number));
    const list = (units || []).filter((unit) => !excluded.has(unit.id) && (unit.status === 'active' || selected.has(unit.id)));
    const fits = (unit) => (!purpose || unit.purposes?.includes(purpose)) && (!types || types.includes(unit.type));
    const toNode = (node) => {
      const type = typeOf(meta, node.type);
      const children = node.children.map(toNode).filter(Boolean);
      const ok = fits(node);
      if (!ok && !children.length) return null;
      return {
        value: node.id,
        key: node.id,
        disabled: !ok,
        search: `${node.name} ${node.code || ''}`.toLowerCase(),
        title: (
          <span className="org-opt">
            <span className="org-opt__icon" style={{ '--c': type.color }}>
              <MenuIcon name={type.icon} variant="mono" />
            </span>
            <span className="org-opt__name">{node.name}</span>
            {node.code && <span className="org-opt__code">{node.code}</span>}
            <span className="org-opt__type">{typeLabel(type, t)}</span>
          </span>
        ),
        label: node.name,
        children,
      };
    };
    return buildTree(list).map(toNode).filter(Boolean);
  }, [units, meta, purpose, types, value, exclude, t]);
  return (
    <TreeSelect
      value={value ?? undefined}
      onChange={(next) => onChange?.(next ?? null)}
      treeData={treeData}
      loading={loading}
      multiple={multiple}
      allowClear={allowClear}
      showSearch
      treeDefaultExpandAll
      treeNodeFilterProp="search"
      filterTreeNode={(input, node) => String(node.search || '').includes(input.toLowerCase())}
      treeNodeLabelProp="label"
      placeholder={placeholder || t('org.pick.unit')}
      style={{ width: '100%', ...style }}
      popupMatchSelectWidth={false}
      disabled={disabled}
      size={size}
      aria-label={ariaLabel || placeholder || t('org.pick.unit')}
      maxTagCount="responsive"
    />
  );
}
