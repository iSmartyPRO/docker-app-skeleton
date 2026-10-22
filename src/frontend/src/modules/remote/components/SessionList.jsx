import { EyeOutlined, ToolOutlined } from '@ant-design/icons';
import { Empty, Tag } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { formatDateTime } from '../../../lib/format';

const CONSENT = { granted: 'ok', announced: 'muted', requested: 'warn', declined: 'bad', timeout: 'bad' };

/** A table of sessions, used by «my computer» (mine) and the admin journal (all). */
export default function SessionList({ sessions, showWatched = false }) {
  const { t, locale } = useLocale();
  if (!sessions) return null;
  if (!sessions.length) return <Empty description={t('remote.journal.empty')} />;
  return (
    <div className="rm-sessions">
      {sessions.map((s) => (
        <div key={s.id} className="rm-session">
          <span className={`rm-session__mode is-${s.mode}`}>{s.mode === 'monitor' ? <EyeOutlined /> : <ToolOutlined />}</span>
          <div className="rm-session__main">
            <strong>{s.hostName}</strong>
            <span className="rm-muted">
              {t(s.mode === 'monitor' ? 'remote.journal.monitor' : 'remote.journal.assist')}
              {' · '}
              {s.control ? t('remote.journal.controlled') : t('remote.journal.viewed')}
              {showWatched && s.watchedName ? ` · ${s.watchedName}` : ''}
            </span>
          </div>
          <div className="rm-session__who">
            <span>{t('remote.journal.by', { name: s.operatorName || '—' })}</span>
            <span className="rm-muted">{formatDateTime(s.startedAt, locale)}</span>
          </div>
          <Tag bordered={false} className={`rm-consent is-${CONSENT[s.consent] || 'muted'}`}>{t(`remote.consent.${s.consent}`)}</Tag>
        </div>
      ))}
    </div>
  );
}
