import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { kbApi, privateSource } from '../api';
import { useKb } from '../KbContext';
import FolderContent from '../components/FolderContent';

export default function KbSearch() {
  const { t } = useLocale();
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const navigate = useNavigate();
  const { config } = useKb();
  const [data, setData] = useState(null);
  const src = useMemo(() => privateSource(), []);

  useEffect(() => {
    setData(null);
    kbApi.search(q).then((res) => setData(res.data)).catch(() => setData({ folders: [], items: [] }));
  }, [q]);

  return (
    <div className="kb-page">
      <header className="kb-hero">
        <div>
          <h1>{t('kb.searchTitle', { q })}</h1>
          {data && <p>{t('kb.searchCount', { count: data.folders.length + data.items.length })}</p>}
        </div>
      </header>
      {!data ? (
        <Skeleton active />
      ) : (
        <FolderContent
          folders={data.folders}
          items={data.items}
          view="list"
          config={config}
          src={src}
          folderLink={(id) => `/app/kb/f/${id}`}
          onOpen={(item) => navigate(`/app/kb/d/${item.id}`)}
          emptyText={t('kb.searchEmpty')}
        />
      )}
    </div>
  );
}
