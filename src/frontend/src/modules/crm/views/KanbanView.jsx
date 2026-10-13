import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { crmApi } from '../api';
import { errorCode, lostStage, wonStage } from '../lib';
import Kanban from '../components/Kanban';
import LostDialog from '../components/LostDialog';
import { Empty } from '../components/bits';

const PAGE = 30;

function withSum(stage, deal, sign) {
  const sum = { ...(stage.sum || {}) };
  const amount = Number(deal.amount) || 0;
  if (amount) sum[deal.currency] = (Number(sum[deal.currency]) || 0) + sign * amount;
  return { ...stage, sum, count: Math.max(0, (stage.count || 0) + sign) };
}

/** Which closed columns the stage group shows next to the open ones. */
function visibleStages(stages, group) {
  return stages.filter((stage) => {
    if (stage.kind === 'open') return group === 'open' || group === 'all' || !group;
    if (stage.kind === 'won') return group === 'won' || group === 'all' || group === 'closed';
    return group === 'lost' || group === 'all' || group === 'closed';
  });
}

/** Kanban of the pipeline: optimistic moves with rollback, lazy columns. */
export default function KanbanView({ pipeline, params, filter, version, onOpen, onChanged, onCreate }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [lost, setLost] = useState(null);
  const key = JSON.stringify(params);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await crmApi.board({ ...JSON.parse(key), limit: PAGE });
      if (mine === seq.current) {
        setBoard(res.data);
        setError(null);
      }
    } catch (err) {
      if (mine === seq.current) setError(err);
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load, version]);

  const stages = useMemo(() => board?.stages || [], [board]);
  const shown = useMemo(() => visibleStages(stages, filter.group), [stages, filter.group]);

  /** Applies a change to the board and returns the previous board for rollback. */
  const mutate = (fn) => {
    let previous;
    setBoard((prev) => {
      previous = prev;
      return fn(prev);
    });
    return () => setBoard(previous);
  };

  const replaceDeal = (deal) =>
    setBoard((prev) => prev && { ...prev, stages: prev.stages.map((stage) => ({ ...stage, deals: (stage.deals || []).map((item) => (item.id === deal.id ? { ...item, ...deal } : item)) })) });

  const moveLocal = (deal, stageId, { beforeId } = {}) =>
    mutate((prev) => ({
      ...prev,
      stages: prev.stages.map((stage) => {
        let next = stage;
        if (stage.id === deal.stageId) next = { ...withSum(next, deal, -1), deals: (next.deals || []).filter((item) => item.id !== deal.id) };
        if (stage.id === stageId) {
          const deals = (next.deals || []).filter((item) => item.id !== deal.id);
          const index = beforeId ? deals.findIndex((item) => item.id === beforeId) + 1 : 0;
          const showsDeals = stage.kind === 'open' || visibleStages([stage], filter.group).length > 0;
          if (showsDeals) deals.splice(index, 0, { ...deal, stageId });
          next = { ...withSum(next, deal, 1), deals };
        }
        return next;
      }),
    }));

  const persistMove = async (deal, stageId, place = {}, lostReason) => {
    if (deal.stageId === stageId && !place.beforeId && !place.afterId) return;
    const rollback = moveLocal(deal, stageId, place);
    try {
      const res = await crmApi.moveDeal(deal.id, { stageId, ...place, ...(lostReason !== undefined ? { lostReason } : {}) });
      replaceDeal(res.data.deal);
      onChanged?.();
      return res.data.deal;
    } catch (err) {
      rollback();
      if (errorCode(err) === 'LOST_REASON_REQUIRED') setLost({ deal, stageId });
      else message.error(errorMessage(err));
      return null;
    }
  };

  const onMove = (deal, stageId, place) => {
    const target = stages.find((stage) => stage.id === stageId);
    if (target?.kind === 'lost' && deal.stageId !== stageId) {
      setLost({ deal, stageId, place });
      setBoard((prev) => ({ ...prev, stages: [...prev.stages] }));
      return;
    }
    persistMove(deal, stageId, place).then((moved) => moved && target?.kind === 'won' && deal.stageId !== stageId && message.success(t('crm.stage.wonToast', { title: deal.title })));
  };

  const undo = (deal) => persistMove({ ...deal, stageId: deal.stageIdNow }, deal.stageId);

  const onClose = async (deal, kind) => {
    const stage = kind === 'won' ? wonStage(pipeline) : lostStage(pipeline);
    if (!stage) return;
    if (kind === 'lost') {
      setLost({ deal, stageId: stage.id });
      return;
    }
    const moved = await persistMove(deal, stage.id);
    if (moved) {
      message.success({
        content: (
          <span className="crm-toast">
            🎉 {t('crm.stage.wonToast', { title: deal.title })}
            <button type="button" onClick={() => undo({ ...deal, stageIdNow: stage.id })}>{t('crm.undo')}</button>
          </span>
        ),
        duration: 6,
      });
    }
  };

  const confirmLost = async (reason) => {
    const { deal, stageId, place } = lost;
    setLost(null);
    const moved = await persistMove(deal, stageId, place || {}, reason);
    if (moved) {
      message.info({
        content: (
          <span className="crm-toast">
            {t('crm.stage.lostToast', { title: deal.title })}
            <button type="button" onClick={() => undo({ ...deal, stageIdNow: stageId })}>{t('crm.undo')}</button>
          </span>
        ),
        duration: 6,
      });
    }
  };

  const onLoadMore = async (stage) => {
    try {
      const res = await crmApi.boardStage(stage.id, { ...params, offset: (stage.deals || []).length, limit: PAGE });
      setBoard((prev) => ({
        ...prev,
        stages: prev.stages.map((item) => {
          if (item.id !== stage.id) return item;
          const seen = new Set((item.deals || []).map((deal) => deal.id));
          return { ...item, deals: [...(item.deals || []), ...res.data.deals.filter((deal) => !seen.has(deal.id))], hasMore: res.data.hasMore };
        }),
      }));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const onCreated = (deal) => {
    setBoard((prev) => ({ ...prev, stages: prev.stages.map((stage) => (stage.id === deal.stageId ? { ...withSum(stage, deal, 1), deals: [deal, ...(stage.deals || [])] } : stage)) }));
    onChanged?.();
  };

  const onActivity = async (deal) => {
    try {
      const res = await crmApi.deal(deal.id);
      replaceDeal(res.data.deal);
    } catch {
      /* the board reloads on the next change */
    }
    onChanged?.();
  };

  if (error && !board) {
    return <Empty icon="flag" title={t('crm.loadError')} text={errorMessage(error)} action={<Button onClick={load}>{t('common.retry')}</Button>} />;
  }
  if (!board) {
    return (
      <div className="crm-board is-loading" aria-busy="true">
        {[0, 1, 2, 3, 4].map((n) => (
          <div key={n} className="crm-col is-skeleton">
            <div className="crm-plate-skel" />
            <Skeleton active title={false} paragraph={{ rows: 2 }} />
            <div className="crm-card-skel" />
            <div className="crm-card-skel" />
          </div>
        ))}
      </div>
    );
  }

  const total = shown.reduce((acc, stage) => acc + (stage.count || 0), 0);

  return (
    <>
      {total === 0 && !filter.q && filter.group === 'open' && !filter.activity && (
        <div className="crm-board-hint">
          <span>{t('crm.board.emptyHint')}</span>
          <Button type="link" onClick={onCreate}>{t('crm.create.full')} →</Button>
        </div>
      )}
      <Kanban
        pipeline={pipeline}
        stages={shown}
        onOpen={onOpen}
        onActivity={onActivity}
        onMove={onMove}
        onClose={onClose}
        onLoadMore={onLoadMore}
        onCreated={onCreated}
        canCreate={filter.group === 'open' || filter.group === 'all' || !filter.group}
      />
      <LostDialog open={lost} onOk={confirmLost} onCancel={() => setLost(null)} />
    </>
  );
}
