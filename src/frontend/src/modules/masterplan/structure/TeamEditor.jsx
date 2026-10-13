import { useEffect, useMemo, useState } from 'react';
import { App, Button, Select, Skeleton, TreeSelect } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { DateField } from '../../../components/ui/DateTimeField';
import { userOptions } from '../../shared/People';
import { mpApi } from '../api';
import { useMp, useProject } from '../MpContext';
import { nodeLabel } from '../lib';

/**
 * Roles in this project with zones of responsibility (spec §8): a person or a
 * group, a module role, a zone (the whole project or a node's subtree) and an
 * optional end date (temporary access for a contractor or an auditor).
 */
export default function TeamEditor() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { users, meta, isAdmin } = useMp();
  const { project, tree } = useProject();
  const [rows, setRows] = useState(null);
  const [groups, setGroups] = useState([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    mpApi.team(project.id).then((res) => setRows(res.data.team.map((row, index) => ({ ...row, key: index })))).catch((err) => message.error(errorMessage(err)));
    mpApi.groups().then((res) => setGroups(res.data.groups)).catch(() => {});
  }, [project.id, message]);

  const zones = useMemo(() => {
    const build = (parentId) =>
      tree
        .kids(parentId)
        .filter((node) => node.kind !== 'unit')
        .map((node) => ({ value: node.id, title: nodeLabel(node), children: build(node.id) }));
    return build(0);
  }, [tree]);

  const subjects = [
    ...userOptions(users).map((option) => ({ ...option, value: `user:${option.value}` })),
    ...groups.map((group) => ({ value: `group:${group.id}`, label: `👥 ${group.name}`, search: group.name.toLowerCase() })),
  ];
  const set = (key, patch) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setDirty(true);
  };
  const save = async () => {
    try {
      const res = await mpApi.saveTeam(project.id, rows.filter((row) => row.subjectId && row.role).map(({ subjectType, subjectId, role, nodeId, until }) => ({ subjectType, subjectId, role, nodeId, until })));
      setRows(res.data.team.map((row, index) => ({ ...row, key: index })));
      setDirty(false);
      message.success(t('common.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  if (!rows) return <Skeleton active />;
  const roles = (meta?.roles || []).filter((role) => role !== 'admin' || isAdmin);
  return (
    <div className="mp-team">
      <p className="dialog-lead">{t('mp.team.lead')}</p>
      <div className="mp-team__rows">
        {rows.map((row) => (
          <div key={row.key} className="mp-team__row">
            <Select showSearch optionFilterProp="search" value={row.subjectId ? `${row.subjectType}:${row.subjectId}` : undefined} onChange={(value) => { const [type, id] = value.split(':'); set(row.key, { subjectType: type, subjectId: Number(id) }); }} options={subjects} placeholder={t('mp.team.who')} />
            <Select value={row.role} onChange={(role) => set(row.key, { role })} options={roles.map((role) => ({ value: role, label: t(`mp.role.${role}`) }))} placeholder={t('mp.team.role')} />
            <TreeSelect allowClear showSearch treeNodeFilterProp="title" value={row.nodeId || undefined} onChange={(nodeId) => set(row.key, { nodeId: nodeId || null })} treeData={zones} placeholder={t('mp.team.everywhere')} treeDefaultExpandAll={zones.length < 10} />
            <DateField value={row.until} onChange={(until) => set(row.key, { until })} placeholder={t('mp.team.until')} />
            <Button type="text" danger onClick={() => { setRows((prev) => prev.filter((item) => item.key !== row.key)); setDirty(true); }} aria-label={t('common.delete')}>✕</Button>
          </div>
        ))}
      </div>
      <div className="mp-team__foot">
        <Button onClick={() => { setRows((prev) => [...prev, { key: Date.now(), subjectType: 'user', subjectId: null, role: 'sales', nodeId: null, until: null }]); setDirty(true); }}>＋ {t('mp.team.add')}</Button>
        <Button type="primary" disabled={!dirty} onClick={save}>{t('common.save')}</Button>
      </div>
      <details className="mp-team__help">
        <summary>{t('mp.team.rolesHelp')}</summary>
        <ul>
          {(meta?.roles || []).map((role) => (
            <li key={role}><b>{t(`mp.role.${role}`)}</b> — {t(`mp.roleDesc.${role}`)}</li>
          ))}
        </ul>
        <p className="mp-muted">{t('mp.team.permHint')}</p>
      </details>
    </div>
  );
}
