import { useEffect, useMemo, useState } from 'react';
import { AutoComplete, Input } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { oldNumberLabel, searchRank } from '../lib';
import { TypeIcon } from './bits';

const MAX_OPTIONS = 12;

/**
 * The search of the site plan: the text filters units as before (dims the
 * rest), and the list under it offers buildings, levels and units by code,
 * name, number or old number («Апарт-корпус 40», «№14»). Picking one — or
 * Enter — zooms the plan to it and opens its card.
 */
export default function PlanSearch({ value, onChange, nodes, onPick }) {
  const { t } = useLocale();
  const [text, setText] = useState(value || '');
  const [open, setOpen] = useState(false);
  useEffect(() => setText(value || ''), [value]);
  useEffect(() => {
    const timer = setTimeout(() => text !== (value || '') && onChange(text), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const hits = useMemo(() => {
    const q = text.trim();
    if (!q) return [];
    return nodes
      .map((node) => ({ node, rank: searchRank(node, q) }))
      .filter((item) => item.rank > 0)
      // Exact hits first, then buildings and levels before the units inside them.
      .sort((a, b) => b.rank - a.rank || Number(Boolean(a.node.unit && a.node.kind === 'unit')) - Number(Boolean(b.node.unit && b.node.kind === 'unit')) || a.node.depth - b.node.depth || String(a.node.code || '').localeCompare(String(b.node.code || ''), undefined, { numeric: true }))
      .slice(0, MAX_OPTIONS)
      .map((item) => item.node);
  }, [text, nodes]);

  const options = hits.map((node) => {
    const old = oldNumberLabel(node.attrs?.oldNumber);
    return {
      value: String(node.id),
      label: (
        <div className="mp-hit">
          <TypeIcon node={node} size={15} />
          <b>{node.code || node.name}</b>
          <span className="mp-hit__name">{node.code && node.name !== node.code ? node.name : node.type?.name}</span>
          {old && <em>{t('mp.labels.was', { n: old })}</em>}
        </div>
      ),
    };
  });

  const pick = (id) => {
    const node = hits.find((item) => String(item.id) === String(id));
    if (!node) return;
    setOpen(false);
    onPick(node);
  };

  return (
    <AutoComplete
      className="mp-search"
      value={text}
      options={options}
      open={open && options.length > 0}
      onDropdownVisibleChange={setOpen}
      onSearch={(next) => {
        setText(next);
        setOpen(true);
      }}
      onSelect={pick}
      popupClassName="mp-hits"
      popupMatchSelectWidth={320}
    >
      <Input.Search
        allowClear
        placeholder={t('mp.labels.search')}
        aria-label={t('mp.labels.search')}
        onSearch={(next) => {
          // Enter (or the search button) opens the best hit; clearing only clears.
          if (!next) {
            setText('');
            onChange('');
            return;
          }
          if (hits[0]) pick(hits[0].id);
        }}
      />
    </AutoComplete>
  );
}
