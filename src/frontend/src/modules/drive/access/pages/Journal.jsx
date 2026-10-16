import { useCallback, useEffect, useState } from 'react';
import { App, Button, DatePicker, Select, Switch, Table, Tag, Tooltip } from 'antd';
import { DownloadOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { useLocale } from '../../../../context/LocaleContext';
import { formatDateTime } from '../../../../lib/format';
import ModuleHeader from '../../../shared/ModuleHeader';
import { errorCode, faApi, faError } from '../api';
import { useAccess } from '../AccessContext';
import NtfsUndoDialog from '../components/ntfs/NtfsUndoDialog';

const MEMBERSHIP = ['member_add', 'member_remove', 'member_move'];
const GROUP = ['group_create', 'group_describe', 'group_delete'];
const NTFS = ['ntfs_set', 'ntfs_restore', 'ntfs_attach', 'ntfs_propagate'];
const NTFS_UNDO = ['ntfs_set', 'ntfs_restore', 'ntfs_attach'];
const ACTION_COLOR = { member_add: 'green', member_remove: 'red', member_move: 'blue', group_create: 'purple', group_describe: 'gold', group_delete: 'magenta', ntfs_set: 'volcano', ntfs_restore: 'cyan', ntfs_attach: 'geekblue', ntfs_propagate: 'lime' };

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
};

/** Who changed what and when; filters, CSV export, undo of membership changes. */
export default function Journal() {
  const { t, locale } = useLocale();
  const { info, change } = useAccess();
  const { message, modal } = App.useApp();
  const superadmin = info?.role === 'superadmin';
  const [filters, setFilters] = useState({ range: null, actions: [], result: '', user: null, mine: false, q: '', page: 1 });
  const [data, setData] = useState(null);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [undoing, setUndoing] = useState(null);

  const params = useCallback(
    (f = filters) => ({
      from: f.range?.[0] ? f.range[0].format('YYYY-MM-DD') : undefined,
      to: f.range?.[1] ? f.range[1].add(1, 'day').format('YYYY-MM-DD') : undefined,
      actions: f.actions.join(',') || undefined,
      result: f.result || undefined,
      user: f.user || undefined,
      mine: f.mine ? '1' : undefined,
      q: f.q || undefined,
      tz: browserZone() || undefined,
    }),
    [filters]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: next } = await faApi.journal({ ...params(), page: filters.page, pageSize: 50 });
      setData(next);
      setError(null);
    } catch (err) {
      setError(faError(err, t));
    } finally {
      setLoading(false);
    }
  }, [filters.page, params, t]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    faApi
      .journalPeople()
      .then(({ data: next }) => setPeople(next.people))
      .catch(() => setPeople([]));
  }, []);

  const set = (patch) => setFilters((prev) => ({ ...prev, page: 1, ...patch }));
  // 'pending': the undo copy is journalled but the write's outcome is not (undo shows the difference first).
  const canUndoNtfs = (row) =>
    superadmin && info?.canWrite && NTFS_UNDO.includes(row.action) && row.ok && (row.outcome === 'changed' || row.outcome === 'pending') && !row.undoneBy && Boolean(row.before?.hasSd || row.before?.sddl);
  const canUndo = (row) =>
    canUndoNtfs(row) || (info?.canWrite && MEMBERSHIP.includes(row.action) && row.ok && row.outcome === 'changed' && !row.undoneBy && (superadmin || row.user?.id === data?.viewer));
  const undo = async (row) => {
    if (NTFS.includes(row.action)) {
      setUndoing(row);
      return;
    }
    let result;
    try {
      result = await change(() => faApi.undo(row.id), { rethrow: true });
    } catch (err) {
      // Someone changed this person's membership of the group again later: undoing would revert that too.
      if (errorCode(err) !== 'FA_UNDO_SUPERSEDED') {
        message.error(faError(err, t));
        return;
      }
      const later = err?.response?.data?.info?.later || [];
      modal.confirm({
        title: t('folderAccess.journal.superseded.title'),
        content: t('folderAccess.journal.superseded.text', { ids: later.map((id) => `#${id}`).join(', ') }),
        okText: t('folderAccess.journal.superseded.ok'),
        okButtonProps: { danger: true },
        onOk: async () => {
          if (await change(() => faApi.undo(row.id, true))) load();
        },
      });
      return;
    }
    if (result) load();
  };
  const what = (row) => {
    if (row.action === 'member_move') return `${row.group?.name} → ${row.toGroup?.name}`;
    return row.group?.name || '—';
  };
  const ntfsText = (row) => {
    if (row.action === 'ntfs_propagate') {
      const p = row.after?.progress || {};
      return t('folderAccess.ntfs.journal.propagated', { mode: t(`folderAccess.ntfs.propagate.mode.${row.before?.mode || 'inherit'}`), changed: p.changed ?? 0, failed: row.after?.failedCount ?? 0 });
    }
    const summary = row.after?.summary;
    if (row.action === 'ntfs_attach') return (row.after?.groups || []).join(', ');
    if (!summary) return row.after?.sddl ? <code className="fa-code">{row.after.sddl}</code> : '';
    const parts = [];
    if (summary.protectedBefore !== summary.protectedAfter) parts.push(summary.protectedAfter ? t('folderAccess.ntfs.apply.inheritanceOff') : t('folderAccess.ntfs.apply.inheritanceOn'));
    parts.push(...summary.removed.map((entry) => `− ${entry.name || entry.sid}`), ...summary.added.map((entry) => `+ ${entry.name || entry.sid} (${t(`folderAccess.ntfs.preset.${entry.preset || 'special'}`)})`));
    return parts.join(' · ') || t('folderAccess.ntfs.apply.noChange');
  };
  const change2text = (row) => {
    if (NTFS.includes(row.action)) return ntfsText(row);
    if (row.action === 'group_describe') return `${row.before?.description || '∅'} → ${row.after?.description || '∅'}`;
    if (row.action === 'group_create') return row.after?.description || '';
    if (row.action === 'group_delete') return t('folderAccess.journal.deleted', { n: row.before?.memberCount ?? 0 });
    return row.member ? `${row.member.name}${row.member.login ? ` (${row.member.login})` : ''}` : '';
  };

  return (
    <div className="fs-page fa-page">
      <ModuleHeader
        title={t('folderAccess.journal.title')}
        description={superadmin ? t('folderAccess.journal.leadAll') : t('folderAccess.journal.leadMembership')}
        actions={[
          { key: 'csv', icon: <DownloadOutlined />, label: t('folderAccess.journal.export'), href: faApi.journalExportUrl(params()) },
          { key: 'refresh', icon: <ReloadOutlined />, label: t('folderAccess.refresh'), onClick: load, loading },
        ]}
        search={{ value: filters.q, onChange: (q) => set({ q }), onSearch: (q) => set({ q }), placeholder: t('folderAccess.journal.search') }}
      />
      <div className="fa-filters">
        <DatePicker.RangePicker value={filters.range} onChange={(range) => set({ range })} allowEmpty={[true, true]} />
        <Select
          mode="multiple"
          allowClear
          placeholder={t('folderAccess.journal.action')}
          value={filters.actions}
          onChange={(actions) => set({ actions })}
          options={(superadmin ? [...MEMBERSHIP, ...GROUP, ...NTFS] : MEMBERSHIP).map((action) => ({ value: action, label: t(`folderAccess.actions.${action}`) }))}
          style={{ minWidth: 200 }}
        />
        <Select
          allowClear
          placeholder={t('folderAccess.journal.who')}
          value={filters.user}
          onChange={(user) => set({ user })}
          options={people.map((person) => ({ value: person.id, label: person.name || person.login }))}
          style={{ minWidth: 180 }}
        />
        <Select
          value={filters.result}
          onChange={(result) => set({ result })}
          options={[
            { value: '', label: t('folderAccess.journal.anyResult') },
            { value: 'ok', label: t('folderAccess.journal.ok') },
            { value: 'failed', label: t('folderAccess.journal.failed') },
          ]}
          style={{ minWidth: 140 }}
        />
        <label className="fa-switch">
          <Switch size="small" checked={filters.mine} onChange={(mine) => set({ mine })} /> {t('folderAccess.journal.mine')}
        </label>
      </div>
      {error && <div className="signin__error">{error}</div>}
      <section className="panel">
        <Table
          rowKey="id"
          size="small"
          loading={loading && !data}
          dataSource={data?.items || []}
          pagination={{ current: data?.page || 1, pageSize: data?.pageSize || 50, total: data?.total || 0, showSizeChanger: false, onChange: (page) => setFilters((prev) => ({ ...prev, page })) }}
          columns={[
            { title: t('folderAccess.journal.when'), width: 150, render: (_, row) => formatDateTime(row.at, locale) },
            {
              title: t('folderAccess.journal.who'),
              render: (_, row) => (
                <div className="fa-person-cell">
                  <span>{row.user?.name || '—'}</span>
                  <span className="fa-muted">{[row.adAccount && `AD: ${row.adAccount}`, row.ip].filter(Boolean).join(' · ')}</span>
                </div>
              ),
            },
            {
              title: t('folderAccess.journal.action'),
              render: (_, row) => (
                <span>
                  <Tag color={ACTION_COLOR[row.action]}>{t(`folderAccess.actions.${row.action}`)}</Tag>
                  {row.via !== 'single' && <Tag>{t(`folderAccess.via.${row.via}`)}</Tag>}
                </span>
              ),
            },
            { title: superadmin ? t('folderAccess.journal.object') : t('folderAccess.group'), render: (_, row) => <code className="fa-code">{what(row)}</code> },
            { title: t('folderAccess.journal.change'), render: (_, row) => change2text(row) },
            {
              title: t('folderAccess.journal.result'),
              render: (_, row) => (
                <Tooltip title={row.error || null}>
                  <Tag color={!row.ok ? 'red' : row.outcome === 'changed' ? 'green' : row.outcome === 'pending' ? 'orange' : 'default'}>{t(`folderAccess.outcome.${row.outcome}`)}</Tag>
                  {row.undoneBy && <Tag>{t('folderAccess.journal.undone')}</Tag>}
                </Tooltip>
              ),
            },
            {
              title: '',
              width: 60,
              render: (_, row) =>
                canUndo(row) ? (
                  <Tooltip title={t('folderAccess.journal.undo')}>
                    <Button size="small" type="text" icon={<UndoOutlined />} onClick={() => undo(row)} />
                  </Tooltip>
                ) : null,
            },
          ]}
        />
      </section>
      <NtfsUndoDialog
        row={undoing}
        onClose={(done) => {
          setUndoing(null);
          if (done) load();
        }}
      />
    </div>
  );
}
