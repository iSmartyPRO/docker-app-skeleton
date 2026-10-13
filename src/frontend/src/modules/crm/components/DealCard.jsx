import { forwardRef, useState } from 'react';
import { Popover } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { UserAvatar } from '../../shared/People';
import { ActivityBadge, Glyph, Money, NextActivity } from './bits';
import ActivityForm from './ActivityForm';

const stop = (event) => event.stopPropagation();
/** Events from the popover (a portal) must not reach the draggable card. */
export const STOP = { onPointerDown: stop, onMouseDown: stop, onTouchStart: stop, onKeyDown: stop, onClick: stop };

/** «+ Дело» on a card: a small popover to plan the next activity. */
export function AddActivityButton({ deal, onAdded, label, iconOnly }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      destroyOnHidden
      overlayClassName="crm-pop"
      content={
        <div className="crm-stop" {...STOP}>
          <ActivityForm
            compact
            dealId={deal.id}
            onDone={(activity) => {
              setOpen(false);
              onAdded?.(deal, activity);
            }}
          />
        </div>
      }
    >
      <button
        type="button"
        className={`crm-card__add${iconOnly ? ' is-icon' : ''}`}
        {...STOP}
        aria-label={t('crm.act.addFor', { title: deal.title })}
      >
        <Glyph name="plus" size={12} />
        {!iconOnly && (label || t('crm.act.short'))}
      </button>
    </Popover>
  );
}

/** A deal on the Kanban and the Activities board. */
const DealCard = forwardRef(function DealCard({ deal, onOpen, onActivity, dragging, overlay, style, showStage, stage, ...rest }, ref) {
  const { t } = useLocale();
  const client = deal.company || deal.person;
  return (
    <div
      ref={ref}
      style={style}
      className={`crm-card${dragging ? ' is-dragging' : ''}${overlay ? ' is-overlay' : ''}${deal.activity?.overdue ? ' has-overdue' : ''}`}
      onClick={() => onOpen?.(deal)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen?.(deal);
      }}
      role="button"
      tabIndex={0}
      aria-label={deal.title}
      {...rest}
    >
      <div className="crm-card__title">{deal.title}</div>
      {Number(deal.amount) > 0 && <Money amount={deal.amount} currency={deal.currency} className="crm-card__amount" />}
      {client && (
        <div className="crm-card__client">
          <Glyph name={deal.company ? 'building' : 'person'} size={13} />
          <span>{client.name}</span>
          {deal.company && deal.person && <em>· {deal.person.name}</em>}
        </div>
      )}
      {showStage && stage && (
        <div className="crm-card__stage" style={{ '--c': stage.color }}>
          <span className="status-pip" />
          {stage.name}
        </div>
      )}
      <div className="crm-card__foot">
        {deal.activity?.next ? <NextActivity next={deal.activity.next} compact /> : !(onActivity && !overlay && deal.canEdit !== false) && <span className="crm-card__none">{t('crm.act.none')}</span>}
        {!deal.activity?.next && !overlay && onActivity && deal.canEdit !== false && <AddActivityButton deal={deal} onAdded={onActivity} />}
        <ActivityBadge activity={deal.activity} />
        <span className="crm-card__grow" />
        {deal.activity?.next && !overlay && onActivity && deal.canEdit !== false && <AddActivityButton deal={deal} onAdded={onActivity} iconOnly />}
        <UserAvatar user={deal.owner} size={24} />
      </div>
    </div>
  );
});

export default DealCard;
