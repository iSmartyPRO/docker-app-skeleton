import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Avatar, Button, Drawer, Empty, Form, Input, Modal, Popconfirm, Skeleton, Switch, Tag, Timeline, Tooltip, Tree } from 'antd';
import { DeleteOutlined, PlusOutlined, SearchOutlined, TeamOutlined, UndoOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { MenuIcon } from '../../components/icons/menuIcons';
import { fmtDateTime } from '../../lib/datetime';
import { orgApi, orgChanged } from './api';
import UnitForm, { formToPayload, unitToForm } from './UnitForm';
import UnitMembers from './UnitMembers';
import { knownError } from './errors';
import { buildTree, initialsOf, purposeLabel, typeLabel, typeOf } from './lib';

/** «Структура»: the tree editor with drag and drop, and the details of the selected unit. */
export default function OrgStructure({ meta, units, reload, canManage }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings } = useSettings();
  const [query, setQuery] = useState('');
  const [showClosed, setShowClosed] = useState(true);
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [creating, setCreating] = useState(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  useEffect(() => {
    const list = window.matchMedia('(max-width: 900px)');
    const on = () => setNarrow(list.matches);
    list.addEventListener?.('change', on);
    return () => list.removeEventListener?.('change', on);
  }, []);

  const employeesOn = Boolean(settings?.modules?.employees?.enabled);
  const visible = useMemo(() => units.filter((unit) => showClosed || unit.status === 'active'), [units, showClosed]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hit = new Set();
    for (const unit of visible) if (`${unit.name} ${unit.code || ''} ${unit.head?.name || ''}`.toLowerCase().includes(q)) hit.add(unit.id);
    return hit;
  }, [visible, query]);

  const treeData = useMemo(() => {
    const toNode = (node) => {
      const children = node.children.map(toNode).filter(Boolean);
      if (matches && !matches.has(node.id) && !children.length) return null;
      return { key: node.id, unit: node, children };
    };
    return buildTree(visible).map(toNode).filter(Boolean);
  }, [visible, matches]);

  // Everything open at first and while searching.
  const allKeys = useMemo(() => visible.map((unit) => unit.id), [visible]);
  const expandedKeys = matches ? allKeys : expanded ?? allKeys;
  const current = units.find((unit) => unit.id === selected) || null;

  const move = useCallback(
    async (unit, parentId, index, { silent = false } = {}) => {
      const before = { parentId: unit.parentId || null, index: units.filter((item) => (item.parentId || null) === (unit.parentId || null)).sort((a, b) => a.sort - b.sort).findIndex((item) => item.id === unit.id) };
      try {
        await orgApi.move(unit.id, { parentId, index });
        await reload();
        orgChanged();
        if (silent) return;
        const key = `org-move-${unit.id}`;
        message.open({
          key,
          type: 'success',
          duration: 6,
          content: (
            <span className="org-undo">
              {t('org.tree.moved', { name: unit.name })}
              <Button
                size="small"
                type="link"
                icon={<UndoOutlined />}
                onClick={() => {
                  message.destroy(key);
                  move(unit, before.parentId, before.index, { silent: true });
                }}
              >
                {t('org.tree.undo')}
              </Button>
            </span>
          ),
        });
      } catch (err) {
        message.error(knownError(err, t));
      }
    },
    [units, reload, message, t]
  );

  const onDrop = (info) => {
    const dragged = info.dragNode.unit;
    const target = info.node.unit;
    if (!info.dropToGap) {
      // Dropped onto a unit: it becomes the last subunit there.
      const kids = units.filter((unit) => unit.parentId === target.id && unit.id !== dragged.id).length;
      move(dragged, target.id, kids);
      return;
    }
    const pos = info.node.pos.split('-');
    const relative = info.dropPosition - Number(pos[pos.length - 1]);
    const parentId = target.parentId || null;
    const siblings = units
      .filter((unit) => (unit.parentId || null) === parentId && unit.id !== dragged.id)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'ru'));
    const at = siblings.findIndex((unit) => unit.id === target.id);
    move(dragged, parentId, relative === -1 ? Math.max(0, at) : at + 1);
  };

  const titleRender = (node) => {
    const unit = node.unit;
    const type = typeOf(meta, unit.type);
    const people = unit.counts?.employees ?? unit.counts?.users ?? 0;
    return (
      <span className={`org-tnode${unit.status === 'closed' ? ' is-closed' : ''}`} style={{ '--c': type.color }}>
        <span className="org-tnode__icon">
          <MenuIcon name={type.icon} variant="mono" />
        </span>
        <span className="org-tnode__name">{unit.name}</span>
        {unit.code && <span className="org-tnode__code">{unit.code}</span>}
        {unit.status === 'closed' && <Tag bordered={false}>{t('org.status.closed')}</Tag>}
        <span className="org-tnode__meta">
          {unit.head && (
            <Tooltip title={`${t('org.fields.head')}: ${unit.head.name}`}>
              <Avatar size={20} src={unit.head.avatarUrl || undefined}>
                {initialsOf(unit.head.name)}
              </Avatar>
            </Tooltip>
          )}
          {people > 0 && (
            <span className="org-tnode__count">
              <TeamOutlined /> {people}
            </span>
          )}
        </span>
      </span>
    );
  };

  const details = current ? (
    <UnitDetails key={current.id} unit={current} units={units} meta={meta} canManage={canManage} employeesOn={employeesOn} onChanged={reload} onDeleted={() => setSelected(null)} onAddChild={() => setCreating({ parentId: current.id })} />
  ) : (
    <div className="org-details__empty">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('org.tree.pick')} />
    </div>
  );

  return (
    <div className="org-editor">
      <section className="org-panel org-editor__tree" data-tour="org.tree">
        <div className="org-panel__bar">
          <Input allowClear prefix={<SearchOutlined />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('org.tree.search')} aria-label={t('org.tree.search')} />
          <label className="org-switch">
            <Switch size="small" checked={showClosed} onChange={setShowClosed} /> {t('org.tree.showClosed')}
          </label>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating({ parentId: null })} data-tour="org.add">
              {t('org.tree.add')}
            </Button>
          )}
        </div>
        {canManage && units.length > 0 && <p className="org-hint">{t('org.tree.dragHint')}</p>}
        {treeData.length ? (
          <Tree
            className="org-tree-edit"
            treeData={treeData}
            blockNode
            showLine={{ showLeafIcon: false }}
            draggable={canManage && !matches ? { icon: false } : false}
            onDrop={onDrop}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpanded(keys)}
            selectedKeys={selected ? [selected] : []}
            onSelect={(keys) => setSelected(keys[0] ?? selected)}
            titleRender={titleRender}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={units.length ? t('org.tree.nothingFound') : t('org.tree.empty')}
          >
            {!units.length && canManage && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating({ parentId: null })}>
                {t('org.tree.addFirst')}
              </Button>
            )}
          </Empty>
        )}
      </section>
      {narrow ? (
        <Drawer open={Boolean(current)} onClose={() => setSelected(null)} width="100%" title={current?.name} destroyOnClose>
          {details}
        </Drawer>
      ) : (
        <section className="org-panel org-editor__details" data-tour="org.details">{details}</section>
      )}
      <CreateDialog open={Boolean(creating)} defaults={creating} units={units} meta={meta} onClose={() => setCreating(null)} onCreated={async (unit) => {
        setCreating(null);
        await reload();
        orgChanged();
        setSelected(unit.id);
      }} />
    </div>
  );
}

function CreateDialog({ open, defaults, units, meta, onClose, onCreated }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const initial = useMemo(() => {
    const parent = units.find((unit) => unit.id === defaults?.parentId);
    // A sensible type: below a company an office, below an office a department…
    const guess = { company: 'office', office: 'department', branch: 'department', department: 'department' }[parent?.type] || (parent ? 'department' : 'company');
    const type = (meta?.types || []).some((item) => item.key === guess) ? guess : meta?.types?.[0]?.key;
    return unitToForm(null, { parentId: defaults?.parentId || null, type });
  }, [defaults, units, meta]);
  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);
  const submit = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const res = await orgApi.create(formToPayload(values));
      message.success(t('org.tree.created'));
      onCreated(res.data.unit);
    } catch (err) {
      message.error(knownError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} title={t('org.tree.newUnit')} onCancel={onClose} onOk={submit} okText={t('org.tree.create')} cancelText={t('common.cancel')} confirmLoading={busy} destroyOnClose width={560}>
      {open && <UnitForm form={form} unit={null} units={units} meta={meta} initialValues={initial} />}
    </Modal>
  );
}

const HISTORY_ICONS = { created: 'plus', moved: 'send', reordered: 'sliders', updated: 'edit', closed: 'archive', reopened: 'check', deleted: 'trash' };

function UnitDetails({ unit, units, meta, canManage, employeesOn, onChanged, onDeleted, onAddChild }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const initial = useMemo(() => unitToForm(unit), [unit]);
  const type = typeOf(meta, unit.type);

  const loadHistory = useCallback(() => {
    orgApi.history(unit.id).then((res) => setHistory(res.data.history)).catch(() => setHistory([]));
  }, [unit.id]);
  useEffect(() => {
    loadHistory();
  }, [loadHistory, unit.updatedAt]);

  const save = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      await orgApi.update(unit.id, formToPayload(values));
      message.success(t('org.tree.saved'));
      setDirty(false);
      await onChanged();
      orgChanged();
      loadHistory();
    } catch (err) {
      message.error(knownError(err, t));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await orgApi.remove(unit.id);
      message.success(t('org.tree.deleted'));
      onDeleted();
      await onChanged();
      orgChanged();
    } catch (err) {
      message.error(knownError(err, t));
    }
  };

  return (
    <div className="org-details">
      <header className="org-details__head" style={{ '--c': type.color }}>
        <span className="org-details__icon">
          <MenuIcon name={type.icon} variant="mono" />
        </span>
        <div className="org-details__title">
          <span className="org-details__crumbs">{unit.path.slice(0, -1).join(' / ') || typeLabel(type, t)}</span>
          <h3>{unit.name}</h3>
          <div className="org-details__chips">
            <Tag bordered={false} color={unit.status === 'closed' ? 'default' : 'green'}>{t(`org.status.${unit.status}`)}</Tag>
            <Tag bordered={false}>{typeLabel(type, t)}</Tag>
            {unit.code && <Tag bordered={false}>{unit.code}</Tag>}
            {(unit.purposes || []).map((key) => (
              <Tag bordered={false} color="blue" key={key}>
                {purposeLabel((meta?.purposes || []).find((item) => item.key === key) || { key }, t)}
              </Tag>
            ))}
            <Tooltip title={unit.timeZoneInherited ? t('org.tree.zoneInherited') : t('org.tree.zoneOwn')}>
              <Tag bordered={false}>🕒 {unit.effectiveTimeZone}{unit.timeZoneInherited ? ' ↑' : ''}</Tag>
            </Tooltip>
          </div>
        </div>
      </header>
      <div className="org-details__stats">
        <div>
          <strong>{unit.counts?.children ?? 0}</strong>
          <span>{t('org.tree.subunits')}</span>
        </div>
        <div>
          <strong>{unit.counts?.users ?? 0}</strong>
          <span>{t('org.tree.accounts')}</span>
        </div>
        {unit.counts?.employees !== null && unit.counts?.employees !== undefined && (
          <div>
            <strong>{unit.counts.employees}</strong>
            <span>{t('org.tree.employees')}</span>
          </div>
        )}
      </div>
      {canManage ? (
        <>
          <UnitForm form={form} unit={unit} units={units} meta={meta} initialValues={initial} onValuesChange={() => setDirty(true)} />
          <div className="org-details__actions">
            <Button type="primary" loading={busy} disabled={!dirty} onClick={save}>
              {t('common.save')}
            </Button>
            {dirty && (
              <Button
                onClick={() => {
                  form.setFieldsValue(initial);
                  setDirty(false);
                }}
              >
                {t('common.cancel')}
              </Button>
            )}
            <Button icon={<PlusOutlined />} onClick={onAddChild}>
              {t('org.tree.addChild')}
            </Button>
            <Popconfirm title={t('org.tree.deleteConfirm')} description={t('org.tree.deleteHint')} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={remove}>
              <Button danger type="text" icon={<DeleteOutlined />}>
                {t('common.delete')}
              </Button>
            </Popconfirm>
          </div>
        </>
      ) : (
        <dl className="org-dl">
          <dt>{t('org.fields.head')}</dt>
          <dd>{unit.head?.name || '—'}</dd>
          <dt>{t('org.fields.address')}</dt>
          <dd>{unit.address || '—'}</dd>
          {unit.legalEntity && (
            <>
              <dt>{t('org.fields.legalEntity')}</dt>
              <dd>{unit.legalEntity.label}</dd>
            </>
          )}
        </dl>
      )}
      <UnitMembers unit={unit} employeesOn={employeesOn} onChanged={onChanged} />
      {employeesOn && (
        <Link className="org-details__link" to={`/app/employees?unit=${unit.id}`}>
          <TeamOutlined /> {t('org.tree.openEmployees')}
        </Link>
      )}
      <section className="org-history">
        <h4>{t('org.history.title')}</h4>
        {!history ? (
          <Skeleton active paragraph={{ rows: 2 }} title={false} />
        ) : history.length ? (
          <Timeline
            items={history.slice(0, 20).map((event) => ({
              key: event.id,
              children: (
                <div className="org-history__item">
                  <span className="org-history__what">
                    <MenuIcon name={HISTORY_ICONS[event.action] || 'edit'} variant="mono" /> {historyText(event, units, t)}
                  </span>
                  <span className="org-history__who">
                    {event.actor?.name || t('org.history.system')} · {fmtDateTime(event.at)}
                  </span>
                </div>
              ),
            }))}
          />
        ) : (
          <p className="org-muted">{t('org.history.empty')}</p>
        )}
      </section>
    </div>
  );
}

function historyText(event, units, t) {
  const name = (id) => (id ? units.find((unit) => unit.id === id)?.name || `#${id}` : t('org.fields.topLevel'));
  if (event.action === 'moved') {
    const change = event.data?.changes?.parentId || {};
    return t('org.history.moved', { from: name(change.from), to: name(change.to) });
  }
  if (event.action === 'updated') {
    const fields = Object.keys(event.data?.changes || {}).map((key) => t(`org.fields.${key === 'headUserId' || key === 'headEmployeeId' ? 'head' : key === 'parentId' ? 'parent' : key}`));
    return t('org.history.updated', { fields: [...new Set(fields)].join(', ') || '—' });
  }
  const key = `org.history.${event.action}`;
  const text = t(key);
  return text === key ? event.action : text;
}
