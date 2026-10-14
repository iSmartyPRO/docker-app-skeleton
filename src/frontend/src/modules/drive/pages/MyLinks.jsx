import { useEffect, useState } from 'react';
import { Button, Segmented, Skeleton } from 'antd';
import { FolderOpenOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../../../context/LocaleContext';
import { driveApi } from '../api';
import { LinkEditModal, LinkRow } from '../components/LinkDialog';
import { useDrive } from '../DriveContext';
import ModuleHeader from '../../shared/ModuleHeader';

/** Every public link the person created, with their state. */
export default function MyLinks() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [links, setLinks] = useState(null);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const { config } = useDrive() || {};
  const load = () => driveApi.links().then((res) => setLinks(res.data.links)).catch(() => setLinks([]));
  useEffect(() => {
    load();
  }, []);
  const shown = (links || []).filter((link) => filter === 'all' || (filter === 'active' ? link.status === 'active' : link.status !== 'active'));
  return (
    <div className="fs-page">
      <ModuleHeader
        title={t('drive.myLinks')}
        description={t('drive.myLinksLead')}
        filters={
          links?.length ? (
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t('drive.linksAll') },
                { value: 'active', label: t('drive.linksActive') },
                { value: 'inactive', label: t('drive.linksInactive') },
              ]}
            />
          ) : null
        }
      />
      {!links ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !links.length ? (
        <div className="sl-empty dv-links-page">
          <span className="sl-empty__icon"><LinkOutlined /></span>
          <h3>{t('linkShare.emptyTitle')}</h3>
          <p>{t('drive.myLinksEmpty')}</p>
          <Button type="primary" size="large" icon={<FolderOpenOutlined />} onClick={() => navigate('/app/drive')}>
            {t('drive.myLinksEmptyCta')}
          </Button>
        </div>
      ) : !shown.length ? (
        <div className="fs-empty"><span>{t('drive.noLinks')}</span></div>
      ) : (
        <div className="sl-list dv-links-page">
          {shown.map((link) => <LinkRow key={link.id} link={link} onChange={load} onEdit={config ? setEditing : undefined} showItem />)}
        </div>
      )}
      <LinkEditModal link={editing} config={config} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}
