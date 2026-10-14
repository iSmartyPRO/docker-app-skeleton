import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../../../context/LocaleContext';
import { whApi } from '../api';
import { useWh } from '../WhContext';

/**
 * «Идёт инвентаризация» on a warehouse (spec §6.1): with the policy «block»
 * movements of the scope are refused by the server, with «record» they go
 * through and are listed in the reconciliation. Shown on documents and in the
 * mobile mode so nobody is surprised by a refused posting.
 */
export default function FreezeBanner({ warehouseId, compact = false }) {
  const { t } = useLocale();
  const { version } = useWh();
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    if (!warehouseId) {
      setSessions([]);
      return undefined;
    }
    let alive = true;
    whApi
      .inventoryActive(warehouseId)
      .then((res) => alive && setSessions(res.data.sessions))
      .catch(() => alive && setSessions([]));
    return () => {
      alive = false;
    };
  }, [warehouseId, version]);
  if (!sessions.length) return null;
  return sessions.map((s) => {
    const scope = [...s.scope.bins.map((b) => b.path), ...s.scope.categories.map((c) => c.name)].join(', ');
    return (
      <div key={s.id} className={`wh-banner ${s.freezes ? 'is-red' : 'is-amber'} wh-freeze${compact ? ' is-compact' : ''}`} role="status">
        <span className="wh-freeze__icon" aria-hidden="true">{s.freezes ? '🔒' : '📝'}</span>
        <span>
          <strong>{t('whm.freeze.title', { number: s.number, warehouse: s.warehouse.name })}</strong>
          <br />
          {s.freezes ? t('whm.freeze.blocked', { scope: scope || t('whm.freeze.wholeWarehouse') }) : t('whm.freeze.recorded', { scope: scope || t('whm.freeze.wholeWarehouse') })}
        </span>
        {s.canOpen && <Link to={`/app/warehouse/inventory/${s.id}`}>{t('whm.freeze.open')}</Link>}
      </div>
    );
  });
}
