import { useMemo, useState } from 'react';
import { Input, Modal } from 'antd';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { CATEGORIES, WIDGET_CATALOG } from '../catalog';
import { HintLabel } from '../../../help/Hint';

/** Little sketches of what a widget shows, for the gallery cards. */
function Preview({ kind, color }) {
  const c = color;
  const line = (x, y, w, o = 0.18) => <rect x={x} y={y} width={w} height="5" rx="2.5" fill="currentColor" opacity={o} />;
  const sketches = {
    hero: (
      <>
        <rect x="6" y="8" width="108" height="48" rx="10" fill={c} opacity="0.14" />
        {line(16, 18, 40, 0.3)}
        <rect x="16" y="28" width="62" height="8" rx="4" fill={c} opacity="0.75" />
        {[0, 1, 2].map((i) => <rect key={i} x={16 + i * 26} y="42" width="22" height="7" rx="3.5" fill={c} opacity="0.3" />)}
      </>
    ),
    tiles: [0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={10 + (i % 3) * 36} y={10 + Math.floor(i / 3) * 26} width="28" height="20" rx="6" fill={c} opacity={0.2 + (i % 3) * 0.2} />),
    list: [0, 1, 2, 3].map((i) => (
      <g key={i}>
        <circle cx="16" cy={14 + i * 13} r="4.5" fill={c} opacity="0.6" />
        {line(26, 12 + i * 13, 60 - i * 8, 0.22)}
        {line(96, 12 + i * 13, 14, 0.12)}
      </g>
    )),
    checklist: [0, 1, 2, 3].map((i) => (
      <g key={i}>
        <rect x="10" y={9 + i * 13} width="9" height="9" rx="3" fill="none" stroke={c} strokeWidth="1.6" />
        {line(25, 11 + i * 13, 54 + (i % 2) * 14, 0.22)}
        <rect x="94" y={10 + i * 13} width="18" height="7" rx="3.5" fill={i === 0 ? '#EF4444' : c} opacity={i === 0 ? 0.55 : 0.25} />
      </g>
    )),
    donut: (
      <>
        <circle cx="38" cy="32" r="18" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="8" />
        <circle cx="38" cy="32" r="18" fill="none" stroke={c} strokeWidth="8" strokeDasharray="70 200" transform="rotate(-90 38 32)" />
        <circle cx="38" cy="32" r="18" fill="none" stroke="#10B981" strokeWidth="8" strokeDasharray="30 200" strokeDashoffset="-74" transform="rotate(-90 38 32)" />
        {[0, 1, 2].map((i) => line(68, 20 + i * 11, 40 - i * 8, 0.22))}
      </>
    ),
    area: (
      <>
        <path d="M8 50 C 24 40, 32 44, 44 34 S 70 22, 84 26 S 104 14, 114 12 L114 56 L8 56 Z" fill={c} opacity="0.18" />
        <path d="M8 50 C 24 40, 32 44, 44 34 S 70 22, 84 26 S 104 14, 114 12" fill="none" stroke={c} strokeWidth="2.2" />
        <path d="M8 54 C 26 50, 36 46, 50 44 S 78 38, 92 34 S 108 30, 114 28" fill="none" stroke="#10B981" strokeWidth="2" />
      </>
    ),
    columns: [12, 22, 16, 30, 24, 36, 20, 28].map((h, i) => (
      <g key={i}>
        <rect x={10 + i * 13} y={54 - h} width="8" height={h} rx="2" fill={c} opacity="0.7" />
        <rect x={10 + i * 13} y={54 - h - 6} width="8" height="5" rx="2" fill="#F43F5E" opacity="0.6" />
      </g>
    )),
    bars: [42, 70, 30, 54].map((w, i) => (
      <g key={i}>
        {line(10, 9 + i * 13, 22, 0.25)}
        <rect x="36" y={8 + i * 13} width={w} height="7" rx="3.5" fill={c} opacity={0.85 - i * 0.15} />
      </g>
    )),
    agenda: [0, 1, 2].map((i) => (
      <g key={i}>
        {line(10, 12 + i * 16, 14, 0.3)}
        <rect x="30" y={8 + i * 16} width="3" height="12" rx="1.5" fill={c} />
        {line(38, 9 + i * 16, 54 - i * 10, 0.25)}
        {line(38, 16 + i * 16, 30, 0.12)}
      </g>
    )),
    month: Array.from({ length: 28 }, (_, i) => (
      <rect key={i} x={10 + (i % 7) * 15} y={8 + Math.floor(i / 7) * 12} width="11" height="9" rx="3" fill={i === 16 ? c : 'currentColor'} opacity={i === 16 ? 0.9 : [3, 9, 20].includes(i) ? 0.3 : 0.08} />
    )),
    files: [0, 1, 2, 3].map((i) => (
      <g key={i}>
        <rect x="10" y={8 + i * 12} width="8" height="10" rx="2" fill={['#EF4444', '#3B82F6', '#10B981', '#F59E0B'][i]} opacity="0.65" />
        {line(24, 10 + i * 12, 58 - i * 6, 0.22)}
        {line(94, 10 + i * 12, 16, 0.12)}
      </g>
    )),
    clock: (
      <>
        <circle cx="34" cy="32" r="20" fill="none" stroke={c} strokeWidth="2.4" opacity="0.7" />
        <path d="M34 32 V19 M34 32 L43 37" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
        {line(64, 22, 42, 0.3)}
        {line(64, 34, 30, 0.18)}
      </>
    ),
    note: (
      <>
        <rect x="18" y="6" width="84" height="52" rx="6" fill="#FEF3C7" />
        {[0, 1, 2].map((i) => <rect key={i} x="28" y={18 + i * 11} width={60 - i * 12} height="4" rx="2" fill="#92400E" opacity="0.35" />)}
      </>
    ),
  };
  return (
    <svg viewBox="0 0 120 64" className="dash-gallery__sketch">
      {sketches[kind] || sketches.list}
    </svg>
  );
}

/** "Add widget": the catalog by category, with search. */
export default function Gallery({ open, available, onAdd, onClose }) {
  const { t } = useLocale();
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  const usable = useMemo(() => Object.entries(WIDGET_CATALOG).filter(([type]) => available.includes(type)), [available]);
  const cats = CATEGORIES.filter((cat) => usable.some(([, def]) => def.category === cat));
  const text = q.trim().toLowerCase();
  const shown = usable.filter(
    ([type, def]) =>
      (category === 'all' || def.category === category) &&
      (!text || `${t(`dashboard.widgets.${type}.name`)} ${t(`dashboard.widgets.${type}.desc`)}`.toLowerCase().includes(text))
  );
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={980} title={<HintLabel id="dashboard.gallery">{t('dashboard.gallery.title')}</HintLabel>} className="dash-gallery-modal" destroyOnHidden>
      <div className="dash-gallery">
        <nav className="dash-gallery__cats">
          <Input.Search allowClear placeholder={t('dashboard.gallery.search')} value={q} onChange={(event) => setQ(event.target.value)} />
          {['all', ...cats].map((cat) => (
            <button key={cat} type="button" className={category === cat ? 'is-active' : ''} onClick={() => setCategory(cat)}>
              {t(`dashboard.categories.${cat}`)}
              <em>{cat === 'all' ? usable.length : usable.filter(([, def]) => def.category === cat).length}</em>
            </button>
          ))}
        </nav>
        <div className="dash-gallery__grid">
          {shown.map(([type, def]) => (
            <div
              key={type}
              role="button"
              tabIndex={0}
              className="dash-gallery__card"
              style={{ '--w-accent': def.color }}
              onClick={() => onAdd(type)}
              onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), onAdd(type))}
            >
              <div className="dash-gallery__preview">
                <Preview kind={def.preview} color={def.color} />
              </div>
              <div className="dash-gallery__info">
                <span className="dash-card__icon">
                  <MenuIcon name={def.icon} variant="mono" />
                </span>
                <span>
                  <strong>{t(`dashboard.widgets.${type}.name`)}</strong>
                  <em>{t(`dashboard.widgets.${type}.desc`)}</em>
                </span>
              </div>
              <span className="dash-gallery__add">＋ {t('dashboard.gallery.add')}</span>
            </div>
          ))}
          {!shown.length && <div className="dw-empty"><strong>{t('dashboard.gallery.nothing')}</strong></div>}
        </div>
      </div>
    </Modal>
  );
}
