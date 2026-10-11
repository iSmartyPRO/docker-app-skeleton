import { useEffect, useState } from 'react';
import { Segmented, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { driveApi } from '../api';
import { LinkRow } from '../components/LinkDialog';

/** Every public link the person created, with their state. */
export default function MyLinks() {
  const { t } = useLocale();
  const [links, setLinks] = useState(null);
  const [filter, setFilter] = useState('all');
  const load = () => driveApi.links().then((res) => setLinks(res.data.links)).catch(() => setLinks([]));
  useEffect(() => {
    load();
  }, []);
  const shown = (links || []).filter((link) => filter === 'all' || (filter === 'active' ? link.status === 'active' : link.status !== 'active'));
  return (
    <div className="fs-page">
      <header className="fs-head">
        <div className="fs-head__text">
          <h1>{t('drive.myLinks')}</h1>
          <p>{t('drive.myLinksLead')}</p>
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('drive.linksAll') },
            { value: 'active', label: t('drive.linksActive') },
            { value: 'inactive', label: t('drive.linksInactive') },
          ]}
        />
      </header>
      {!links ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !shown.length ? (
        <div className="fs-empty"><span>{t('drive.noLinks')}</span></div>
      ) : (
        <div className="fs-links dv-links-page">
          {shown.map((link) => <LinkRow key={link.id} link={link} onChange={load} showItem />)}
        </div>
      )}
    </div>
  );
}
