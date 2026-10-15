import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Result, Spin } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import OfficeEditor from '../../office/OfficeEditor';
import { filesApi, nodeSource } from '../api';

/** /app/files/e/:id — the file in the online editor (Collabora), full window. */
export default function EditPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    filesApi
      .node(id)
      .then(({ data: next }) => alive && setData(next))
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <Result
        status="404"
        title={t('files.notFound')}
        subTitle={errorMessage(error)}
        extra={
          <Link to="/app/files">
            <Button type="primary">{t('apps.files.name')}</Button>
          </Link>
        }
      />
    );
  }
  if (!data) {
    return (
      <div className="fs-filepage is-loading">
        <Spin size="large" />
      </div>
    );
  }
  const { node, crumbs = [] } = data;
  const folder = crumbs[crumbs.length - 1];
  const backUrl = node.parentId && folder ? `/app/files/f/${folder.id}` : node.spaceId ? `/app/files/space/${node.spaceId}` : '/app/files';
  const where = crumbs.map((crumb) => crumb.name).join(' / ') || t('apps.files.name');
  return (
    <OfficeEditor
      key={id}
      open={(options) => filesApi.openEditor(id, options)}
      name={node.name}
      ext={node.file?.ext || node.ext}
      where={where}
      backTo={{ label: where, go: () => navigate(backUrl) }}
      downloadUrl={nodeSource().file(node, { download: true })}
      previewTo={`/app/files/v/${id}`}
    />
  );
}
