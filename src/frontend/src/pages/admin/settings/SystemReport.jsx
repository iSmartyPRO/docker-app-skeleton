import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Dropdown, Progress, Table, Tag, Tooltip } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import LoadState from '../../../components/ui/LoadState';
import { SettingsSection } from '../../../components/ui/SettingsSection';
import { useLocale } from '../../../context/LocaleContext';
import { formatBytes, formatDateTime, formatDuration } from '../../../lib/format';
import api from '../../../services/api';
import { moduleName } from '../../../modules/platformUi';
import './platform.css';

const STATUS_COLOR = { ok: 'success', warn: 'warning', fail: 'error', unknown: 'default' };
const INT_COLOR = { on: 'success', off: 'default', incomplete: 'warning' };

function everyText(ms, t, locale) {
  if (ms < 60_000) return t('format.duration.seconds', { n: Math.round(ms / 1000) });
  return formatDuration(Math.round(ms / 1000), locale);
}

/** The report as Markdown for support (no secrets: the server never sends any). */
export function reportMarkdown(report, t, locale) {
  const lines = [];
  const v = report.versions;
  lines.push(`# ${t('platform.system.report')} — ${report.generatedAt}`, '');
  lines.push(`## ${t('platform.system.versions')}`, '', `- ${t('platform.system.core')}: ${v.core}`, `- ${t('platform.system.build')}: ${v.build?.id || '—'} ${v.build?.date || ''}`, `- Node.js: ${v.node}`, `- PostgreSQL: ${v.postgres || '—'}`, `- ${t('platform.system.environment')}: ${v.environment}`, `- ${t('platform.system.timeZone')}: ${v.timeZone}`, '');
  lines.push(`## ${t('platform.system.modules')}`, '', '| id | version | minCore | enabled | changed |', '|---|---|---|---|---|');
  for (const row of report.modules) lines.push(`| ${row.id} | ${row.version} | ${row.minCore} | ${row.enabled ? 'yes' : 'no'} | ${row.changedAt || ''} |`);
  const r = report.resources;
  lines.push('', `## ${t('platform.system.resources')}`, '', `- disk: ${formatBytes(r.disk?.freeBytes)} free / ${formatBytes(r.disk?.totalBytes)}`, `- uploads: ${formatBytes(r.uploads?.bytes)} (${r.uploads?.files} files${r.uploads?.partial ? ', partial' : ''})`, `- previews: ${formatBytes(r.previews?.bytes)}`, `- rss: ${formatBytes(r.process?.rssBytes)}, uptime ${r.process?.uptimeSeconds}s, load ${r.host?.loadAverage?.join(' / ')}`, `- database: ${formatBytes(r.database?.sizeBytes)}`);
  for (const table of r.database?.topTables || []) lines.push(`  - ${table.name}: ${formatBytes(table.sizeBytes)} (${table.rows} rows)`);
  const c = report.counts || {};
  lines.push('', `## ${t('platform.system.counts')}`, '', `- users: ${c.users} (active ${c.activeUsers}, blocked ${c.blockedUsers})`, `- sessions: ${c.activeSessions}`, `- files: ${c.files} (${formatBytes(c.filesBytes)})`);
  lines.push('', `## ${t('platform.system.jobs')}`, '', '| job | every | runs | failures | last run | ms | last error |', '|---|---|---|---|---|---|---|');
  for (const job of report.jobs) lines.push(`| ${job.name} | ${Math.round(job.everyMs / 1000)}s | ${job.runs} | ${job.failures} | ${job.lastFinishedAt || ''} | ${job.lastDurationMs ?? ''} | ${(job.lastError || '').replace(/\|/g, '/')} |`);
  lines.push('', `## ${t('platform.system.integrations')}`, '');
  for (const item of report.integrations) lines.push(`- ${item.id}: ${item.status}${item.missing?.length ? ` (missing: ${item.missing.join(', ')})` : ''}`);
  const q = report.queues || {};
  lines.push('', `## ${t('platform.system.queues')}`, '', `- webhooks: pending ${q.webhooks?.pending ?? '—'}, failed 24h ${q.webhooks?.failed24h ?? '—'}, ok 24h ${q.webhooks?.delivered24h ?? '—'}`, `- notifications 24h: ${q.notifications?.last24h ?? '—'}, deferred ${q.notifications?.deferred ?? '—'}`);
  lines.push('', `## ${t('platform.system.checks')}`, '');
  for (const check of report.checks) lines.push(`- ${check.id}: ${check.status}${check.value ? ` (${check.value})` : ''}`);
  if (report.demo?.active) lines.push('', `Demo data: ${report.demo.modules.join(', ')}`);
  return `${lines.join('\n')}\n`;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The System page report (spec §9): GET /admin/system/report, cached 30 s on the server. */
export default function SystemReport() {
  const { t, locale } = useLocale();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    try {
      const res = await api.get('/admin/system/report', { params: fresh ? { fresh: 1 } : {}, timeout: 60000 });
      setReport(res.data.report);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exportAs = ({ key }) => {
    const stamp = (report.generatedAt || '').slice(0, 19).replace(/[:T]/g, '-');
    if (key === 'json') download(`system-report-${stamp}.json`, JSON.stringify(report, null, 2), 'application/json');
    else download(`system-report-${stamp}.md`, reportMarkdown(report, t, locale), 'text/markdown');
  };

  const r = report?.resources;
  const c = report?.counts || {};
  const q = report?.queues || {};
  const valueText = (check) => {
    if (!check.value) return '';
    const key = `platform.system.checkValue.${check.value}`;
    const label = t(key);
    if (label !== key) return label;
    if (check.id === 'backup') return formatDateTime(check.value, locale);
    return check.value;
  };

  return (
    <div className="pf-system">
      <div className="pf-system__bar">
        <h2>{t('platform.system.report')}</h2>
        {report && <span className="pf-muted">{t('platform.system.generated', { time: formatDateTime(report.generatedAt, locale) })}</span>}
        <span className="pf-system__spacer" />
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => load(true)}>
          {t('platform.system.refresh')}
        </Button>
        <Tooltip title={t('platform.system.exportNote')}>
          <Dropdown
            disabled={!report}
            menu={{
              items: [
                { key: 'md', label: t('platform.system.exportMd') },
                { key: 'json', label: t('platform.system.exportJson') },
              ],
              onClick: exportAs,
            }}
          >
            <Button icon={<DownloadOutlined />}>{t('platform.system.export')}</Button>
          </Dropdown>
        </Tooltip>
      </div>
      <LoadState ready={Boolean(report) || !loading} error={error} onRetry={() => load(true)}>
        {report && (
          <>
            <div className="pf-system__grid">
              <SettingsSection title={t('platform.system.checks')}>
                <ul className="pf-checks">
                  {report.checks.map((check) => (
                    <li key={check.id}>
                      <Badge status={STATUS_COLOR[check.status]} />
                      <span className="pf-checks__name">
                        {t(`platform.system.check.${check.id}`)}
                        <small className="pf-checks__value">{valueText(check)}</small>
                      </span>
                      <Tag bordered={false} color={STATUS_COLOR[check.status] === 'default' ? undefined : STATUS_COLOR[check.status]}>{t(`platform.system.status.${check.status}`)}</Tag>
                    </li>
                  ))}
                </ul>
              </SettingsSection>
              <SettingsSection title={t('platform.system.versions')}>
                <dl className="pf-kv">
                  <dt>{t('platform.system.core')}</dt>
                  <dd>v{report.versions.core}</dd>
                  <dt>{t('platform.system.build')}</dt>
                  <dd>
                    <code>{report.versions.build?.id || '—'}</code>
                    {report.versions.build?.date && <span className="pf-muted"> · {formatDateTime(report.versions.build.date, locale)}</span>}
                  </dd>
                  <dt>{t('platform.system.node')}</dt>
                  <dd>{report.versions.node}</dd>
                  <dt>{t('platform.system.postgres')}</dt>
                  <dd>{report.versions.postgres || '—'}</dd>
                  <dt>{t('platform.system.environment')}</dt>
                  <dd>{report.versions.environment}</dd>
                  <dt>{t('platform.system.timeZone')}</dt>
                  <dd>{report.versions.timeZone}</dd>
                </dl>
              </SettingsSection>
              <SettingsSection title={t('platform.system.resources')}>
                <div className="pf-meter">
                  <div className="pf-meter__head">
                    <span>{t('platform.system.disk')}</span>
                    <span className="pf-muted">{t('platform.system.diskFree', { free: formatBytes(r.disk?.freeBytes), total: formatBytes(r.disk?.totalBytes) })}</span>
                  </div>
                  <Progress percent={r.disk?.usedPercent || 0} showInfo={false} status={(r.disk?.usedPercent || 0) > 90 ? 'exception' : 'normal'} size="small" />
                </div>
                <dl className="pf-kv">
                  <dt>{t('platform.system.uploads')}</dt>
                  <dd>
                    {formatBytes(r.uploads?.bytes)} · {t('platform.system.filesN', { n: r.uploads?.files ?? 0 })}
                    {r.uploads?.partial && <span className="pf-muted"> ({t('platform.system.approx')})</span>}
                  </dd>
                  <dt>{t('platform.system.previews')}</dt>
                  <dd>{formatBytes(r.previews?.bytes)}</dd>
                  <dt>{t('platform.system.memory')}</dt>
                  <dd>
                    {formatBytes(r.process?.rssBytes)} <span className="pf-muted">· {t('platform.system.heap', { used: formatBytes(r.process?.heapUsedBytes) })}</span>
                  </dd>
                  <dt>{t('platform.system.uptime')}</dt>
                  <dd>{formatDuration(r.process?.uptimeSeconds, locale)}</dd>
                  <dt>{t('platform.system.load')}</dt>
                  <dd>
                    {r.host?.loadAverage?.join(' / ')} <span className="pf-muted">· {t('platform.system.cpus', { n: r.host?.cpus })}</span>
                  </dd>
                  <dt>{t('platform.system.dbSize')}</dt>
                  <dd>{formatBytes(r.database?.sizeBytes)}</dd>
                </dl>
              </SettingsSection>
              <SettingsSection title={t('platform.system.counts')}>
                <div className="pf-stats">
                  <div>
                    <b>{c.users ?? '—'}</b>
                    <span>{t('platform.system.users')}</span>
                    <small>{t('platform.system.usersActive', { n: c.activeUsers ?? '—' })}</small>
                  </div>
                  <div>
                    <b>{c.activeSessions ?? '—'}</b>
                    <span>{t('platform.system.sessions')}</span>
                  </div>
                  <div>
                    <b>{c.files ?? '—'}</b>
                    <span>{t('platform.system.files')}</span>
                    <small>{formatBytes(c.filesBytes || 0)}</small>
                  </div>
                </div>
              </SettingsSection>
              <SettingsSection title={t('platform.system.integrations')}>
                <ul className="pf-checks">
                  {report.integrations.map((item) => (
                    <li key={item.id}>
                      <Badge status={INT_COLOR[item.status]} />
                      <span className="pf-checks__name">{t(`platform.integrations.${item.id}`)}</span>
                      <span className="pf-checks__state">
                        {item.status === 'on' ? t('platform.system.intOn') : item.status === 'off' ? t('platform.system.intOff') : t('platform.system.intIncomplete', { fields: item.missing.join(', ') })}
                      </span>
                    </li>
                  ))}
                </ul>
              </SettingsSection>
              <SettingsSection title={t('platform.system.queues')}>
                <dl className="pf-kv">
                  <dt>{t('platform.system.webhooks')}</dt>
                  <dd>{q.webhooks ? t('platform.system.webhooksLine', { pending: q.webhooks.pending, failed: q.webhooks.failed24h, ok: q.webhooks.delivered24h }) : '—'}</dd>
                  <dt>{t('platform.system.notifications')}</dt>
                  <dd>{t('platform.system.notificationsLine', { n: q.notifications?.last24h ?? '—', deferred: q.notifications?.deferred ?? '—' })}</dd>
                </dl>
                {report.demo?.active && <p className="pf-muted">{t('platform.system.demoOn', { list: report.demo.modules.map((id) => moduleName(id, t)).join(', ') })}</p>}
              </SettingsSection>
            </div>

            <SettingsSection title={t('platform.system.modules')}>
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                scroll={{ x: 640 }}
                dataSource={report.modules}
                columns={[
                  { title: t('platform.system.module'), dataIndex: 'id', render: (id, row) => <Link to={`/admin/modules/${id}/docs`}>{moduleName(id, t)}{row.core && <Tag bordered={false} color="blue" className="pf-ml">{t('platform.modules.coreTag')}</Tag>}</Link> },
                  { title: t('platform.system.version'), dataIndex: 'version', render: (value) => <span className="pf-version">v{value}</span> },
                  { title: t('platform.system.minCore'), dataIndex: 'minCore', render: (value, row) => <span className={row.compatible ? '' : 'pf-bad'}>v{value}</span> },
                  { title: t('platform.system.enabled'), dataIndex: 'enabled', render: (value) => <Badge status={value ? 'success' : 'default'} text={value ? t('platform.modules.statusOn') : t('platform.modules.statusOff')} /> },
                  { title: t('platform.system.lastChange'), dataIndex: 'changelog', render: (entry) => (entry ? <span><span className="pf-muted">{entry.date}</span> · {(entry.changes?.[locale] || entry.changes?.en || [])[0]}</span> : '—') },
                ]}
              />
            </SettingsSection>

            <SettingsSection title={t('platform.system.jobs')}>
              <Table
                size="small"
                rowKey="name"
                pagination={false}
                scroll={{ x: 640 }}
                dataSource={report.jobs}
                columns={[
                  { title: t('platform.system.job'), dataIndex: 'name', render: (value, row) => <code>{value}{row.running && <Tag bordered={false} color="processing" className="pf-ml">{t('platform.system.running')}</Tag>}</code> },
                  { title: t('platform.system.every'), dataIndex: 'everyMs', render: (value) => everyText(value, t, locale) },
                  { title: t('platform.system.lastRun'), dataIndex: 'lastFinishedAt', render: (value) => (value ? formatDateTime(value, locale) : <span className="pf-muted">{t('platform.system.never')}</span>) },
                  { title: t('platform.system.duration'), dataIndex: 'lastDurationMs', render: (value) => (value == null ? '—' : `${value} ms`) },
                  { title: t('platform.system.lastError'), dataIndex: 'lastError', render: (value, row) => (value ? <Tooltip title={value}><span className="pf-bad pf-ellipsis">{formatDateTime(row.lastErrorAt, locale)} · {value}</span></Tooltip> : '—') },
                ]}
              />
            </SettingsSection>

            <SettingsSection title={t('platform.system.topTables')}>
              <Table
                size="small"
                rowKey="name"
                pagination={false}
                dataSource={r.database?.topTables || []}
                columns={[
                  { title: t('platform.system.table'), dataIndex: 'name', render: (value) => <code>{value}</code> },
                  { title: t('platform.system.size'), dataIndex: 'sizeBytes', align: 'right', render: (value) => formatBytes(value) },
                  { title: t('platform.system.rows'), dataIndex: 'rows', align: 'right', render: (value) => value.toLocaleString(locale) },
                ]}
              />
            </SettingsSection>
          </>
        )}
      </LoadState>
    </div>
  );
}
