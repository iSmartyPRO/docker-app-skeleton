import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty as AntEmpty, Input, Popconfirm, Select, Space, Switch, Tooltip, Upload } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { mpApi } from '../api';
import { useMp, useProject } from '../MpContext';
import { nodeLabel, readStore, shortLabel, userKey, writeStore } from '../lib';
import { imageSize, uploadMedia } from '../media/photos';
import PlanCanvas from '../plan/PlanCanvas';
import { markerLook, nodeFill } from '../plan/colors';
import { contourAround } from '../plan/labels';
import { MARKER_SIZES, clampRadius, contourFromMarker, markerFromContour, nextUnplaced, nudgeStep, presetRadius, sizeOf, snapPoint } from '../plan/markers';
import MarkerPicker from './MarkerPicker';
import usePlacements from './usePlacements';
import '../mp-markers.css';

/**
 * Site plans and the placement of objects on them (spec §9.1, administrators).
 *
 * Contours: pick an object, click points over the drawing, close the polygon,
 * drag points to adjust, save; double-click a point to remove it.
 *
 * Points (docs/masterplan.md "Point markers"): pick an object from the list
 * of objects not placed yet and click the plan — a numbered circle appears
 * and the next unplaced object is chosen, so a street of houses is placed
 * click by click. Drag a point to move it (it snaps to the line of its
 * neighbours), its handle to resize it, arrows nudge it; S / M / L, a label,
 * «В контур» and «Убрать» act on the chosen point. Ctrl+Z undoes the last
 * action (contours too).
 */

const isField = (el) => Boolean(el?.closest?.('input, textarea, select, [contenteditable="true"], .ant-select'));
const round1 = (value) => Math.round(value * 10) / 10;

export default function PlansEditor() {
  const { t } = useLocale();
  const { user } = useAuth();
  const { message } = App.useApp();
  const { settings } = useMp();
  const { project, tree, plans, contours, markers, reload } = useProject();
  const [planId, setPlanId] = useState(plans[0]?.id || null);
  const [tool, setToolState] = useState(() => (readStore(userKey(user, 'placeTool'), 'contour') === 'point' ? 'point' : 'contour'));
  const [nodeId, setNodeId] = useState(null);
  const [draft, setDraft] = useState([]);
  const [closed, setClosed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const canvas = useRef(null);
  const plan = plans.find((item) => item.id === planId) || plans[0] || null;

  // Point tool state.
  const [armedId, setArmedId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [size, setSizeState] = useState(() => (MARKER_SIZES.includes(readStore(userKey(user, 'markerSize'), 'M')) ? readStore(userKey(user, 'markerSize'), 'M') : 'M'));
  const [chain, setChainState] = useState(() => readStore(userKey(user, 'markerChain'), true) !== false);
  const [snap, setSnapState] = useState(() => readStore(userKey(user, 'markerSnap'), true) !== false);
  const [filters, setFilters] = useState({ q: '', sector: null, type: null, showPlaced: false });
  const [drag, setDrag] = useState(null); // { id, x, y, r, guideX, guideY } while a point is dragged / resized / nudged
  const [labelDraft, setLabelDraft] = useState('');
  const nudge = useRef(null);

  const remember = (name, setter) => (value) => {
    setter(value);
    writeStore(userKey(user, name), value);
  };
  const setTool = remember('placeTool', setToolState);
  const setSize = remember('markerSize', setSizeState);
  const setChain = remember('markerChain', setChainState);
  const setSnap = remember('markerSnap', setSnapState);

  useEffect(() => {
    if (!planId && plans[0]) setPlanId(plans[0].id);
  }, [plans, planId]);

  const onError = useCallback((err) => message.error(errorMessage(err)), [message]);
  const { placements, apply, undo, lastAction } = usePlacements({ plan, contours, markers, reload, onError });

  const existing = useMemo(() => new Map([...placements].filter(([, value]) => value.kind === 'contour').map(([id, value]) => [id, value.points])), [placements]);
  const contourOf = nodeId ? existing.get(nodeId) : null;
  // A contour seeded from a point («В контур») waits for the node switch.
  const seed = useRef(null);
  // The draft follows the saved contour of the chosen object, but a reload (someone placing points, the
  // stream) never throws away unsaved edits: it is replaced only for another object or plan, or when clean.
  const draftOf = useRef({ nodeId: null, planId: null, dirty: false });
  const editDraft = (update) => {
    draftOf.current.dirty = true;
    setDraft(update);
  };
  useEffect(() => {
    const switched = draftOf.current.nodeId !== nodeId || draftOf.current.planId !== (plan?.id || null);
    if (seed.current?.nodeId === nodeId) {
      setDraft(seed.current.points);
      setClosed(true);
      seed.current = null;
      draftOf.current = { nodeId, planId: plan?.id || null, dirty: true };
      return;
    }
    if (!switched && draftOf.current.dirty) return;
    setDraft(contourOf ? contourOf.map((p) => [...p]) : []);
    setClosed(Boolean(contourOf));
    draftOf.current = { nodeId, planId: plan?.id || null, dirty: false };
  }, [nodeId, contourOf, plan?.id]);

  // In tree order; apartments (units with a floor) live on the chessboard, not on the plan.
  const allCandidates = useMemo(() => {
    const out = [];
    const walk = (parentId) => {
      for (const node of tree.kids(parentId)) {
        if (node.kind === 'unit' && node.unit?.floor !== null && node.unit?.floor !== undefined) continue;
        out.push(node);
        walk(node.id);
      }
    };
    walk(0);
    return out;
  }, [tree]);
  const candidates = useMemo(() => allCandidates.filter((node) => !query || nodeLabel(node).toLowerCase().includes(query.toLowerCase())), [allCandidates, query]);
  // Points are for objects, plots and units; sectors and other levels are areas (contours).
  const pointables = useMemo(() => allCandidates.filter((node) => node.kind !== 'level'), [allCandidates]);
  const sectors = useMemo(() => allCandidates.filter((node) => node.kind === 'level'), [allCandidates]);
  const typeOptions = useMemo(() => {
    const seen = new Map();
    for (const node of pointables) if (node.type?.id && !seen.has(node.type.id)) seen.set(node.type.id, node.type);
    return [...seen.values()];
  }, [pointables]);
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return pointables.filter(
      (node) =>
        (!filters.sector || node.path?.includes(filters.sector)) &&
        (!filters.type || node.type?.id === filters.type) &&
        (!q || nodeLabel(node).toLowerCase().includes(q) || String(node.attrs?.oldNumber || '').toLowerCase() === q)
    );
  }, [pointables, filters]);
  const pickList = useMemo(() => (filters.showPlaced ? filtered : filtered.filter((node) => !placements.has(node.id))), [filtered, filters.showPlaced, placements]);

  const placedCount = pointables.filter((node) => placements.has(node.id)).length;
  const pointCount = pointables.filter((node) => placements.get(node.id)?.kind === 'marker').length;
  const colorOf = useCallback((node) => nodeFill(node, 'sales', { settings, tree }), [settings, tree]);

  // ── Actions ──
  const nameOf = (id) => shortLabel(tree.byId.get(id));
  const placementsRef = useRef(placements);
  placementsRef.current = placements;

  /**
   * Arrow-key nudges of a point are shown at once and saved after a pause.
   * A pending nudge is saved right away when another point is nudged or
   * chosen, the tool changes or the point turns into a contour; dropped when
   * the point is removed or the plan changes. It reads the placements at save
   * time, so a point removed meanwhile is never saved back.
   */
  const commitNudge = () => {
    const pending = nudge.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    nudge.current = null;
    setDrag((prev) => (prev?.id === pending.id ? null : prev));
    const current = placementsRef.current.get(pending.id);
    if (current?.kind !== 'marker' || pending.planId !== (plan?.id || null)) return;
    apply([{ nodeId: pending.id, next: { ...current, x: pending.x, y: pending.y } }], t('mp.mk.undoMove', { name: nameOf(pending.id) }));
  };
  const commitNudgeRef = useRef(commitNudge);
  commitNudgeRef.current = commitNudge;
  const dropNudge = (id) => {
    if (!nudge.current || (id && nudge.current.id !== id)) return;
    clearTimeout(nudge.current.timer);
    nudge.current = null;
    setDrag(null);
  };
  const placeAt = async ([x, y]) => {
    if (!armedId || !plan) return;
    if (x < 0 || y < 0 || x > plan.width || y > plan.height) return;
    const id = armedId;
    const prev = placements.get(id);
    const next = { kind: 'marker', x: round1(x), y: round1(y), r: presetRadius(plan, size), label: prev?.kind === 'marker' ? prev.label : null };
    const following = chain ? nextUnplaced(filtered, new Set([...placements.keys(), id]), id) : null;
    setArmedId(following?.id || null);
    setSelectedId(chain ? null : id);
    await apply([{ nodeId: id, next }], t('mp.mk.undoPlace', { name: nameOf(id) }));
  };

  const updateMarker = (id, patch, label) => {
    const current = placements.get(id);
    if (current?.kind !== 'marker') return;
    // A nudge still waiting to be saved goes with this change.
    const pending = nudge.current?.id === id ? { x: nudge.current.x, y: nudge.current.y } : null;
    if (pending) dropNudge(id);
    apply([{ nodeId: id, next: { ...current, ...pending, ...patch } }], label);
  };

  const removeMarker = (id) => {
    if (placements.get(id)?.kind !== 'marker') return;
    dropNudge(id);
    setSelectedId(null);
    apply([{ nodeId: id, next: null }], t('mp.mk.undoRemove', { name: nameOf(id) }));
  };

  const toPoint = (id) => {
    const current = placements.get(id);
    // Sectors and other levels are areas: the server refuses them as points.
    if (current?.kind !== 'contour' || !plan || tree.byId.get(id)?.kind === 'level') return;
    apply([{ nodeId: id, next: { kind: 'marker', ...markerFromContour(current.points, plan), label: null } }], t('mp.mk.undoToPoint', { name: nameOf(id) }));
    setTool('point');
    setSelectedId(id);
    setArmedId(null);
  };

  /** Point → contour: a square around the point to adjust in the contour editor; saving the contour replaces the point. */
  const toContour = (id) => {
    const pending = nudge.current?.id === id ? { x: nudge.current.x, y: nudge.current.y } : null;
    commitNudge();
    const current = placements.get(id) && { ...placements.get(id), ...pending };
    if (current?.kind !== 'marker') return;
    setTool('contour');
    setSelectedId(null);
    if (nodeId === id) {
      editDraft(contourFromMarker(current));
      setClosed(true);
    } else {
      seed.current = { nodeId: id, points: contourFromMarker(current) };
      setNodeId(id);
    }
  };

  const doUndo = useCallback(async () => {
    const done = await undo();
    if (done) message.info(t('mp.mk.undone', { what: done.label || '' }));
  }, [undo, message, t]);

  const saveContour = async (points) => {
    const ok = await apply([{ nodeId, next: points ? { kind: 'contour', points } : null }], t(points ? 'mp.mk.undoContour' : 'mp.mk.undoContourRemove', { name: nameOf(nodeId) }));
    if (ok && draftOf.current.nodeId === nodeId) draftOf.current.dirty = false;
    if (ok) message.success(points ? t('mp.plans.saved') : t('mp.plans.removed'));
  };

  // Drag / resize of a point: live on the canvas, saved on release.
  const markerEdit = useMemo(() => {
    if (tool !== 'point') return null;
    return {
      selectedId,
      armed: Boolean(armedId),
      resizable: true,
      guides: drag && (drag.guideX !== null || drag.guideY !== null) ? { x: drag.guideX, y: drag.guideY } : null,
      onPlace: placeAt,
      onSelect: (id) => {
        setSelectedId(id);
        if (id) setArmedId(null);
      },
      onMove: (id, pt, done) => {
        const current = placements.get(id);
        if (current?.kind !== 'marker' || !plan) return;
        const k = canvas.current?.scale?.() || 1;
        const others = snap ? [...placements].filter(([other, value]) => other !== id && value.kind === 'marker').map(([, value]) => value) : [];
        const at = snapPoint([Math.max(0, Math.min(plan.width, pt[0])), Math.max(0, Math.min(plan.height, pt[1]))], others, 6 / k);
        if (!done) {
          setSelectedId(id);
          setArmedId(null);
          setDrag({ id, x: at.x, y: at.y, r: current.r, guideX: at.guideX, guideY: at.guideY });
          return;
        }
        setDrag(null);
        updateMarker(id, { x: at.x, y: at.y }, t('mp.mk.undoMove', { name: nameOf(id) }));
      },
      onResize: (id, r, done) => {
        const current = placements.get(id);
        if (current?.kind !== 'marker' || !plan) return;
        const next = clampRadius(plan, r);
        if (!done) {
          setDrag({ id, x: current.x, y: current.y, r: next, guideX: null, guideY: null });
          return;
        }
        setDrag(null);
        updateMarker(id, { r: next }, t('mp.mk.undoResize', { name: nameOf(id) }));
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedId, armedId, drag, placements, plan, snap, size, chain, filtered]);

  // Keyboard: Ctrl+Z, Esc, Delete, arrows (nudge the chosen point; else choose the next object to place).
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === 'z' || event.key === 'я' || event.code === 'KeyZ')) {
        if (isField(event.target)) return;
        event.preventDefault();
        doUndo();
        return;
      }
      if (tool !== 'point' || isField(event.target) || event.target?.closest?.('.ant-modal, .ant-popover')) return;
      if (event.key === 'Escape') {
        setArmedId(null);
        setSelectedId(null);
        return;
      }
      const chosen = selectedId ? placements.get(selectedId) : null;
      if ((event.key === 'Delete' || event.key === 'Backspace') && chosen?.kind === 'marker') {
        event.preventDefault();
        removeMarker(selectedId);
        return;
      }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[event.key] && chosen?.kind === 'marker' && !event.target?.closest?.('.mp-mkx__list')) {
        event.preventDefault();
        // Another point's nudge still waiting: save it first, it is not lost.
        if (nudge.current && nudge.current.id !== selectedId) commitNudge();
        const step = nudgeStep(event.shiftKey ? 10 : 1, canvas.current?.scale?.() || 1);
        const base = nudge.current?.id === selectedId ? nudge.current : { id: selectedId, x: chosen.x, y: chosen.y };
        const [dx, dy] = arrows[event.key];
        const x = Math.max(0, Math.min(plan.width, round1(base.x + dx * step)));
        const y = Math.max(0, Math.min(plan.height, round1(base.y + dy * step)));
        clearTimeout(nudge.current?.timer);
        const id = selectedId;
        nudge.current = { id, x, y, planId: plan?.id || null, timer: setTimeout(() => commitNudgeRef.current(), 450) };
        setDrag({ id, x, y, r: chosen.r, guideX: null, guideY: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedId, placements, plan, doUndo]);

  // Choosing another point (or none) saves a pending nudge; leaving the editor too.
  useEffect(() => {
    if (nudge.current && nudge.current.id !== selectedId) commitNudgeRef.current();
  }, [selectedId]);
  // Leaving the editor saves a pending nudge; on another plan (the old one deleted) it is dropped (commitNudge checks the plan).
  useEffect(() => () => commitNudgeRef.current(), [plan?.id]);

  const chosen = selectedId ? placements.get(selectedId) : null;
  useEffect(() => {
    setLabelDraft(chosen?.kind === 'marker' ? chosen.label || '' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, chosen?.kind === 'marker' ? chosen.label : null]);

  const upload = async (file) => {
    setUploading(true);
    try {
      const dims = await imageSize(file);
      const media = await uploadMedia({ file }, { projectId: project.id, kind: 'plan' });
      const res = await mpApi.createPlan(project.id, { mediaId: media.id, width: dims.width, height: dims.height, name: file.name.replace(/\.[^.]+$/, '') });
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

  // Contours of the objects inside the chosen node: a sector's contour can be drawn around them in one click.
  const childContours = useMemo(() => {
    if (!nodeId) return [];
    return [...existing].filter(([id]) => id !== nodeId && tree.byId.get(id)?.path?.includes(nodeId)).map(([, points]) => points);
  }, [existing, nodeId, tree]);

  const shapes = useMemo(
    () =>
      [...existing]
        .filter(([id]) => (tool === 'point' || id !== nodeId) && tree.byId.has(id))
        .map(([id, points]) => {
          const node = tree.byId.get(id);
          return { id, points, level: node.kind === 'level', fill: node.kind === 'level' ? 'rgba(148,163,184,.12)' : nodeFill(node, 'sales', { settings, tree }), stroke: 'rgba(15,23,42,.5)', label: node.code || node.name, selected: tool === 'point' && id === selectedId };
        }),
    [existing, nodeId, tree, settings, tool, selectedId]
  );

  const markerShapes = useMemo(
    () =>
      [...placements]
        .filter(([id, value]) => value.kind === 'marker' && tree.byId.has(id) && !(tool === 'contour' && id === nodeId))
        .map(([id, value]) => {
          const node = tree.byId.get(id);
          const live = drag?.id === id ? drag : value;
          return { ...markerLook(node, 'sales', { settings, tree }), id, x: live.x, y: live.y, r: live.r, label: value.label || shortLabel(node), title: nodeLabel(node), selected: tool === 'contour' && id === nodeId, dim: tool === 'contour' && Boolean(nodeId) };
        }),
    [placements, tree, settings, drag, tool, nodeId]
  );

  const armed = armedId ? tree.byId.get(armedId) : null;
  const chosenNode = selectedId ? tree.byId.get(selectedId) : null;
  const total = pointables.length;
  const pct = total ? Math.round((placedCount / total) * 100) : 0;

  const progress = (
    <div className="mp-mkx__progress" aria-live="polite">
      <span>
        {t('mp.mk.placed', { n: placedCount, total })}
        {pointCount > 0 && <span className="mp-muted"> · {t('mp.mk.breakdown', { c: placedCount - pointCount, p: pointCount })}</span>}
      </span>
      <div className="mp-mkx__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );

  const pointBar = () => {
    if (chosen?.kind === 'marker' && chosenNode) {
      const current = drag?.id === selectedId ? { ...chosen, ...drag } : chosen;
      return (
        <>
          <span className="mp-mkx__hint"><span className="mp-mkx__dot" style={{ background: colorOf(chosenNode) }}>{chosen.label || shortLabel(chosenNode)}</span>{nodeLabel(chosenNode)}</span>
          <Tooltip title={t('mp.mk.sizeHint')}>
            <Segmented size="small" value={sizeOf(plan, current.r) || ''} onChange={(value) => updateMarker(selectedId, { r: presetRadius(plan, value) }, t('mp.mk.undoResize', { name: nameOf(selectedId) }))} options={MARKER_SIZES.map((key) => ({ value: key, label: key }))} aria-label={t('mp.mk.size')} />
          </Tooltip>
          <Input
            size="small"
            style={{ width: 120 }}
            maxLength={12}
            placeholder={shortLabel(chosenNode)}
            value={labelDraft}
            onChange={(event) => setLabelDraft(event.target.value)}
            onPressEnter={(event) => event.currentTarget.blur()}
            onBlur={() => (labelDraft.trim() || null) !== (chosen.label || null) && updateMarker(selectedId, { label: labelDraft.trim() || null }, t('mp.mk.undoLabel', { name: nameOf(selectedId) }))}
            aria-label={t('mp.mk.label')}
            title={t('mp.mk.labelHint')}
          />
          <span className="mod-toolbar__grow" />
          <Space wrap size={6}>
            <Tooltip title={t('mp.mk.toContourHint')}><Button size="small" onClick={() => toContour(selectedId)}>{t('mp.mk.toContour')}</Button></Tooltip>
            <Button size="small" danger onClick={() => removeMarker(selectedId)}>{t('mp.mk.remove')}</Button>
          </Space>
          <span className="mp-muted mp-mkx__keys">{t('mp.mk.selectedHint')}</span>
        </>
      );
    }
    if (chosen?.kind === 'contour' && chosenNode && chosenNode.kind !== 'level') {
      return (
        <>
          <b>{nodeLabel(chosenNode)}</b>
          <span className="mp-muted">{t('mp.mk.hasContour')}</span>
          <span className="mod-toolbar__grow" />
          <Tooltip title={t('mp.mk.toPointHint')}><Button size="small" type="primary" onClick={() => toPoint(selectedId)}>{t('mp.mk.toPoint')}</Button></Tooltip>
        </>
      );
    }
    if (armed) {
      const replaces = placements.get(armed.id);
      return (
        <>
          <span className="mp-mkx__hint"><span className="mp-mkx__dot" style={{ background: colorOf(armed) }}>{shortLabel(armed)}</span>{t('mp.mk.placing', { name: nodeLabel(armed) })}</span>
          <span className="mp-muted">{replaces ? t(replaces.kind === 'contour' ? 'mp.mk.replacesContour' : 'mp.mk.movesPoint') : t('mp.mk.placingHint')}</span>
          <span className="mod-toolbar__grow" />
          <Button size="small" onClick={() => setArmedId(nextUnplaced(filtered, placements, armed.id)?.id || null)}>{t('mp.mk.skip')}</Button>
          <Button size="small" onClick={() => setArmedId(null)}>{t('common.cancel')} <kbd>Esc</kbd></Button>
        </>
      );
    }
    if (total && placedCount === total) {
      return <span className="mp-mkx__done is-inline"><b>{t('mp.mk.allPlaced')}</b> <span>{t('mp.mk.allPlacedHint')}</span></span>;
    }
    return <span className="mp-muted">{t('mp.mk.pickHint')}</span>;
  };

  return (
    <div className="mp-plans">
      <div className="mod-toolbar">
        {plans.length > 0 && (
          <Select value={plan?.id} onChange={(value) => { commitNudge(); setPlanId(value); }} options={plans.map((item) => ({ value: item.id, label: `${item.name || t('mp.plans.plan')}${item.nodeId ? ` · ${nodeLabel(tree.byId.get(item.nodeId))}` : ''}` }))} style={{ minWidth: 220 }} />
        )}
        {plan && (
          <Segmented
            className="mp-plans__mode"
            value={tool}
            onChange={(value) => {
              commitNudge();
              setTool(value);
              setSelectedId(null);
              setArmedId(null);
            }}
            options={[
              { value: 'contour', label: <span title={t('mp.mk.toolContourHint')}>⬠ {t('mp.mk.toolContour')}</span> },
              { value: 'point', label: <span title={t('mp.mk.toolPointHint')}>● {t('mp.mk.toolPoint')}</span> },
            ]}
            aria-label={t('mp.mk.tool')}
          />
        )}
        <Upload accept=".png,.jpg,.jpeg,.webp,.svg" showUploadList={false} beforeUpload={upload}>
          <Button loading={uploading}>{plans.length ? t('mp.plans.addPlan') : t('mp.plans.upload')}</Button>
        </Upload>
        <span className="mod-toolbar__grow" />
        {plan && (
          <Tooltip title={lastAction ? t('mp.mk.undoHint', { what: lastAction.label }) : ''}>
            <Button disabled={!lastAction} onClick={doUndo}>↶ {t('mp.mk.undo')}</Button>
          </Tooltip>
        )}
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
          <aside className="mp-plans__list mp-mkx">
            {progress}
            {tool === 'contour' ? (
              <>
                <Input.Search allowClear placeholder={t('mp.filter.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
                <ul>
                  {candidates.map((node) => {
                    const placed = placements.get(node.id);
                    return (
                      <li key={node.id}>
                        <button type="button" className={`${node.id === nodeId ? 'is-active' : ''}${placed?.kind === 'contour' ? ' has-contour' : ''}${placed?.kind === 'marker' ? ' has-point' : ''}`} onClick={() => setNodeId(node.id)} style={{ paddingLeft: 8 + (node.depth - 1) * 12 }}>
                          <span className="mp-plans__mark" aria-hidden="true">{placed?.kind === 'contour' ? '◆' : placed?.kind === 'marker' ? '●' : '◇'}</span>
                          {nodeLabel(node)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <>
                <MarkerPicker items={pickList} armedId={armedId} onArm={(id) => { setArmedId(id); if (id) setSelectedId(null); }} filters={filters} onFilters={setFilters} sectors={sectors} types={typeOptions} placements={placements} colorOf={colorOf} />
                <div className="mp-mkx__opts">
                  <Tooltip title={t('mp.mk.sizeHint')}>
                    <span className="mp-mkx__opt">
                      <span>{t('mp.mk.size')}</span>
                      <Segmented size="small" value={size} onChange={setSize} options={MARKER_SIZES.map((key) => ({ value: key, label: key }))} aria-label={t('mp.mk.size')} />
                    </span>
                  </Tooltip>
                  <Tooltip title={t('mp.mk.chainHint')}>
                    <label className="mp-mkx__opt"><Switch size="small" checked={chain} onChange={setChain} /><span>{t('mp.mk.chain')}</span></label>
                  </Tooltip>
                  <Tooltip title={t('mp.mk.snapHint')}>
                    <label className="mp-mkx__opt"><Switch size="small" checked={snap} onChange={setSnap} /><span>{t('mp.mk.snap')}</span></label>
                  </Tooltip>
                </div>
              </>
            )}
          </aside>
          <div className="mp-plans__canvas">
            <div className="mp-plans__bar">
              {tool === 'point' ? (
                pointBar()
              ) : nodeId ? (
                <>
                  <b>{nodeLabel(tree.byId.get(nodeId))}</b>
                  <span className="mp-muted">{placements.get(nodeId)?.kind === 'marker' && !draft.length ? t('mp.mk.hasPoint') : closed ? t('mp.plans.hintClosed') : t('mp.plans.hintDraw', { n: draft.length })}</span>
                  <span className="mod-toolbar__grow" />
                  <Space wrap>
                    {!closed && draft.length >= 3 && <Button onClick={() => setClosed(true)}>{t('mp.plans.close')}</Button>}
                    {placements.get(nodeId)?.kind === 'marker' && !draft.length && (
                      <Tooltip title={t('mp.mk.toContourHint')}>
                        <Button onClick={() => toContour(nodeId)}>{t('mp.mk.drawInstead')}</Button>
                      </Tooltip>
                    )}
                    {childContours.length > 0 && (
                      <Tooltip title={t('mp.plans.aroundHint')}>
                        <Button onClick={() => { editDraft(contourAround(childContours, Math.max(plan.width, plan.height) * 0.008)); setClosed(true); }}>{t('mp.plans.around')}</Button>
                      </Tooltip>
                    )}
                    {existing.has(nodeId) && tree.byId.get(nodeId)?.kind !== 'level' && (
                      <Tooltip title={t('mp.mk.toPointHint')}>
                        <Button onClick={() => toPoint(nodeId)}>{t('mp.mk.toPoint')}</Button>
                      </Tooltip>
                    )}
                    <Button onClick={() => { editDraft([]); setClosed(false); }}>{t('mp.plans.restart')}</Button>
                    {existing.has(nodeId) && <Button danger onClick={() => saveContour(null)}>{t('mp.plans.remove')}</Button>}
                    <Tooltip title={draft.length < 3 ? t('mp.plans.need3') : placements.get(nodeId)?.kind === 'marker' ? t('mp.mk.contourReplaces') : ''}>
                      <Button type="primary" disabled={draft.length < 3} onClick={() => saveContour(draft)}>{t('common.save')}</Button>
                    </Tooltip>
                  </Space>
                </>
              ) : (
                <span className="mp-muted">{t('mp.mk.pickContour')}</span>
              )}
            </div>
            <PlanCanvas
              ref={canvas}
              width={plan.width}
              height={plan.height}
              background={plan.url}
              shapes={shapes}
              markers={markerShapes}
              markerEdit={markerEdit}
              labelMode={tool === 'point' ? 'always' : 'auto'}
              onShapeClick={(id) => {
                if (tool === 'point') {
                  // Sectors stay areas: a click inside one is a click on the plan, not a choice of the sector.
                  setSelectedId(tree.byId.get(id)?.kind === 'level' ? null : id);
                  setArmedId(null);
                } else if (!nodeId) setNodeId(id);
              }}
              edit={tool === 'contour' && nodeId ? { points: draft, closed, onAdd: (pt) => editDraft((prev) => [...prev, pt.map((v) => Math.round(v * 10) / 10)]), onMove: (index, pt) => editDraft((prev) => prev.map((p, i) => (i === index ? pt : p))), onRemove: (index) => editDraft((prev) => prev.filter((_, i) => i !== index)) } : null}
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
