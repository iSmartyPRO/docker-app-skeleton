import { useEffect, useState } from 'react';
import { Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { formatDateTime, formatRelative } from '../../../lib/format';
import { qrApi } from '../api';

/** Scans of a dynamic code over the last 30 days: total, last scan and daily bars. */
export default function ScanStats({ id }) {
  const { t, locale } = useLocale();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    qrApi
      .stats(id, 30)
      .then((res) => alive && setStats(res.data.stats))
      .catch(() => alive && setStats(null));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!stats) return null;
  const max = Math.max(1, ...stats.days.map((day) => day.count));
  const month = stats.days.reduce((sum, day) => sum + day.count, 0);
  return (
    <div className="qr-stats">
      <div className="qr-stats__numbers">
        <div>
          <strong>{stats.total}</strong>
          <span>{t('qr.stats.total')}</span>
        </div>
        <div>
          <strong>{month}</strong>
          <span>{t('qr.stats.month')}</span>
        </div>
        <div>
          <strong className="is-small">{stats.lastScanAt ? formatRelative(stats.lastScanAt, locale) : '—'}</strong>
          <span>{t('qr.stats.last')}</span>
        </div>
      </div>
      <div className="qr-stats__bars" role="img" aria-label={t('qr.stats.chart')}>
        {stats.days.map((day) => (
          <Tooltip key={day.day} title={`${formatDateTime(`${day.day}T12:00:00`, locale, { dateStyle: 'medium' })}: ${day.count}`} mouseEnterDelay={0.1}>
            <span className={day.count ? 'is-on' : ''} style={{ height: `${Math.max(6, (day.count / max) * 100)}%` }} />
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
