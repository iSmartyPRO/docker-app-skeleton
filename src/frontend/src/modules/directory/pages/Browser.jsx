import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Checkbox, Drawer, Empty, Grid, Popover, Segmented, Select, Switch, Table, Tooltip } from 'antd';
import { CheckCircleOutlined, ClusterOutlined, ExportOutlined, PartitionOutlined, ReloadOutlined, SettingOutlined, StopOutlined, SwapOutlined, UserAddOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import ModuleHeader, { SelectionBar } from '../../shared/ModuleHeader';
import { DIRECTORY_ROOT, adApi, adError } from '../api';
import { useDirectory } from '../DirectoryContext';
import { COLUMN_KEYS, DEFAULT_COLUMNS, rdnName } from '../lib';
import OuTree from '../components/OuTree';
import ObjectCard from '../components/ObjectCard';
import CreateUserWizard from '../components/CreateUserWizard';
import { BulkDialog, OuPickerDialog } from '../components/Dialogs';
import { Avatar, DateText, LastLogon, ModeBadge, PathText, StatusTags } from '../components/Bits';

const COLUMNS_KEY = 'ad_columns';
const readColumns = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) || 'null');
    return Array.isArray(saved) && saved.length ? saved.filter((key) => COLUMN_KEYS.includes(key)) : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
};

const FLAG_KEYS = ['disabled', 'locked', 'pwdExpired', 'neverLogged', 'inactive'];

/**
 * The directory: the OU tree inside the managed root on the left, the users, groups and
 * computers of the selected OU on the right (search across the whole root), the card in a
 * drawer. State lives in the URL: ?ou=<dn>&q=&kind=&flags=&sub=1&open=<dn>.
 */
export default function Browser() {
  const { t } = useLocale();
  const { info } = useDirectory();
  const screens = Grid.useBreakpoint();
  const [params, setParams] = useSearchParams();
  const rootDn = info?.root?.dn;
  const ou = params.get('ou') || rootDn;
  const q = params.get('q') || '';
  const kind = params.get('kind') || 'all';
  const flags = (params.get('flags') || '').split(',').filter((flag) => FLAG_KEYS.includes(flag));
  // The root usually holds only OUs: there the whole subtree is shown unless switched off.
  const atRoot = !params.get('ou');
  const sub = params.get('sub') === '1' || (atRoot && params.get('sub') !== '0');
  const open = params.get('open');
  const [search, setSearch] = useState(q);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [columns, setColumns] = useState(readColumns);
  const [treeKey, setTreeKey] = useState(0);
  const [treeOpen, setTreeOpen] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [bulk, setBulk] = useState(null);
  const [picking, setPicking] = useState(false);

  const update = useCallback(
    (patch) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === '' || value === false) next.delete(key);
        else next.set(key, value === true ? '1' : value);
      }
      setParams(next, { replace: !('ou' in patch) && !('open' in patch) });
    },
    [params, setParams]
  );

  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns));
    } catch {
      /* private mode: keep it in memory */
    }
  }, [columns]);

  const load = useCallback(async () => {
    if (!ou) return;
    setLoading(true);
    try {
      setError(null);
      const { data: res } = await adApi.objects({ ou, q: q || undefined, kinds: kind === 'all' ? undefined : kind, flags: flags.join(',') || undefined, scope: sub ? 'sub' : 'one', page, pageSize: 100, inactiveDays: info?.settings?.inactiveDays });
      setData(res);
    } catch (err) {
      setError(adError(err, t));
      setData(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ou, q, kind, flags.join(','), sub, page, t]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setSelected([]);
    setPage(1);
  }, [ou, q, kind, flags.join(','), sub]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    load();
    setTreeKey((value) => value + 1);
  };

  // Breadcrumbs from the root down to the selected OU, read from the DN itself.
  const crumbs = useMemo(() => {
    const items = [{ key: 'root', label: info?.root?.name || t('apps.directory.name'), to: DIRECTORY_ROOT }];
    const chain = [];
    let current = ou;
    while (current && rootDn && current.toLowerCase().replace(/\s*,\s*/g, ',') !== rootDn.toLowerCase().replace(/\s*,\s*/g, ',') && chain.length < 30) {
      chain.unshift(current);
      const match = /^(?:\\.|[^,\\])+,(.*)$/.exec(current);
      current = match ? match[1] : null;
    }
    if (current) chain.forEach((dn) => items.push({ key: dn, label: rdnName(dn), to: `${DIRECTORY_ROOT}?ou=${encodeURIComponent(dn)}` }));
    return items;
  }, [info, ou, rootDn, t]);

  const selectOu = (dn) => {
    update({ ou: dn === rootDn ? null : dn, open: null });
    setTreeOpen(false);
  };

  const canManage = info?.rights?.manage;
  const canCreate = canManage && info?.settings?.allowCreate;
  const items = data?.items || [];
  const searchAll = Boolean(data?.searchAll);

  const columnDefs = {
    name: {
      key: 'name',
      title: t('directory.columns.name'),
      render: (_, item) => (
        <span className="ad-cell-name">
          <Avatar object={item} size={30} />
          <span className="ad-cell-name__text">
            <strong>{item.name}</strong>
            {(searchAll || sub || flags.length > 0) && item.path?.length > 0 && <span className="ad-muted ad-cell-sub"><PathText path={item.path} /></span>}
          </span>
        </span>
      ),
    },
    login: { key: 'login', title: t('directory.columns.login'), render: (_, item) => <span className="ad-mono">{item.login}</span>, responsive: ['md'] },
    status: { key: 'status', title: t('directory.columns.status'), render: (_, item) => (item.kind === 'group' ? <span className="ad-muted">{item.drive ? t('directory.group.folderGroup') : t(item.groupType?.security === false ? 'directory.group.distribution' : 'directory.group.security')}</span> : <StatusTags object={item} compact />) },
    title: { key: 'title', title: t('directory.attr.title'), dataIndex: 'title', responsive: ['lg'], ellipsis: true },
    department: { key: 'department', title: t('directory.attr.department'), dataIndex: 'department', responsive: ['lg'], ellipsis: true },
    mail: { key: 'mail', title: t('directory.attr.mail'), dataIndex: 'mail', responsive: ['lg'], ellipsis: true },
    phone: { key: 'phone', title: t('directory.attr.telephoneNumber'), dataIndex: 'phone', responsive: ['lg'] },
    lastLogon: { key: 'lastLogon', title: t('directory.columns.lastLogon'), render: (_, item) => (item.kind === 'group' ? null : <LastLogon value={item.lastLogon} inactiveDays={info?.settings?.inactiveDays} />), responsive: ['md'] },
    pwdLastSet: { key: 'pwdLastSet', title: t('directory.card.pwdLastSet'), render: (_, item) => (item.kind === 'user' ? (item.mustChange ? t('directory.status.mustChange') : <DateText value={item.pwdLastSet} />) : null), responsive: ['lg'] },
    created: { key: 'created', title: t('directory.card.created'), render: (_, item) => <DateText value={item.created} />, responsive: ['lg'] },
    path: { key: 'path', title: t('directory.card.ou'), render: (_, item) => <PathText path={item.path} />, responsive: ['lg'] },
    links: {
      key: 'links',
      title: t('directory.columns.links'),
      responsive: ['md'],
      render: (_, item) => (
        <span className="ad-tags">
          {item.portalUser && <Tooltip title={t('directory.links.portalChip', { user: item.portalUser.username })}><span className="ad-mini-chip">@{item.portalUser.username}</span></Tooltip>}
          {item.employee && <Tooltip title={t('directory.links.employeeChip')}><span className="ad-mini-chip ad-mini-chip--emp">{item.employee.name.split(' ').slice(0, 2).join(' ')}</span></Tooltip>}
        </span>
      ),
    },
  };

  const columnPicker = (
    <Popover
      trigger="click"
      placement="bottomRight"
      title={t('directory.columns.pick')}
      content={
        <Checkbox.Group className="ad-colpick" value={columns} onChange={(value) => setColumns(value.length ? COLUMN_KEYS.filter((key) => value.includes(key)) : ['name'])} options={COLUMN_KEYS.map((key) => ({ value: key, label: t(`directory.columns.${key}`), disabled: key === 'name' }))} />
      }
    >
      <Tooltip title={t('directory.columns.pick')}>
        <Button type="text" icon={<SettingOutlined />} aria-label={t('directory.columns.pick')} data-tour="directory.columns" />
      </Tooltip>
    </Popover>
  );

  const accounts = items.filter((item) => selected.includes(item.dn));
  const selection = selected.length > 0 && canManage && (
    <SelectionBar
      label={t('directory.selected', { n: selected.length })}
      onClear={() => setSelected([])}
      actions={[
        { key: 'disable', icon: <StopOutlined />, label: t('directory.actions.disable'), onClick: () => setBulk({ action: 'disable' }), danger: true },
        { key: 'enable', icon: <CheckCircleOutlined />, label: t('directory.actions.enable'), onClick: () => setBulk({ action: 'enable' }) },
        { key: 'move', icon: <SwapOutlined />, label: t('directory.actions.move'), onClick: () => setPicking(true) },
        info?.settings?.disabledOu && { key: 'offboard', icon: <ExportOutlined />, label: t('directory.actions.offboard'), onClick: () => setBulk({ action: 'offboard' }), danger: true },
      ].filter(Boolean)}
    />
  );

  const filters = (
    <div className="ad-filters" data-tour="directory.filters">
      <Segmented
        size="middle"
        value={kind}
        onChange={(value) => update({ kind: value === 'all' ? null : value })}
        options={[
          { value: 'all', label: t('directory.kinds.all') },
          { value: 'user', label: t('directory.kinds.user') },
          { value: 'group', label: t('directory.kinds.group') },
          { value: 'computer', label: t('directory.kinds.computer') },
        ]}
      />
      <Select
        mode="multiple"
        allowClear
        maxTagCount="responsive"
        value={flags}
        onChange={(value) => update({ flags: value.join(',') })}
        placeholder={t('directory.flags.placeholder')}
        className="ad-flag-select"
        options={FLAG_KEYS.map((flag) => ({ value: flag, label: flag === 'inactive' ? t('directory.flags.inactiveN', { n: info?.settings?.inactiveDays || 90 }) : t(`directory.flags.${flag}`) }))}
      />
      {!q && (
        <Tooltip title={t('directory.subHint')}>
          <label className="ad-sub">
            <Switch size="small" checked={sub || flags.length > 0} disabled={flags.length > 0} onChange={(value) => update({ sub: value ? '1' : atRoot ? '0' : null })} /> {t('directory.sub')}
          </label>
        </Tooltip>
      )}
    </div>
  );

  const list = screens.md ? (
    <Table
      className="ad-table"
      size="middle"
      rowKey="dn"
      loading={loading}
      dataSource={items}
      columns={columns.map((key) => columnDefs[key]).filter(Boolean)}
      scroll={{ x: 'max-content' }}
      rowSelection={canManage ? { selectedRowKeys: selected, onChange: setSelected, getCheckboxProps: (item) => ({ disabled: item.kind === 'group' && item.drive }) } : undefined}
      onRow={(item) => ({ onClick: () => update({ open: item.dn }), className: item.dn === open ? 'is-open' : undefined })}
      pagination={data && data.total > data.pageSize ? { current: page, pageSize: data.pageSize, total: data.total, showSizeChanger: false, onChange: setPage } : false}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error || (q || flags.length ? t('directory.emptySearch') : t('directory.emptyOu'))} /> }}
    />
  ) : (
    <ul className="ad-mlist">
      {!loading && !items.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error || t('directory.emptyOu')} />}
      {items.map((item) => (
        <li key={item.dn}>
          <button type="button" onClick={() => update({ open: item.dn })}>
            <Avatar object={item} size={40} />
            <span className="ad-mlist__main">
              <strong>{item.name}</strong>
              <span className="ad-muted">{[item.login, item.title].filter(Boolean).join(' · ')}</span>
              <StatusTags object={item} compact />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  const tree = <OuTree selected={ou} onSelect={selectOu} reloadKey={treeKey} />;

  return (
    <div className="ad-browser">
      <ModuleHeader
        crumbs={crumbs}
        icon={<ClusterOutlined />}
        title={ou === rootDn ? info?.root?.name : rdnName(ou)}
        meta={<ModeBadge info={info} />}
        actions={[
          canCreate && { key: 'create', primary: true, icon: <UserAddOutlined />, label: t('directory.actions.create'), onClick: () => setWizard(true), tour: 'directory.create' },
          { key: 'refresh', icon: <ReloadOutlined />, label: t('directory.refresh'), onClick: refresh },
        ]}
        search={{ value: search, onChange: setSearch, onSearch: (value) => update({ q: value.trim() || null }), loading, placeholder: t('directory.searchPlaceholder') }}
        filters={filters}
        status={data ? (searchAll ? t('directory.foundInRoot', { n: data.total }) : t('directory.itemsN', { n: data.total })) : null}
        selection={selection}
        tools={columnPicker}
      />
      <div className="ad-split">
        <aside className="ad-split__tree" data-tour="directory.tree" aria-label={t('directory.treeTitle')}>
          <div className="ad-split__label">
            <PartitionOutlined /> {t('directory.treeTitle')}
          </div>
          {screens.lg !== false && tree}
        </aside>
        <section className="ad-split__list" data-tour="directory.list">
          {!screens.lg && (
            <Button className="ad-ou-button" icon={<PartitionOutlined />} onClick={() => setTreeOpen(true)}>
              {ou === rootDn ? info?.root?.name : rdnName(ou)}
            </Button>
          )}
          {data?.truncated && (
            // The server read only the first `limit` objects: order, total and paging cover just those.
            <Alert className="ad-gap" type="warning" showIcon message={t('directory.truncated', { n: data.limit || 5000 })} description={t('directory.truncatedHint')} />
          )}
          {list}
        </section>
      </div>
      <Drawer open={treeOpen} onClose={() => setTreeOpen(false)} placement="left" width={320} title={t('directory.treeTitle')}>
        {treeOpen && tree}
      </Drawer>
      <ObjectCard dn={open} onClose={() => update({ open: null })} onOpen={(dn) => update({ open: dn })} onChanged={refresh} />
      <CreateUserWizard
        open={wizard}
        initial={ou && ou !== rootDn ? { ou } : null}
        onClose={(dn) => {
          setWizard(false);
          if (dn) {
            refresh();
            update({ open: dn });
          }
        }}
      />
      <OuPickerDialog open={picking} title={t('directory.move.titleMany', { n: selected.length })} okText={t('directory.move.next')} onClose={() => setPicking(false)} onPick={(target) => { setPicking(false); setBulk({ action: 'move', targetOu: target.dn }); }} />
      <BulkDialog
        open={Boolean(bulk)}
        action={bulk?.action}
        dns={selected.length ? selected : accounts.map((item) => item.dn)}
        targetOu={bulk?.targetOu}
        onClose={(done) => {
          setBulk(null);
          if (done) {
            setSelected([]);
            refresh();
          }
        }}
      />
    </div>
  );
}
