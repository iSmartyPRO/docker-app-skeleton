import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mpApi } from '../api';

/*
 * Placements of objects on one plan for the editors (contours and point
 * markers), with optimistic changes and an undo stack.
 *
 * placement: { kind: 'contour', points } | { kind: 'marker', x, y, r, label }
 *
 * apply([{ nodeId, next }], label) sends the changes at once (a marker
 * replaces a contour on the server and vice versa), shows them right away,
 * and remembers what was there for undo(). The map is reloaded once no request
 * is in flight, so 70 quick placements do not refetch 70 times; the reload
 * clears only the changes made before it started, and the project context
 * keeps only the newest map (MpContext load), so a late answer never
 * un-places a point.
 */
export default function usePlacements({ plan, contours, markers, reload, onError }) {
  // nodeId → { value: placement | null, stamp }: the stamp orders changes against reloads.
  const [overrides, setOverrides] = useState(() => new Map());
  const [undoStack, setUndoStack] = useState([]);
  const inflight = useRef(0);
  const stamp = useRef(0);
  const planId = plan?.id || null;

  // A different plan: nothing pending applies to it.
  useEffect(() => {
    setOverrides(new Map());
    setUndoStack([]);
  }, [planId]);

  const placements = useMemo(() => {
    const map = new Map();
    for (const item of contours) if (item.planId === planId) map.set(item.nodeId, { kind: 'contour', points: item.points });
    for (const item of markers) if (item.planId === planId) map.set(item.nodeId, { kind: 'marker', x: item.x, y: item.y, r: item.r, label: item.label || null });
    for (const [nodeId, { value }] of overrides) {
      if (value) map.set(nodeId, value);
      else map.delete(nodeId);
    }
    return map;
  }, [contours, markers, overrides, planId]);

  const placementsRef = useRef(placements);
  placementsRef.current = placements;

  const send = useCallback(
    async (changes) => {
      const markerItems = [];
      const contourItems = [];
      for (const { nodeId, next, prev } of changes) {
        if (next?.kind === 'marker') markerItems.push({ nodeId, x: next.x, y: next.y, r: next.r, label: next.label || null });
        else if (next?.kind === 'contour') contourItems.push({ nodeId, points: next.points });
        else if (prev?.kind === 'marker') markerItems.push({ nodeId, remove: true });
        else if (prev?.kind === 'contour') contourItems.push({ nodeId, points: null });
      }
      if (markerItems.length) await mpApi.saveMarkers(planId, markerItems);
      if (contourItems.length) await mpApi.saveContours(planId, contourItems);
    },
    [planId]
  );

  /**
   * Once nothing is in flight: reload the map, then drop the optimistic
   * changes it already holds — only those made before the reload started (a
   * change made meanwhile stays shown until the next reload brings it).
   */
  const settle = useCallback(async () => {
    if (inflight.current > 0) return;
    const upto = stamp.current;
    try {
      await reload();
    } finally {
      setOverrides((prev) => {
        if (![...prev.values()].some((entry) => entry.stamp <= upto)) return prev;
        return new Map([...prev].filter(([, entry]) => entry.stamp > upto));
      });
    }
  }, [reload]);

  /** Applies changes [{ nodeId, next: placement | null }]; `label` describes it for the undo button; record=false for an undo itself. */
  const apply = useCallback(
    async (list, label = '', record = true) => {
      if (!planId || !list.length) return false;
      const changes = list.map(({ nodeId, next }) => ({ nodeId, next: next || null, prev: placementsRef.current.get(nodeId) || null }));
      const mine = ++stamp.current;
      setOverrides((prev) => {
        const map = new Map(prev);
        for (const change of changes) map.set(change.nodeId, { value: change.next, stamp: mine });
        return map;
      });
      // The undo entry carries its own id: a failed save removes exactly it, not whatever is newest by then.
      if (record) setUndoStack((prev) => [...prev.slice(-49), { id: mine, label, changes: changes.map(({ nodeId, prev: before }) => ({ nodeId, next: before })) }]);
      inflight.current += 1;
      let ok = true;
      try {
        await send(changes);
      } catch (err) {
        ok = false;
        onError?.(err);
        // Back to what the server has (unless a later change of the same object took over).
        setOverrides((prev) => {
          const map = new Map(prev);
          for (const change of changes) if (map.get(change.nodeId)?.stamp === mine) map.delete(change.nodeId);
          return map;
        });
        if (record) setUndoStack((prev) => prev.filter((entry) => entry.id !== mine));
      } finally {
        inflight.current -= 1;
      }
      settle();
      return ok;
    },
    [planId, send, settle, onError]
  );

  const undo = useCallback(async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return null;
    setUndoStack((prev) => prev.filter((entry) => entry.id !== last.id));
    await apply(last.changes, '', false);
    return last;
  }, [undoStack, apply]);

  return { placements, apply, undo, lastAction: undoStack[undoStack.length - 1] || null };
}
