import { useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { App, Button, Input, Result, Spin, Tabs, Tree } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { HelpButton } from '../../../help/Hint';
import { mpApi } from '../api';
import { useMp, useProject } from '../MpContext';
import { iconOf, nodeLabel, statusColor } from '../lib';
import { Empty } from '../components/bits';
import ImportDialog from '../components/ImportDialog';
import NodeEditor from '../structure/NodeEditor';
import { BulkDialog, CreateNodeDialog } from '../structure/NodeDialogs';
import PlansEditor from '../structure/PlansEditor';
import TeamEditor from '../structure/TeamEditor';
import ProjectForm from '../structure/ProjectForm';
import PriceGridEditor from '../structure/PriceGridEditor';
import MoveDialog, { BULK_MOVE_MAX } from '../structure/MoveDialog';
import '../mp-pricing.css';

/**
 * Структура проекта (administrators): the tree with drag & drop moves,
 * creation one by one or in bulk, import, the node editor; site plans with
 * the contour editor; the team with zones; the project's settings.
 */
export default function StructurePage() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings } = useMp();
  const [search, setSearch] = useSearchParams();
  const { project, data, tree, error, reload } = useProject();
  const [create, setCreate] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  // Several nodes at once (bulk move): a checkbox per node.
  const [multi, setMulti] = useState(false);
  const [checked, setChecked] = useState([]);
  const [moving, setMoving] = useState(null);
  const tab = search.get('tab') || 'tree';
  const selectedId = Number(search.get('node')) || null;
  const setParam = (key, value) => {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, String(value));
    else next.delete(key);
    setSearch(next, { replace: true });
  };

  const treeData = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const keep = (node) => !q || nodeLabel(node).toLowerCase().includes(q) || tree.kids(node.id).some(keep);
    const build = (parentId) =>
      tree
        .kids(parentId)
        .filter(keep)
        .map((node) => ({
          key: node.id,
          title: (
            <span className="mp-treenode">
              <span aria-hidden="true">{iconOf(node)}</span>
              <b>{node.code || node.name}</b>
              {node.code && node.name && <span>{node.name}</span>}
              {node.unit?.status && <i style={{ background: statusColor(node.unit.status, settings) }} />}
            </span>
          ),
          isLeaf: node.kind === 'unit' || !tree.kids(node.id).length,
          children: build(node.id),
        }));
    return build(0);
  }, [data, tree, query, settings]);

  if (error) return <Result status="warning" title={errorMessage(error)} />;
  if (!data) return <div className="page-fallback"><Spin /></div>;
  if (!project.canConfigure) return <Navigate to={`/app/masterplan/p/${project.id}/plan`} replace />;
  const selected = selectedId ? tree.byId.get(selectedId) : null;

  const onDrop = async (info) => {
    const dragId = info.dragNode.key;
    const target = tree.byId.get(info.node.key);
    // Dropped onto a node → inside it; between nodes → next to it (same parent).
    const parentId = info.dropToGap ? target.parentId : target.id;
    const siblings = tree.kids(parentId).filter((node) => node.id !== dragId);
    let sort;
    if (info.dropToGap) {
      const index = siblings.findIndex((node) => node.id === target.id);
      const next = siblings[index + 1];
      sort = next ? (target.sort + next.sort) / 2 : target.sort + 1;
    }
    try {
      await mpApi.moveNode(dragId, { parentId: parentId || null, sort });
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div className="mp-page">
      <header className="mp-head">
        <div>
          <h1>{t('mp.nav.structure')}</h1>
          <p>{project.name}</p>
        </div>
        <div className="mp-head__actions">
          <HelpButton id="masterplan" section="structure" />
        </div>
      </header>
      <Tabs
        activeKey={tab}
        onChange={(key) => setParam('tab', key === 'tree' ? null : key)}
        items={[
          { key: 'tree', label: t('mp.st.tabTree') },
          { key: 'plans', label: t('mp.st.tabPlans') },
          { key: 'team', label: t('mp.st.tabTeam') },
          { key: 'pricing', label: t('mp.st.tabPricing') },
          { key: 'project', label: t('mp.st.tabProject') },
        ]}
      />
      {tab === 'tree' && (
        <div className="mp-structure">
          <aside className="mp-structure__tree">
            <div className="mp-structure__tools">
              <Button type="primary" onClick={() => setCreate({ parentId: selected && selected.kind !== 'unit' ? selected.id : null })}>＋ {t('mp.st.add')}</Button>
              <Button onClick={() => setBulk({ parentId: selected && selected.kind !== 'unit' ? selected.id : null })}>{t('mp.st.bulk')}</Button>
              <Button onClick={() => setImporting(true)}>{t('mp.reg.import')}</Button>
            </div>
            <Input.Search allowClear placeholder={t('mp.filter.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="mp-structure__multi">
              <Button size="small" type={multi ? 'primary' : 'default'} onClick={() => { setMulti(!multi); setChecked([]); }}>{multi ? t('mp.move.done0') : t('mp.move.select')}</Button>
              {multi && <span className="mp-muted">{t('mp.move.checked', { n: checked.length })}</span>}
              {multi && checked.length > BULK_MOVE_MAX && <span className="mp-warn-text" role="alert">{t('mp.move.tooMany', { max: BULK_MOVE_MAX })}</span>}
              {multi && checked.length > 0 && <Button size="small" disabled={checked.length > BULK_MOVE_MAX} onClick={() => setMoving({ ids: checked })}>{t('mp.move.action')}…</Button>}
            </div>
            {treeData.length ? (
              <Tree
                className="mp-tree"
                treeData={treeData}
                selectedKeys={selectedId ? [selectedId] : []}
                onSelect={(keys) => setParam('node', keys[0])}
                checkable={multi}
                checkStrictly
                checkedKeys={multi ? { checked, halfChecked: [] } : undefined}
                onCheck={(keys) => setChecked((Array.isArray(keys) ? keys : keys.checked).map(Number))}
                draggable={multi ? false : { icon: false }}
                onDrop={onDrop}
                blockNode
                defaultExpandedKeys={selected ? selected.path : tree.roots.map((node) => node.id)}
                height={620}
                virtual
              />
            ) : (
              <Empty icon="🌳" title={t('mp.st.empty')} text={t('mp.st.emptyText')} />
            )}
          </aside>
          <section className="mp-structure__editor">
            {selected ? (
              <NodeEditor
                key={selected.id}
                node={selected}
                project={project}
                onSaved={() => reload()}
                onDeleted={() => { setParam('node', null); reload(); }}
                onAddChild={() => setCreate({ parentId: selected.id })}
                onBulk={() => setBulk({ parentId: selected.id })}
              />
            ) : (
              <Empty icon="👈" title={t('mp.st.pickNode')} text={t('mp.st.pickNodeText')} />
            )}
          </section>
        </div>
      )}
      {tab === 'plans' && <PlansEditor />}
      {tab === 'team' && <TeamEditor />}
      {tab === 'pricing' && <PriceGridEditor />}
      {tab === 'project' && <ProjectForm />}
      <MoveDialog open={moving} tree={tree} onClose={(done) => { setMoving(null); if (done) { setChecked([]); setMulti(false); reload(); } }} />
      <CreateNodeDialog open={create} project={project} tree={tree} onClose={(node) => { setCreate(null); if (node) { reload(); setParam('node', node.id); } }} />
      <BulkDialog open={bulk} project={project} tree={tree} onClose={(done) => { setBulk(null); if (done) reload(); }} />
      <ImportDialog open={importing} project={project} onClose={(done) => { setImporting(false); if (done) reload(); }} />
    </div>
  );
}
