import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { App, Button, ColorPicker, Input, InputNumber, Select, Switch, Table, Tabs } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import LoadState from '../../../components/ui/LoadState';
import { mpApi } from '../api';
import { useMp } from '../MpContext';
import { MasterplanForm } from '../MasterplanSettings';
import { TYPE_ICONS } from '../lib';

/** Object types directory (§4.3): name, kind, category, sellable, stage set, icon, colour. */
function TypesEditor() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { meta, refresh } = useMp();
  const [rows, setRows] = useState(null);
  const [dirty, setDirty] = useState(false);
  const load = useCallback(() => mpApi.types(true).then((res) => setRows(res.data.types.map((row) => ({ ...row, key: row.id })))), []);
  useEffect(() => {
    load().catch((err) => message.error(errorMessage(err)));
  }, [load, message]);
  const set = (key, patch) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setDirty(true);
  };
  const save = async () => {
    try {
      const res = await mpApi.saveTypes(rows.map(({ key, used, ...row }) => row));
      setRows(res.data.types.map((row) => ({ ...row, key: row.id })));
      setDirty(false);
      refresh();
      message.success(t('common.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  if (!rows) return null;
  const stageSets = Object.keys(meta?.stages || {});
  return (
    <div className="mp-dir">
      <Table
        size="small"
        rowKey="key"
        pagination={false}
        scroll={{ x: 'max-content' }}
        dataSource={rows}
        rowClassName={(row) => (row.archived ? 'is-archived' : '')}
        columns={[
          { title: t('mpSettings.t.icon'), width: 90, render: (_, row) => <Select size="small" value={row.icon} onChange={(icon) => set(row.key, { icon })} options={(meta?.icons || []).map((icon) => ({ value: icon, label: TYPE_ICONS[icon] || icon }))} style={{ width: 70 }} /> },
          { title: t('mpSettings.t.name'), render: (_, row) => <Input size="small" value={row.name} onChange={(event) => set(row.key, { name: event.target.value })} maxLength={120} style={{ minWidth: 200 }} /> },
          { title: t('mpSettings.t.kind'), render: (_, row) => <Select size="small" value={row.nodeKind} disabled={row.used > 0} onChange={(nodeKind) => set(row.key, { nodeKind })} options={['object', 'plot', 'unit'].map((key) => ({ value: key, label: t(`mp.kind.${key}`) }))} style={{ width: 130 }} /> },
          { title: t('mpSettings.t.category'), render: (_, row) => <Select size="small" value={row.category} onChange={(category) => set(row.key, { category })} options={(meta?.categories || []).map((key) => ({ value: key, label: t(`mp.category.${key}`) }))} style={{ width: 150 }} /> },
          { title: t('mpSettings.t.sellable'), align: 'center', render: (_, row) => <Switch size="small" checked={row.sellable} disabled={row.used > 0} onChange={(sellable) => set(row.key, { sellable })} /> },
          { title: t('mpSettings.t.stages'), render: (_, row) => <Select size="small" allowClear value={row.stageSet} onChange={(stageSet) => set(row.key, { stageSet: stageSet || null })} options={stageSets.map((key) => ({ value: key, label: t(`mp.stageSet.${key}`) }))} style={{ width: 150 }} placeholder="—" /> },
          { title: t('mpSettings.t.color'), render: (_, row) => <ColorPicker size="small" value={row.color} disabledAlpha onChange={(color) => set(row.key, { color: color.toHexString().toUpperCase() })} /> },
          { title: t('mpSettings.t.used'), align: 'right', dataIndex: 'used' },
          { title: t('mpSettings.t.archived'), align: 'center', render: (_, row) => <Switch size="small" checked={row.archived} onChange={(archived) => set(row.key, { archived })} /> },
        ]}
      />
      <div className="mp-team__foot">
        <Button onClick={() => { setRows((prev) => [...prev, { key: `n${Date.now()}`, name: '', nodeKind: 'object', category: 'residential', sellable: true, stageSet: 'lowrise', icon: 'house', color: '#3B82F6', used: 0 }]); setDirty(true); }} icon={<PlusOutlined />}>{t('mpSettings.t.add')}</Button>
        <Button type="primary" disabled={!dirty} onClick={save}>{t('common.save')}</Button>
      </div>
    </div>
  );
}

/** Construction stages directory (§7.1) per stage set, with weights. */
function StagesEditor() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { meta, refresh } = useMp();
  const sets = useMemo(() => Object.keys(meta?.stages || {}), [meta]);
  const [set, setSet] = useState(sets[0]);
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setRows((meta?.stages?.[set] || []).map((stage) => ({ ...stage, key: stage.id })));
    setDirty(false);
  }, [set, meta]);
  const total = rows.reduce((sum, row) => sum + (Number(row.weight) || 0), 0);
  const change = (key, patch) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setDirty(true);
  };
  const move = (index, delta) => {
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setRows(next);
    setDirty(true);
  };
  return (
    <div className="mp-dir">
      <div className="mod-toolbar">
        <Select value={set} onChange={setSet} options={sets.map((key) => ({ value: key, label: t(`mp.stageSet.${key}`) }))} style={{ width: 220 }} />
        <span className="mp-muted">{t('mpSettings.s.total', { n: total })}</span>
      </div>
      <ol className="mp-stagelist">
        {rows.map((row, index) => (
          <li key={row.key}>
            <span className="mp-stagelist__n">{index + 1}</span>
            <Input value={row.name} onChange={(event) => change(row.key, { name: event.target.value })} maxLength={160} />
            <InputNumber value={row.weight} min={0} max={1000} onChange={(weight) => change(row.key, { weight })} addonAfter={t('mpSettings.s.weight')} style={{ width: 150 }} />
            <Button type="text" disabled={!index} onClick={() => move(index, -1)} aria-label="↑">↑</Button>
            <Button type="text" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label="↓">↓</Button>
            <Button type="text" danger onClick={() => { setRows((prev) => prev.filter((item) => item.key !== row.key)); setDirty(true); }} aria-label={t('common.delete')}>✕</Button>
          </li>
        ))}
      </ol>
      <div className="mp-team__foot">
        <Button onClick={() => { setRows((prev) => [...prev, { key: `n${Date.now()}`, name: '', weight: 1 }]); setDirty(true); }} icon={<PlusOutlined />}>{t('mpSettings.s.add')}</Button>
        <Button
          type="primary"
          disabled={!dirty}
          onClick={async () => {
            try {
              await mpApi.saveStages(set, rows.map((row) => ({ id: typeof row.id === 'number' ? row.id : undefined, name: row.name, weight: row.weight })));
              await refresh();
              message.success(t('common.saved'));
            } catch (err) {
              message.error(errorMessage(err));
            }
          }}
        >
          {t('common.save')}
        </Button>
      </div>
      <p className="mp-muted mp-small">{t('mpSettings.s.hint')}</p>
    </div>
  );
}

/** /app/masterplan/settings — masterplan administrators: rules, statuses, currencies, CRM mapping, directories. */
export default function SettingsPage() {
  const { t } = useLocale();
  const { can } = useAuth();
  const { isAdmin, refresh } = useMp();
  const [search, setSearch] = useSearchParams();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const tab = search.get('tab') || 'rules';
  const load = useCallback(() => {
    mpApi
      .settings()
      .then((res) => setSettings(res.data.settings))
      .catch(setError);
  }, []);
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);
  const state = useMemo(() => ({ enabled: true, settings: settings || {} }), [settings]);
  if (!isAdmin) return <Navigate to="/app/masterplan" replace />;
  return (
    <div className="mp-page mp-page--narrow">
      <header className="mp-head">
        <div>
          <h1>{t('mpSettings.title')}</h1>
          <p>{t('settings.masterplan.desc')}</p>
        </div>
        {can('settings.modules') && <Link to="/admin/settings/masterplan">{t('mpSettings.console')} →</Link>}
      </header>
      <Tabs activeKey={tab} onChange={(key) => setSearch(key === 'rules' ? {} : { tab: key }, { replace: true })} items={[{ key: 'rules', label: t('mpSettings.tabRules') }, { key: 'types', label: t('mpSettings.tabTypes') }, { key: 'stages', label: t('mpSettings.tabStages') }]} />
      {tab === 'rules' && (
        <LoadState ready={Boolean(settings) || Boolean(error)} error={error} onRetry={load}>
          {settings && (
            <MasterplanForm
              inApp
              state={state}
              onSave={async ({ settings: values }) => {
                const res = await mpApi.saveSettings(values);
                setSettings(res.data.settings);
                refresh().catch(() => {});
              }}
            />
          )}
        </LoadState>
      )}
      {tab === 'types' && <TypesEditor />}
      {tab === 'stages' && <StagesEditor />}
    </div>
  );
}
