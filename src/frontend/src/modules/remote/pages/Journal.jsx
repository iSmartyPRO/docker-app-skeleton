import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Skeleton } from 'antd';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import ModuleHeader from '../../shared/ModuleHeader';
import { remoteApi } from '../api';
import { useRemote } from '../RemoteContext';
import SessionList from '../components/SessionList';

/** /app/remote/journal — every connection, for administrators (remote.admin). */
export default function Journal() {
  const { t } = useLocale();
  const remote = useRemote();
  const [sessions, setSessions] = useState(null);

  useEffect(() => {
    if (!remote.can.admin) return undefined;
    let alive = true;
    remoteApi.sessions('all').then((res) => alive && setSessions(res.data.sessions)).catch(() => alive && setSessions([]));
    return () => { alive = false; };
  }, [remote.can.admin]);

  if (remote.ready && !remote.can.admin) return <Navigate to="/app/remote" replace />;

  return (
    <div className="rm-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.remote.name'), to: '/app/remote' }, { key: 'journal', label: t('remote.journal.title') }]}
        icon={<MenuIcon name="remote" />}
        title={t('remote.journal.title')}
        description={t('remote.journal.lead')}
      />
      <div data-tour="rm.journal">{sessions === null ? <Skeleton active paragraph={{ rows: 6 }} /> : <SessionList sessions={sessions} showWatched />}</div>
    </div>
  );
}
