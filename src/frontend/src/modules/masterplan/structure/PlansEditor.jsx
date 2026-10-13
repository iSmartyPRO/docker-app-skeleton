import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty as AntEmpty, Input, Popconfirm, Select, Space, Tooltip, Upload } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { mpApi } from '../api';
import { useMp, useProject } from '../MpContext';
import { nodeLabel } from '../lib';
import { imageSize, uploadMedia } from '../media/photos';
import PlanCanvas from '../plan/PlanCanvas';
import { nodeFill } from '../plan/colors';

/**
 * Site plans and the contour editor (spec §9.1, administrators): upload a
 * background (picture or SVG), pick an object, click points over the drawing,
 * close the polygon, drag points to adjust, save. Double-click a point to
 * remove it.
 */
export default function PlansEditor() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings } = useMp();
  const { project, tree, plans, contours, reload } = useProject();
  const [planId, setPlanId] = useState(plans[0]?.id || null);
  const [nodeId, setNodeId] = useState(null);
  const [draft, setDraft] = useState([]);
  const [closed, setClosed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const canvas = useRef(null);
  const plan = plans.find((item) => item.id === planId) || plans[0] || null;

  useEffect(() => {
    if (!planId && plans[0]) setPlanId(plans[0].id);
  }, [plans, planId]);

  const existing = useMemo(() => new Map(contours.filter((item) => item.planId === plan?.id).map((item) => [item.nodeId, item.points])), [contours, plan?.id]);
  useEffect(() => {
    const points = nodeId ? existing.get(nodeId) : null;
    setDraft(points ? points.map((p) => [...p]) : []);
    setClosed(Boolean(points));
  }, [nodeId, existing]);

  // In tree order; apartments (units with a floor) live on the chessboard, not on the plan.
  const candidates = useMemo(() => {
    const out = [];
    const walk = (parentId) => {
      for (const node of tree.kids(parentId)) {
        if (node.kind === 'unit' && node.unit?.floor !== null && node.unit?.floor !== undefined) continue;
        if (!query || nodeLabel(node).toLowerCase().includes(query.toLowerCase())) out.push(node);
        walk(node.id);
      }
    };
    walk(0);
    return out;
  }, [tree, query]);

  const upload = async (file) => {
    setUploading(true);
    try {
      const size = await imageSize(file);
      const media = await uploadMedia({ file }, { projectId: project.id, kind: 'plan' });
      const res = await mpApi.createPlan(project.id, { mediaId: media.id, width: size.width, height: size.height, name: file.name.replace(/\.[^.]+$/, '') });
      await reload();
      setPlanId(res.data.plan.id);
      message.success(t('mp.plans.uploaded'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
    return false;
  };

  const save = async (points) => {
    try {
      await mpApi.saveContours(plan.id, [{ nodeId, points }]);
      await reload();
      message.success(points ? t('mp.plans.saved') : t('mp.plans.removed'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const shapes = useMemo(
    () =>
      [...existing]
        .filter(([id]) => id !== nodeId && tree.byId.has(id))
        .map(([id, points]) => {
          const node = tree.byId.get(id);
          return { id, points, level: node.kind === 'level', fill: node.kind === 'level' ? 'rgba(148,163,184,.12)' : nodeFill(node, 'sales', { settings, tree }), stroke: 'rgba(15,23,42,.5)', label: node.code || node.name };
        }),
    [existing, nodeId, tree, settings]
  );

  return (
    <div className="mp-plans">
      <div className="mod-toolbar">
        {plans.length > 0 && (
          <Select value={plan?.id} onChange={setPlanId} options={plans.map((item) => ({ value: item.id, label: `${item.name || t('mp.plans.plan')}${item.nodeId ? ` · ${nodeLabel(tree.byId.get(item.nodeId))}` : ''}` }))} style={{ minWidth: 220 }} />
        )}
        <Upload accept=".png,.jpg,.jpeg,.webp,.svg" showUploadList={false} beforeUpload={upload}>
          <Button loading={uploading}>{plans.length ? t('mp.plans.addPlan') : t('mp.plans.upload')}</Button>
        </Upload>
        <span className="mod-toolbar__grow" />
        {plan && (
          <Popconfirm title={t('mp.plans.deleteConfirm')} onConfirm={async () => { await mpApi.deletePlan(plan.id); setPlanId(null); reload(); }} okText={t('common.delete')} okButtonProps={{ danger: true }} cancelText={t('common.cancel')}>
            <Button danger>{t('mp.plans.delete')}</Button>
          </Popconfirm>
        )}
      </div>
      {!plan ? (
        <AntEmpty description={t('mp.plans.none')} />
      ) : (
        <div className="mp-plans__body">
          <aside className="mp-plans__list">
            <Input.Search allowClear placeholder={t('mp.filter.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
            <ul>
              {candidates.map((node) => (
                <li key={node.id}>
                  <button type="button" className={`${node.id === nodeId ? 'is-active' : ''}${existing.has(node.id) ? ' has-contour' : ''}`} onClick={() => setNodeId(node.id)} style={{ paddingLeft: 8 + (node.depth - 1) * 12 }}>
                    <span className="mp-plans__mark" aria-hidden="true">{existing.has(node.id) ? '◆' : '◇'}</span>
                    {nodeLabel(node)}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="mp-plans__canvas">
            <div className="mp-plans__bar">
              {nodeId ? (
                <>
                  <b>{nodeLabel(tree.byId.get(nodeId))}</b>
                  <span className="mp-muted">{closed ? t('mp.plans.hintClosed') : t('mp.plans.hintDraw', { n: draft.length })}</span>
                  <span className="mod-toolbar__grow" />
                  <Space wrap>
                    {!closed && draft.length >= 3 && <Button onClick={() => setClosed(true)}>{t('mp.plans.close')}</Button>}
                    <Button onClick={() => { setDraft([]); setClosed(false); }}>{t('mp.plans.restart')}</Button>
                    {existing.has(nodeId) && <Button danger onClick={() => save(null)}>{t('mp.plans.remove')}</Button>}
                    <Tooltip title={draft.length < 3 ? t('mp.plans.need3') : ''}>
                      <Button type="primary" disabled={draft.length < 3} onClick={() => save(draft)}>{t('common.save')}</Button>
                    </Tooltip>
                  </Space>
                </>
              ) : (
                <span className="mp-muted">{t('mp.plans.pick')}</span>
              )}
            </div>
            <PlanCanvas
              ref={canvas}
              width={plan.width}
              height={plan.height}
              background={plan.url}
              shapes={shapes}
              onShapeClick={(id) => !nodeId && setNodeId(id)}
              edit={nodeId ? { points: draft, closed, onAdd: (pt) => setDraft((prev) => [...prev, pt.map((v) => Math.round(v * 10) / 10)]), onMove: (index, pt) => setDraft((prev) => prev.map((p, i) => (i === index ? pt : p))), onRemove: (index) => setDraft((prev) => prev.filter((_, i) => i !== index)) } : null}
              ariaLabel={t('mp.plans.editor')}
            >
              <div className="mp-zoom">
                <button type="button" onClick={() => canvas.current?.zoom(1.4)} aria-label={t('mp.plan.zoomIn')}>＋</button>
                <button type="button" onClick={() => canvas.current?.zoom(1 / 1.4)} aria-label={t('mp.plan.zoomOut')}>－</button>
                <button type="button" onClick={() => canvas.current?.fit()} aria-label={t('mp.plan.fit')}>⤢</button>
              </div>
            </PlanCanvas>
          </div>
        </div>
      )}
    </div>
  );
}
