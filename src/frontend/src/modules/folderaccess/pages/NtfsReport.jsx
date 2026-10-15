import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Empty, Progress, Select, Table, Tag, Tooltip } from 'antd';
import { PlayCircleOutlined, StopOutlined, ToolOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { formatDateTime } from '../../../lib/format';
import ModuleHeader from '../../shared/ModuleHeader';
import { faApi, faError, folderUrl, ntfsUrl } from '../api';
import { useFolderAccess } from '../FolderAccessContext';
import { ReadOnlyBanner } from '../components/Bits';

const POLL_MS = 1500;
const ISSUE_COLOR = {
  folder_not_found: 'red',
  unreadable: 'orange',
  drive_unmapped: 'orange',
  no_sid: 'orange',
  missing_ace: 'red',
  rights_too_high: 'volcano',
  deny_ace: 'magenta',
  rights_too_low: 'gold',
  user_ace: 'blue',
  unknown_sid: 'purple',
};

/**
 * Mismatch report (superadministrators): each sg_ group's folder from its
 * description against the folder's actual permissions, read with the
 * administrator's own account. "Fix" opens the NTFS editor with a draft.
 */
export default function NtfsReport() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { info, change } = useFolderAccess();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [issue, setIssue] = useState([]);
  const timer = useRef(null);

  const poll = useCallback((id) => {
    clearTimeout(timer.current);
    const tick = async () => {
      try {
        const { data } = await faApi.ntfsReport(id);
        setReport(data.report);
        if (data.report?.state === 'running') timer.current = setTimeout(() => tick(), POLL_MS);
      } catch (err) {
        setError(err);
      }
    };
    tick();
  }, []);

  useEffect(() => {
    poll(undefined);
    return () => clearTimeout(timer.current);
  }, [poll]);

  const start = async () => {
    setError(null);
    try {
      const data = await change(() => faApi.ntfsReportStart(), { quiet: true, rethrow: true });
      if (data?.report) {
        setReport(data.report);
        poll(data.report.id);
      }
    } catch (err) {
      setError(err);
    }
  };
  const cancel = async () => {
    try {
      const { data } = await faApi.ntfsReportCancel(report.id);
      setReport(data.report);
    } catch (err) {
      setError(err);
    }
  };

  const rows = useMemo(() => (report?.rows || []).filter((row) => !issue.length || issue.includes(row.issue)), [report, issue]);
  const running = report?.state === 'running';
  const percent = report?.progress?.total ? Math.round((report.progress.done / report.progress.total) * 100) : 0;

  return (
    <div className="fs-page fa-page">
      <ModuleHeader
        crumbs={[{ key: 'ntfs', label: t('folderAccess.mode.ntfs'), to: '/app/folderaccess/ntfs' }, { key: 'cur', label: t('folderAccess.ntfs.report.title') }]}
        title={t('folderAccess.ntfs.report.title')}
        description={t('folderAccess.ntfs.report.lead')}
        actions={
          running
            ? [{ key: 'stop', icon: <StopOutlined />, label: t('folderAccess.ntfs.report.stop'), onClick: cancel, danger: true, disabled: !info?.canWrite }]
            : [{ key: 'run', icon: <PlayCircleOutlined />, label: report ? t('folderAccess.ntfs.report.rerun') : t('folderAccess.ntfs.report.run'), onClick: start, primary: true, disabled: !info?.canWrite }]
        }
      />
      <ReadOnlyBanner />
      {error && <Alert type="error" showIcon className="fa-notice" message={faError(error, t)} />}
      {report?.error && <Alert type="error" showIcon className="fa-notice" message={faError({ response: { data: { code: report.error.code, error: report.error.message } } }, t)} />}
      {report && !running && report.namesUnavailable && <Alert type="warning" showIcon className="fa-notice" message={t('folderAccess.ntfs.report.namesUnavailable')} />}
      {report && !running && report.partialLookup && <Alert type="info" showIcon className="fa-notice" message={t('folderAccess.ntfs.report.partialLookup')} />}
      {running && (
        <section className="panel fa-map">
          <Progress percent={percent} status="active" />
          <span className="fa-muted">
            {t('folderAccess.ntfs.report.progress', { done: report.progress.done, total: report.progress.total })}
            {report.current ? ` · ${report.current}` : ''}
          </span>
        </section>
      )}
      {report && !running && (
        <div className="fa-filters">
          <span className="fa-muted">
            {t('folderAccess.ntfs.report.finished', { at: report.finishedAt ? formatDateTime(report.finishedAt, locale) : '—', n: report.progress.total })}
            {report.state === 'cancelled' ? ` · ${t('folderAccess.ntfs.report.cancelled')}` : ''}
          </span>
          <Select
            mode="multiple"
            allowClear
            placeholder={t('folderAccess.ntfs.report.issue')}
            value={issue}
            onChange={setIssue}
            options={Object.keys(ISSUE_COLOR).map((value) => ({ value, label: t(`folderAccess.ntfs.issue.${value}`) }))}
            style={{ minWidth: 240 }}
          />
        </div>
      )}
      <section className="panel">
        {!report ? (
          <Empty className="fa-loading" description={t('folderAccess.ntfs.report.never')} />
        ) : (
          <Table
            size="small"
            rowKey="key"
            dataSource={rows}
            loading={running && !rows.length}
            pagination={{ pageSize: 100, hideOnSinglePage: true }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={running ? t('folderAccess.ntfs.report.running') : t('folderAccess.ntfs.report.clean')} /> }}
            columns={[
              {
                title: t('folderAccess.folder'),
                render: (_, row) => (
                  <div className="fa-folder-cell">
                    {row.folder.shareId ? <Link to={ntfsUrl(row.folder.shareId, row.folder.path)}>{row.folder.display}</Link> : <span>{row.folder.display || '—'}</span>}
                    <Link className="fa-muted" to={folderUrl(row.folder.key)}>
                      {t('folderAccess.ntfs.report.card')}
                    </Link>
                  </div>
                ),
              },
              { title: t('folderAccess.ntfs.report.issue'), render: (_, row) => <Tag color={ISSUE_COLOR[row.issue]}>{t(`folderAccess.ntfs.issue.${row.issue}`)}</Tag> },
              {
                title: t('folderAccess.ntfs.report.who'),
                render: (_, row) =>
                  row.group ? (
                    <code className="fa-code">{row.group.name}</code>
                  ) : row.subject ? (
                    <span>
                      {row.subject.name || <code className="fa-code">{row.subject.sid}</code>}
                      {row.subject.name && <span className="fa-muted"> · {row.subject.sid}</span>}
                    </span>
                  ) : (
                    <span className="fa-muted">{row.errorCode || '—'}</span>
                  ),
              },
              {
                title: t('folderAccess.ntfs.report.rights'),
                responsive: ['md'],
                render: (_, row) =>
                  row.expected ? (
                    <span>
                      {row.actual ? `${t(`folderAccess.ntfs.preset.${row.actual}`)} → ` : ''}
                      <strong>{t(`folderAccess.ntfs.preset.${row.expected}`)}</strong>
                      {row.inherited && <Tag style={{ marginLeft: 6 }}>{t('folderAccess.ntfs.report.inherited')}</Tag>}
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                title: '',
                width: 110,
                render: (_, row) =>
                  row.fix && row.folder.shareId ? (
                    <Tooltip title={t('folderAccess.ntfs.report.fixHint')}>
                      <Button size="small" icon={<ToolOutlined />} onClick={() => navigate(ntfsUrl(row.folder.shareId, row.folder.path, row.fix))}>
                        {t('folderAccess.ntfs.report.fix')}
                      </Button>
                    </Tooltip>
                  ) : null,
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
