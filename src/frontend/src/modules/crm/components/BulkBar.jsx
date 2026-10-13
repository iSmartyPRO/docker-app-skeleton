import { useState } from 'react';
import { createPortal } from 'react-dom';
import { App, Button, Checkbox, Popover, Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { crmApi } from '../api';
import { useCrm } from '../CrmContext';
import { openStages } from '../lib';
import { Glyph } from './bits';
import UserSelect from './UserSelect';

function ActionPop({ label, children, open, setOpen, id }) {
  return (
    <Popover open={open === id} onOpenChange={(next) => setOpen(next ? id : null)} trigger="click" placement="top" content={<div className="crm-bulk__pop">{children}</div>} destroyOnHidden>
      <Button>{label}</Button>
    </Popover>
  );
}

/**
 * Floating bar over the list while rows are selected: change the stage, the
 * owner, the pipeline, add watchers, delete. «Для всех по фильтру» applies
 * the action to every deal of the current filter (up to 1000).
 */
export default function BulkBar({ ids, total, pipeline, filterParams, onDone, onClear }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const { pipelines, pipelineById, settings } = useCrm();
  const [reason, setReason] = useState();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stageId, setStageId] = useState();
  const [ownerId, setOwnerId] = useState();
  const [watchers, setWatchers] = useState([]);
  const [target, setTarget] = useState({ pipelineId: undefined, stageId: undefined });

  if (!ids.length) return null;

  const run = async (action, value) => {
    setBusy(true);
    try {
      const payload = all ? { all: true, filter: filterParams, action, value } : { ids, action, value };
      const res = await crmApi.bulk(payload);
      message.success(t('crm.bulk.done', { n: res.data.affected ?? ids.length }));
      if (res.data.skipped?.length) message.warning(t('crm.bulk.skipped', { n: res.data.skipped.length }));
      setOpen(null);
      onDone?.();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const count = all ? total ?? t('crm.bulk.allShort') : ids.length;
  const lostChosen = (pipeline?.stages || []).find((stage) => stage.id === stageId)?.kind === 'lost';
  const targetPipeline = pipelineById(target.pipelineId);

  return createPortal(
    <div className="crm-bulk" role="toolbar" aria-label={t('crm.bulk.label')}>
      <span className="crm-bulk__count">{t('crm.bulk.selected', { n: count })}</span>
      <Checkbox checked={all} onChange={(event) => setAll(event.target.checked)}>
        {t('crm.bulk.allByFilter')}
      </Checkbox>
      <span className="crm-bulk__sep" />
      <ActionPop id="stage" open={open} setOpen={setOpen} label={t('crm.bulk.stage')}>
        <Select
          value={stageId}
          onChange={setStageId}
          placeholder={t('crm.fields.stage')}
          options={(pipeline?.stages || []).map((stage) => ({ value: stage.id, label: <span className="status-option"><span className="status-pip" style={{ '--c': stage.color }} />{stage.name}</span> }))}
          style={{ width: 240 }}
        />
        {lostChosen && (
          <Select value={reason} onChange={setReason} placeholder={t('crm.lost.reason')} options={(settings.lostReasons || []).map((item) => ({ value: item, label: item }))} style={{ width: 240 }} />
        )}
        <Button type="primary" disabled={!stageId || (lostChosen && (settings.lostReasons || []).length > 0 && !reason)} loading={busy} onClick={() => run('stage', lostChosen ? { stageId, lostReason: reason || '' } : stageId)}>{t('common.apply')}</Button>
      </ActionPop>
      <ActionPop id="owner" open={open} setOpen={setOpen} label={t('crm.bulk.owner')}>
        <UserSelect value={ownerId} onChange={setOwnerId} placeholder={t('crm.fields.owner')} style={{ width: 240 }} />
        <Button type="primary" disabled={!ownerId} loading={busy} onClick={() => run('owner', ownerId)}>{t('common.apply')}</Button>
      </ActionPop>
      {pipelines.length > 1 && (
        <ActionPop id="pipeline" open={open} setOpen={setOpen} label={t('crm.bulk.pipeline')}>
          <Select
            value={target.pipelineId}
            onChange={(pipelineId) => setTarget({ pipelineId, stageId: openStages(pipelineById(pipelineId))[0]?.id })}
            placeholder={t('crm.pipeline')}
            options={pipelines.filter((item) => item.id !== pipeline?.id).map((item) => ({ value: item.id, label: item.name }))}
            style={{ width: 240 }}
          />
          <Select value={target.stageId} onChange={(next) => setTarget((prev) => ({ ...prev, stageId: next }))} disabled={!targetPipeline} placeholder={t('crm.fields.stage')} options={openStages(targetPipeline).map((stage) => ({ value: stage.id, label: stage.name }))} style={{ width: 240 }} />
          <Button type="primary" disabled={!target.stageId} loading={busy} onClick={() => run('pipeline', target)}>{t('common.apply')}</Button>
        </ActionPop>
      )}
      <ActionPop id="watchers" open={open} setOpen={setOpen} label={t('crm.bulk.watchers')}>
        <UserSelect multiple value={watchers} onChange={setWatchers} placeholder={t('crm.fields.watchers')} style={{ width: 260 }} />
        <Button type="primary" disabled={!watchers.length} loading={busy} onClick={() => run('watchers', watchers)}>{t('crm.bulk.addWatchers')}</Button>
      </ActionPop>
      <Button
        danger
        onClick={() =>
          modal.confirm({
            title: t('crm.bulk.deleteConfirm', { n: count }),
            content: t('crm.bulk.deleteText'),
            okText: t('common.delete'),
            okButtonProps: { danger: true },
            cancelText: t('common.cancel'),
            onOk: () => run('delete', true),
          })
        }
      >
        {t('common.delete')}
      </Button>
      <button type="button" className="crm-bulk__close" onClick={onClear} aria-label={t('crm.bulk.clear')}>
        <Glyph name="close" size={14} />
      </button>
    </div>,
    document.body
  );
}
