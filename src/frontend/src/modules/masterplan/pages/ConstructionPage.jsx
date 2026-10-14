import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Badge, Button, Segmented, Skeleton, Table, Tabs } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDate } from '../../../lib/datetime';
import { HelpButton } from '../../../help/Hint';
import { mpApi } from '../api';
import { useMp, useProject } from '../MpContext';
import { can } from '../lib';
import { Empty, Readiness, ScheduleBadge, TypeIcon } from '../components/bits';
import ReportFeed, { ReportFeedSkeleton } from '../components/ReportFeed';
import ReportDialog from '../components/ReportDialog';
import UnitCard from '../components/UnitCard';

/**
 * Строительство (spec §9.6): objects with stage, readiness, schedule and the
 * last report («нет отчёта больше 14 дней», «отставание», «мои объекты»),
 * the journal and the moderation queue; «+ Отчёт» everywhere.
 */
export default function ConstructionPage() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings } = useMp();
  const [search, setSearch] = useSearchParams();
  const { project, caps, tree, reload } = useProject();
  const tab = search.get('tab') || 'objects';
  const filter = search.get('filter') || 'all';
  const [list, setList] = useState(null);
  const [reports, setReports] = useState(null);
  const [review, setReview] = useState(null);
  const [reportOpen, setReportOpen] = useState(null);
  const selectedId = Number(search.get('node')) || null;
  const setParam = (key, value) => {
    const next = new URLSearchParams(window.location.search);
    if (value && value !== 'all' && value !== 'objects') next.set(key, String(value));
    else next.delete(key);
    setSearch(next, { replace: true });
  };

  const loadList = useCallback(async () => {
    try {
      const res = await mpApi.construction(project.id, filter === 'all' ? {} : { filter });
      setList(res.data);
    } catch (err) {
      message.error(errorMessage(err));
      setList({ items: [], review: 0 });
    }
  }, [project.id, filter, message]);
  const loadReports = useCallback(async () => {
    try {
      const [journal, pending] = await Promise.all([mpApi.reports({ project: project.id, limit: 20 }), mpApi.reports({ project: project.id, status: 'review', limit: 50 })]);
      // Everything the person may see, newest state first (drafts and reviews only reach their author and moderators).
      setReports({ list: journal.data.reports, cursor: journal.data.nextCursor || null });
      setReview(pending.data.reports);
    } catch (err) {
      message.error(errorMessage(err));
    }
  }, [project.id, message]);
  useEffect(() => {
    loadList();
  }, [loadList]);
  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const canReport = list?.items.some((item) => item.canReport);
  const reviewCount = review?.length || list?.review || 0;
  const columns = [
    {
      key: 'code',
      title: t('mp.reg.code'),
      render: (_, item) => (
        <button type="button" className="mp-reg__code" onClick={() => setParam('node', item.id)}>
          <b><TypeIcon node={{ kind: 'object', type: { icon: item.icon } }} size={14} /> {item.code || item.name}</b>
          <span>{[item.parent, item.type].filter(Boolean).join(' · ')}</span>
        </button>
      ),
    },
    { key: 'stage', title: t('mp.con.stage'), render: (_, item) => item.stage || <span className="mp-muted">—</span> },
    { key: 'readiness', title: t('mp.reg.readiness'), width: 160, render: (_, item) => <Readiness value={item.readiness} compact /> },
    { key: 'schedule', title: t('mp.con.schedule'), render: (_, item) => <ScheduleBadge schedule={item.schedule} alertDays={settings.delayAlertDays} /> },
    {
      key: 'last',
      title: t('mp.con.lastReport'),
      render: (_, item) => <span className={item.stale ? 'mp-stale' : ''}>{item.lastReportAt ? fmtDate(item.lastReportAt) : t('mp.con.never')}{item.stale ? ' ⚠' : ''}</span>,
    },
    { key: 'who', title: t('mp.f.buildUser'), render: (_, item) => item.buildUser?.name || <span className="mp-muted">—</span> },
    can(caps, 'status.view') && { key: 'sold', title: t('mp.con.sold'), align: 'center', render: (_, item) => (item.sold ? '●' : '') },
    {
      key: 'act',
      title: '',
      align: 'right',
      render: (_, item) => item.canReport && <Button size="small" onClick={() => setReportOpen({ projectId: project.id, nodeIds: [item.id] })} icon={<PlusOutlined />}>{t('mp.report.short')}</Button>,
    },
  ].filter(Boolean);

  // A report published, corrected or deleted may move stage progress: the list and the map follow.
  const afterChange = (kind) => {
    loadReports();
    if (kind !== 'media') {
      loadList();
      reload();
    }
  };

  const afterReport = (created) => {
    setReportOpen(null);
    if (created) {
      loadList();
      loadReports();
      reload();
    }
  };

  return (
    <div className={`mp-page${selectedId ? ' has-card' : ''}`}>
      <header className="mp-head">
        <div>
          <h1>{t('mp.nav.construction')}</h1>
          <p>{project.name}{project.settings?.moderation ? ` · ${t('mp.con.moderated')}` : ''}</p>
        </div>
        <div className="mp-head__actions">
          <HelpButton id="masterplan" section="construction" />
          {canReport && <Button type="primary" onClick={() => setReportOpen({ projectId: project.id })} icon={<PlusOutlined />}>{t('mp.report.short')}</Button>}
        </div>
      </header>
      <Tabs
        activeKey={tab}
        onChange={(key) => setParam('tab', key)}
        items={[
          { key: 'objects', label: t('mp.con.objects') },
          { key: 'journal', label: t('mp.con.journal') },
          reviewCount || can(caps, 'build.moderate') ? { key: 'review', label: <Badge count={reviewCount} size="small" offset={[10, 0]}>{t('mp.con.review')}</Badge> } : null,
        ].filter(Boolean)}
      />
      {tab === 'objects' && (
        <>
          <div className="mod-toolbar">
            <Segmented value={filter} onChange={(value) => setParam('filter', value)} options={[
              { value: 'all', label: t('mp.con.all') },
              { value: 'stale', label: t('mp.con.stale', { n: settings.staleReportDays }) },
              { value: 'behind', label: t('mp.con.behind') },
              { value: 'mine', label: t('mp.con.mine') },
            ]} />
          </div>
          {!list ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : !list.items.length ? (
            <Empty icon="🏗️" title={t('mp.con.empty')} text={filter === 'all' ? t('mp.con.emptyText') : null} />
          ) : (
            <>
              <Table className="mp-reg mp-hide-phone" rowKey="id" size="middle" columns={columns} dataSource={list.items} pagination={{ pageSize: 50, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />
              <ul className="mp-conlist mp-show-phone">
                {list.items.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => setParam('node', item.id)}>
                      <b>{item.code || item.name}</b>
                      <span>{item.stage || '—'}</span>
                    </button>
                    <Readiness value={item.readiness} compact />
                    <ScheduleBadge schedule={item.schedule} alertDays={settings.delayAlertDays} />
                    {item.stale && <span className="mp-stale">⚠ {item.lastReportAt ? fmtDate(item.lastReportAt) : t('mp.con.never')}</span>}
                    {item.canReport && <Button type="primary" ghost size="small" onClick={() => setReportOpen({ projectId: project.id, nodeIds: [item.id] })} icon={<PlusOutlined />}>{t('mp.report.short')}</Button>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {tab === 'journal' && (reports ? (
        <ReportFeed
          reports={reports.list}
          cursor={reports.cursor}
          params={{ project: project.id, limit: 20 }}
          onChanged={afterChange}
          onOpenNode={(id) => setParam('node', id)}
          onCreate={canReport ? () => setReportOpen({ projectId: project.id }) : null}
        />
      ) : <ReportFeedSkeleton count={3} />)}
      {tab === 'review' && (review ? <ReportFeed reports={review} onChanged={afterChange} onOpenNode={(id) => setParam('node', id)} emptyTitle={t('mp.rep.reviewEmpty')} emptyText={null} /> : <ReportFeedSkeleton />)}
      {canReport && <button type="button" className="mp-fab" onClick={() => setReportOpen({ projectId: project.id })} aria-label={t('mp.report.title')}>＋</button>}
      <ReportDialog open={reportOpen} onClose={afterReport} />
      {selectedId && tree.byId.has(selectedId) && <UnitCard key={selectedId} nodeId={selectedId} onClose={() => setParam('node', null)} onChanged={() => { loadList(); reload(); }} />}
    </div>
  );
}
