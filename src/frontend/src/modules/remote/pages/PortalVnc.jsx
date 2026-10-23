import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Skeleton, Tag } from 'antd';
import {
  ArrowLeftOutlined,
  CloudDownloadOutlined,
  ClusterOutlined,
  FileZipOutlined,
  GithubOutlined,
  SafetyCertificateOutlined,
  WindowsOutlined,
} from '@ant-design/icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { formatBytes, formatDateTime } from '../../../lib/format';
import ModuleHeader from '../../shared/ModuleHeader';
import { remoteApi } from '../api';

/** /app/remote/portal-vnc — a premium install centre for the Portal VNC agent. */
export default function PortalVnc() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    remoteApi.portalVnc()
      .then((res) => { if (alive) setRelease(res.data.release); })
      .catch(() => { if (alive) setRelease(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const msi = release?.assets?.find((a) => a.kind === 'msi');
  const zip = release?.assets?.find((a) => a.kind === 'zip');
  const steps = ['s1', 's2', 's3', 's4'];

  return (
    <div className="rm-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.remote.name'), to: '/app/remote' }, { key: 'pvnc', label: t('remote.pvnc.title') }]}
        icon={<MenuIcon name="remote" />}
        title={t('remote.pvnc.title')}
        description={t('remote.pvnc.lead')}
        actions={[{ key: 'back', icon: <ArrowLeftOutlined />, label: t('remote.pvnc.back'), onClick: () => navigate('/app/remote') }]}
      />

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <>
          <section className="pvnc-hero">
            <div className="pvnc-hero__glow" aria-hidden />
            <div className="pvnc-hero__badge"><WindowsOutlined /></div>
            <div className="pvnc-hero__body">
              <div className="pvnc-hero__titlerow">
                <h2>{t('remote.pvnc.title')}</h2>
                {release?.version && <Tag bordered={false} className="pvnc-tag">{t('remote.pvnc.version', { v: release.version.replace(/^v/, '') })}</Tag>}
              </div>
              <p className="pvnc-hero__what">{t('remote.pvnc.what')}</p>

              <div className="pvnc-dl">
                <Button type="primary" size="large" icon={<CloudDownloadOutlined />} href={msi?.url} target="_blank" rel="noreferrer" disabled={!msi}>
                  {t('remote.pvnc.downloadMsi')}
                  {msi?.size ? <span className="pvnc-dl__size">{formatBytes(msi.size)}</span> : null}
                </Button>
                <Button size="large" icon={<FileZipOutlined />} href={zip?.url} target="_blank" rel="noreferrer" disabled={!zip}>
                  {t('remote.pvnc.downloadZip')}
                  {zip?.size ? <span className="pvnc-dl__size">{formatBytes(zip.size)}</span> : null}
                </Button>
              </div>

              <div className="pvnc-meta">
                {release?.publishedAt && <span>{t('remote.pvnc.latest')} · {t('remote.pvnc.published', { date: formatDateTime(release.publishedAt, undefined, { dateStyle: 'medium' }) })}</span>}
                <span className="pvnc-meta__links">
                  {release?.releaseUrl && <a href={release.releaseUrl} target="_blank" rel="noreferrer">{t('remote.pvnc.releasePage')}</a>}
                  {release?.releasesUrl && <a href={release.releasesUrl} target="_blank" rel="noreferrer">{t('remote.pvnc.allReleases')}</a>}
                  {release?.repoUrl && <a href={release.repoUrl} target="_blank" rel="noreferrer"><GithubOutlined /> {t('remote.pvnc.repo')}</a>}
                </span>
              </div>
              <p className="pvnc-offline">{t('remote.pvnc.offline')}</p>
            </div>
          </section>

          <h3 className="pvnc-h3">{t('remote.pvnc.steps.title')}</h3>
          <ol className="pvnc-steps">
            {steps.map((s, i) => (
              <li key={s} className="pvnc-step">
                <span className="pvnc-step__n">{i + 1}</span>
                <div>
                  <strong>{t(`remote.pvnc.steps.${s}t`)}</strong>
                  <p>{t(`remote.pvnc.steps.${s}`)}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="pvnc-cards">
            <div className="pvnc-card">
              <ClusterOutlined />
              <div>
                <strong>{t('remote.pvnc.gpoTitle')}</strong>
                <p>{t('remote.pvnc.gpo')}</p>
              </div>
            </div>
          </div>

          <Alert
            type="info"
            showIcon
            icon={<SafetyCertificateOutlined />}
            className="pvnc-note"
            message={t('remote.pvnc.note')}
          />
        </>
      )}
    </div>
  );
}
