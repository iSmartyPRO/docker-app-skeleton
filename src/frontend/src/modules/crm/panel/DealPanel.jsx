import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { App, Button, Dropdown, Input, InputNumber, Select, Skeleton, Space, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import Conversation from '../../chat/components/Conversation';
import { UserAvatar } from '../../shared/People';
import { crmApi } from '../api';
import { useCrm } from '../CrmContext';
import { errorCode, lostStage, openStages, wonStage } from '../lib';
import LostDialog from '../components/LostDialog';
import UserSelect from '../components/UserSelect';
import { Glyph, Money } from '../components/bits';
import DealFields from './DealFields';
import StageBar from './StageBar';
import Timeline from './Timeline';
import DealExtensions from './extensions';
import './panel.css';

const EVENTS_PAGE = 50;

/** Is a dropdown, picker or dialog on top (Esc belongs to it)? */
function overlayOpen() {
  return Boolean(
    document.querySelector(
      '.ant-modal-wrap:not([style*="display: none"]), .ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden), .ant-popover:not(.ant-popover-hidden)'
    )
  );
}

/**
 * The deal card over the current view: fields on the left, the timeline
 * (or the deal chat) on the right; on phones one of them with tabs.
 */
export default function DealPanel({ id, onClose, onChanged }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { pipelines, pipelineById, chatEnabled, settings } = useCrm();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [tab, setTab] = useState('fields');
  const [chat, setChat] = useState(false);
  const [lost, setLost] = useState(null);
  const [ownerPick, setOwnerPick] = useState(false);
  const [amountEdit, setAmountEdit] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await crmApi.deal(id);
      if (mine !== seq.current) return;
      setData(res.data);
      setHasMore(res.data.eventsHasMore ?? (res.data.events || []).length >= EVENTS_PAGE);
      setError(null);
    } catch (err) {
      if (mine === seq.current) setError(err);
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    setError(null);
    setChat(false);
    setTab('fields');
    load();
  }, [load]);

  // Esc closes the card unless a dropdown, picker or dialog is open.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (overlayOpen()) return;
      if (document.activeElement?.closest?.('.dp-row.is-editing')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The page behind does not scroll while the card is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const deal = data?.deal;
  const pipeline = data?.pipeline || pipelineById(deal?.pipelineId);
  const editable = deal?.canEdit !== false;

  const setDeal = (next) => setData((prev) => (prev ? { ...prev, deal: { ...prev.deal, ...next } } : prev));

  /** Saves a patch optimistically; on a version conflict shows the fresh deal. */
  const patch = async (changes) => {
    const before = data.deal;
    const optimistic = { ...changes };
    if ('ownerId' in changes) optimistic.owner = changes.ownerId ? { ...(before.owner || {}), id: changes.ownerId } : null;
    setDeal(Object.fromEntries(Object.entries(optimistic).filter(([key]) => !key.endsWith('Id') && key !== 'watcherIds')));
    try {
      const res = await crmApi.updateDeal(before.id, { ...changes, version: before.version });
      setDeal(res.data.deal);
      onChanged?.();
      refreshTimeline();
      return true;
    } catch (err) {
      if (errorCode(err) === 'VERSION_CONFLICT' && err.response?.data?.deal) {
        setDeal(err.response.data.deal);
        message.warning(t('crm.panel.conflict'));
      } else {
        setData((prev) => ({ ...prev, deal: before }));
        message.error(errorMessage(err));
      }
      return false;
    }
  };

  const refreshTimeline = async () => {
    try {
      const res = await crmApi.deal(id);
      setData(res.data);
      setHasMore(res.data.eventsHasMore ?? (res.data.events || []).length >= EVENTS_PAGE);
    } catch {
      /* stays as is */
    }
  };

  const moreEvents = async () => {
    const last = data.events[data.events.length - 1];
    try {
      const res = await crmApi.events(deal.id, last?.id);
      setData((prev) => ({ ...prev, events: [...prev.events, ...res.data.events] }));
      setHasMore(Boolean(res.data.hasMore));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const move = async (stage, lostReason) => {
    const before = data.deal;
    setDeal({ stageId: stage.id });
    try {
      const res = await crmApi.moveDeal(before.id, { stageId: stage.id, ...(lostReason !== undefined ? { lostReason } : {}) });
      setDeal(res.data.deal);
      if (stage.kind === 'won') message.success(`🎉 ${t('crm.stage.wonToast', { title: before.title })}`);
      onChanged?.();
      refreshTimeline();
    } catch (err) {
      setData((prev) => ({ ...prev, deal: before }));
      if (errorCode(err) === 'LOST_REASON_REQUIRED') setLost({ deal: before, stage });
      else message.error(errorMessage(err));
    }
  };

  const onMove = (stage) => (stage.kind === 'lost' ? setLost({ deal, stage }) : move(stage));
  const onFinish = (kind) => {
    const stage = kind === 'won' ? wonStage(pipeline) : lostStage(pipeline);
    if (stage) onMove(stage);
  };

  const switchPipeline = (pipelineId) => {
    const target = pipelineById(pipelineId);
    const first = openStages(target)[0];
    if (!target || !first) return;
    modal.confirm({
      title: t('crm.panel.movePipeline', { name: target.name }),
      content: t('crm.panel.movePipelineText', { stage: first.name }),
      okText: t('crm.panel.move'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const res = await crmApi.changePipeline(deal.id, { pipelineId, stageId: first.id });
          setData((prev) => ({ ...prev, deal: res.data.deal, pipeline: target }));
          onChanged?.();
          refreshTimeline();
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    });
  };

  const copyLink = () => navigator.clipboard?.writeText(`${window.location.origin}/app/crm/deals/${id}`).then(() => message.success(t('common.copied')));

  const menu = deal && {
    items: [
      { key: 'link', label: t('crm.panel.copyLink'), onClick: copyLink },
      editable && {
        key: 'copy',
        label: t('crm.panel.copyDeal'),
        onClick: async () => {
          try {
            const res = await crmApi.copyDeal(deal.id);
            message.success(t('crm.panel.copied'));
            onChanged?.();
            navigate(`/app/crm/deals/${res.data.deal.id}${window.location.search}`);
          } catch (err) {
            message.error(errorMessage(err));
          }
        },
      },
      deal.canDelete && { type: 'divider' },
      deal.canDelete && {
        key: 'delete',
        danger: true,
        label: t('crm.panel.delete'),
        onClick: () =>
          modal.confirm({
            title: t('crm.panel.deleteConfirm', { title: deal.title }),
            content: t('crm.panel.deleteText'),
            okText: t('common.delete'),
            okButtonProps: { danger: true },
            cancelText: t('common.cancel'),
            onOk: async () => {
              try {
                await crmApi.deleteDeal(deal.id);
                message.success(t('crm.panel.deleted'));
                onChanged?.();
                onClose();
              } catch (err) {
                message.error(errorMessage(err));
              }
            },
          }),
      },
    ].filter(Boolean),
  };

  const loading = !data && !error;

  const panel = (
    <div className="dp-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dp-float">
        <Tooltip title={`${t('common.close')} · Esc`} placement="left">
          <button type="button" onClick={onClose} aria-label={t('common.close')}>
            <Glyph name="close" size={16} />
          </button>
        </Tooltip>
        {deal && (
          <>
            <Tooltip title={t('crm.panel.copyLink')} placement="left">
              <button type="button" onClick={copyLink} aria-label={t('crm.panel.copyLink')}>
                <Glyph name="link" size={16} />
              </button>
            </Tooltip>
            <Tooltip title={t('crm.panel.newWindow')} placement="left">
              <button type="button" onClick={() => window.open(`/app/crm/deals/${deal.id}`, '_blank', 'noopener')} aria-label={t('crm.panel.newWindow')}>
                <Glyph name="external" size={16} />
              </button>
            </Tooltip>
          </>
        )}
      </div>
      <div className={`dp${tab === 'feed' ? ' show-feed' : ''}`} role="dialog" aria-modal="true" aria-label={deal?.title || t('crm.deal')}>
        <div className="dp-tabs">
          <button type="button" className={tab === 'fields' ? 'is-active' : ''} onClick={() => setTab('fields')}>{t('crm.panel.tabFields')}</button>
          <button type="button" className={tab === 'feed' ? 'is-active' : ''} onClick={() => setTab('feed')}>{t('crm.panel.tabFeed')}</button>
          <button type="button" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        <div className="dp-main">
          {error ? (
            <div className="dp-error">
              <strong>{error.response?.status === 404 ? t('crm.panel.notFound') : t('crm.loadError')}</strong>
              <span>{errorMessage(error)}</span>
              <Button onClick={onClose}>{t('common.back')}</Button>
            </div>
          ) : loading ? (
            <div className="dp-scroll">
              <Skeleton active title={{ width: '70%' }} paragraph={{ rows: 2 }} />
              <div className="dp-skel-stages" />
              <Skeleton active paragraph={{ rows: 8 }} />
            </div>
          ) : (
            <div className="dp-scroll">
              <div className="dp-meta">
                <span className="mod-dot" style={{ '--c': pipeline?.color }} />
                {pipelines.length > 1 && editable ? (
                  <Select
                    size="small"
                    variant="borderless"
                    value={deal.pipelineId}
                    onChange={switchPipeline}
                    options={pipelines.map((item) => ({ value: item.id, label: item.name }))}
                    popupMatchSelectWidth={220}
                    className="dp-meta__pipeline"
                    aria-label={t('crm.pipeline')}
                  />
                ) : (
                  <span>{pipeline?.name}</span>
                )}
                <b className="dp-meta__id">#{deal.id}</b>
                <span className="dp-meta__grow" />
                <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
                  <button type="button" className="dp-menu" aria-label={t('crm.panel.menu')}>⋯</button>
                </Dropdown>
              </div>
              <div className="dp-title">
                <Input.TextArea
                  key={`${deal.id}-${deal.version}`}
                  defaultValue={deal.title}
                  disabled={!editable}
                  variant="borderless"
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  maxLength={300}
                  aria-label={t('crm.fields.title')}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== deal.title) patch({ title: value });
                    else event.target.value = deal.title;
                  }}
                  onPressEnter={(event) => {
                    event.preventDefault();
                    event.target.blur();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation();
                      event.target.value = deal.title;
                      event.target.blur();
                    }
                  }}
                />
              </div>
              <div className="dp-headline">
                {amountEdit ? (
                  <Space.Compact className="dp-amount-edit" onKeyDown={(event) => event.key === 'Escape' && (event.stopPropagation(), setAmountEdit(null))}>
                    <InputNumber autoFocus min={0} value={amountEdit.amount} onChange={(amount) => setAmountEdit((prev) => ({ ...prev, amount }))} onPressEnter={() => patch({ amount: amountEdit.amount || 0, currency: amountEdit.currency }).then((ok) => ok && setAmountEdit(null))} style={{ width: 180 }} aria-label={t('crm.fields.amount')} />
                    <Select value={amountEdit.currency} onChange={(currency) => setAmountEdit((prev) => ({ ...prev, currency }))} options={(settings.currencies || [deal.currency]).map((code) => ({ value: code, label: code }))} style={{ width: 90 }} aria-label={t('crm.fields.currency')} />
                    <Button type="primary" onClick={() => patch({ amount: amountEdit.amount || 0, currency: amountEdit.currency }).then((ok) => ok && setAmountEdit(null))} aria-label={t('common.save')} icon={<Glyph name="check" size={14} />} />
                    <Button onClick={() => setAmountEdit(null)} aria-label={t('common.cancel')} icon={<Glyph name="close" size={12} />} />
                  </Space.Compact>
                ) : (
                  <button type="button" className="dp-amount" disabled={!editable} onClick={() => setAmountEdit({ amount: Number(deal.amount) || null, currency: deal.currency })} aria-label={t('crm.fields.amount')}>
                    <Money amount={deal.amount} currency={deal.currency} />
                    {editable && <Glyph name="edit" size={13} />}
                  </button>
                )}
                <span className="dp-headline__grow" />
                <div className="dp-owner">
                  <span className="dp-owner__label">{t('crm.fields.owner')}</span>
                  {ownerPick ? (
                    <UserSelect autoFocus open value={deal.owner?.id} onChange={(ownerId) => { setOwnerPick(false); if (ownerId && ownerId !== deal.owner?.id) patch({ ownerId }); }} onDropdownVisibleChange={(visible) => !visible && setOwnerPick(false)} style={{ minWidth: 200 }} allowClear={false} />
                  ) : (
                    <button type="button" className={`dp-pill${deal.owner ? '' : ' is-empty'}`} disabled={!editable} onClick={() => setOwnerPick(true)}>
                      {deal.owner && <UserAvatar user={deal.owner} size={22} tip={false} />}
                      <span>{deal.owner?.name || t('crm.fields.noOwner')}</span>
                    </button>
                  )}
                </div>
              </div>
              <StageBar deal={deal} pipeline={pipeline} disabled={!editable} onMove={onMove} onFinish={onFinish} />
              <DealFields deal={deal} editable={editable} onPatch={patch} />
              <DealExtensions deal={deal} onChanged={refreshTimeline} />
              <div className="dp-foot-meta">
                {t('crm.panel.createdBy', { who: deal.createdBy?.name || '—', when: formatDateTime(deal.createdAt, locale) })}
                {deal.updatedAt && ` · ${t('crm.panel.updated', { when: formatDateTime(deal.updatedAt, locale) })}`}
              </div>
            </div>
          )}
        </div>
        <aside className={`dp-side${chat ? ' is-chat' : ''}`}>
          {deal && (
            <div className="dp-side__head">
              <strong>{chat ? t('crm.panel.chatTitle') : t('crm.panel.timeline')}</strong>
              <span className="dp-meta__grow" />
              {chatEnabled && (
                <Button size="small" type={chat ? 'default' : 'text'} onClick={() => setChat(!chat)} icon={<Glyph name={chat ? 'close' : 'chat'} size={14} />}>
                  {chat ? t('crm.panel.backToTimeline') : t('crm.panel.discuss')}
                </Button>
              )}
            </div>
          )}
          {deal && chat && chatEnabled ? (
            <div className="dp-chat">
              <Conversation key={deal.id} entity={{ type: 'deal', id: deal.id }} compact header="bare" emptyHint={t('crm.panel.chatEmpty')} />
            </div>
          ) : deal ? (
            <div className="dp-side__scroll">
              <Timeline deal={deal} activities={data.activities || []} events={data.events || []} hasMore={hasMore} editable={editable} onReload={() => { refreshTimeline(); onChanged?.(); }} onMoreEvents={moreEvents} />
            </div>
          ) : (
            <div className="dp-side__scroll">{!error && <Skeleton active avatar paragraph={{ rows: 6 }} />}</div>
          )}
        </aside>
      </div>
      <LostDialog
        open={lost}
        onCancel={() => setLost(null)}
        onOk={async (reason) => {
          const { stage } = lost;
          setLost(null);
          await move(stage, reason);
        }}
      />
    </div>
  );
  return createPortal(panel, document.body);
}
