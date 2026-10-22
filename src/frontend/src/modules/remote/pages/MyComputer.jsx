import { useEffect, useState } from 'react';
import { Alert, Skeleton } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import ModuleHeader from '../../shared/ModuleHeader';
import { remoteApi } from '../api';
import SessionList from '../components/SessionList';

/** /app/remote/my — every employee can see who connected to their computer. Transparency. */
export default function MyComputer() {
  const { t } = useLocale();
  const [sessions, setSessions] = useState(null);

  useEffect(() => {
    let alive = true;
    remoteApi.sessions('mine').then((res) => alive && setSessions(res.data.sessions)).catch(() => alive && setSessions([]));
    return () => { alive = false; };
  }, []);

  return (
    <div className="rm-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.remote.name'), to: '/app/remote' }, { key: 'my', label: t('remote.my.title') }]}
        icon={<MenuIcon name="remote" />}
        title={t('remote.my.title')}
        description={t('remote.my.lead')}
      />
      <Alert type="info" showIcon icon={<SafetyCertificateOutlined />} message={t('remote.my.noticeTitle')} description={t('remote.my.noticeText')} style={{ marginBottom: 16 }} />
      <div data-tour="rm.my">{sessions === null ? <Skeleton active paragraph={{ rows: 4 }} /> : <SessionList sessions={sessions} />}</div>
    </div>
  );
}
