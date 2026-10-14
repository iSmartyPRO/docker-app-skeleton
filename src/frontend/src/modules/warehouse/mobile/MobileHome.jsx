import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import FreezeBanner from '../components/FreezeBanner';
import { WarehouseChip, useMobileWarehouse } from './parts';

/** Tiles of the storekeeper mode (spec §8.3) and what each needs on the chosen warehouse. */
const TILES = [
  { key: 'receipt', icon: 'download', color: '#10B981', to: 'doc/receipt', right: 'operate' },
  { key: 'issue', icon: 'share', color: '#2563EB', to: 'doc/issue', right: 'request' },
  { key: 'transfer', icon: 'send', color: '#8B5CF6', to: 'doc/transfer', right: 'operate' },
  { key: 'accept', icon: 'inbox', color: '#7C3AED', to: 'accept', right: 'operate' },
  { key: 'inventory', icon: 'checklist', color: '#0EA5E9', to: 'inventory' },
  { key: 'find', icon: 'scan', color: '#F59E0B', to: 'find' },
  { key: 'tools', icon: 'wrench', color: '#EA580C', to: '/app/warehouse/my-tools' },
];

/** /app/warehouse/m — the storekeeper's home: big tiles, the warehouse remembered on this device. */
export default function MobileHome() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { meta, version } = useWh();
  const [warehouse, setWarehouse, list] = useMobileWarehouse();
  const [counts, setCounts] = useState({});
  useEffect(() => {
    let alive = true;
    const out = {};
    Promise.allSettled([
      whApi.documents({ chip: 'awaiting_receipt', warehouse: warehouse?.id, pageSize: 1 }).then((res) => (out.accept = res.data.total)),
      whApi.inventories({ active: '1' }).then((res) => (out.inventory = res.data.items.filter((s) => s.status !== 'draft' && (s.my?.count || s.my?.finish)).length)),
      whApi.myTools().then((res) => (out.tools = res.data.tools.length + res.data.items.length + res.data.incoming.length)),
      whApi.documents({ chip: 'requests', warehouse: warehouse?.id, pageSize: 1 }).then((res) => (out.issue = res.data.total)),
    ]).then(() => alive && setCounts({ ...out }));
    return () => {
      alive = false;
    };
  }, [warehouse?.id, version]);
  const rights = new Set(warehouse?.rights || meta?.rights?.global || []);
  const allowed = (tile) => {
    if (tile.key === 'inventory') return meta.rights.canInventoryAny || counts.inventory > 0;
    if (!tile.right) return true;
    if (tile.right === 'request') return rights.has('request') || rights.has('operate');
    return rights.has(tile.right);
  };
  const tiles = TILES.filter(allowed);
  return (
    <div className="whm-page whm-home">
      <header className="whm-home__head">
        <div>
          <span className="whm-eyebrow">{t('whm.home.eyebrow')}</span>
          <h1>{t('whm.home.title')}</h1>
        </div>
        <WarehouseChip warehouse={warehouse} list={list} onChange={setWarehouse} />
      </header>
      <FreezeBanner warehouseId={warehouse?.id} compact />
      <nav className="whm-tiles" aria-label={t('whm.home.title')}>
        {tiles.map((tile) => {
          const badge = counts[tile.key];
          const to = tile.to.startsWith('/') ? tile.to : `/app/warehouse/m/${tile.to}`;
          return (
            <Link key={tile.key} to={to} className={`whm-tile is-${tile.key}`} style={{ '--c': tile.color }} data-testid={`tile-${tile.key}`}>
              <span className="whm-tile__icon" aria-hidden="true">
                <MenuIcon name={tile.icon} variant="mono" />
              </span>
              <strong>{t(`whm.tiles.${tile.key}`)}</strong>
              <em>{t(`whm.tiles.${tile.key}Hint`)}</em>
              {badge > 0 && <span className="whm-tile__badge">{badge}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="whm-home__foot">
        <button type="button" className="whm-link" onClick={() => navigate('/app/warehouse/stock')}>
          {t('whm.home.fullVersion')}
        </button>
      </div>
    </div>
  );
}
