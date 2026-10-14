import { Button, Dropdown, Tooltip } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { formatDay, inkOn } from '../lib';
import { Glyph } from '../components/bits';

/**
 * The deal's stages as arrows: passed ones tinted, the current one filled in
 * its colour. A click moves the deal; «Завершить» closes it as won or lost.
 * A closed deal shows the result with «Вернуть в работу».
 */
export default function StageBar({ deal, pipeline, disabled, onMove, onFinish }) {
  const { t, locale } = useLocale();
  const stages = pipeline?.stages || [];
  const open = stages.filter((stage) => stage.kind === 'open');
  const current = stages.find((stage) => stage.id === deal.stageId);
  const index = open.findIndex((stage) => stage.id === deal.stageId);
  const closed = current && current.kind !== 'open';

  if (closed) {
    return (
      <div className={`dp-result is-${current.kind}`} style={{ '--c': current.color }}>
        <span className="dp-result__icon">
          <Glyph name={current.kind === 'won' ? 'trophy' : 'close'} size={18} />
        </span>
        <div className="dp-result__text">
          <strong>{current.kind === 'won' ? t('crm.stage.wonBanner') : t('crm.stage.lostBanner')}</strong>
          <span>
            {deal.closedAt && formatDay(deal.closedAt, locale, true)}
            {current.kind === 'lost' && deal.lostReason && ` · ${deal.lostReason}`}
          </span>
        </div>
        {!disabled && (
          <Dropdown
            trigger={['click']}
            menu={{ items: open.map((stage) => ({ key: String(stage.id), label: <span className="status-option"><span className="status-pip" style={{ '--c': stage.color }} />{stage.name}</span>, onClick: () => onMove(stage) })) }}
          >
            <Button icon={<DownOutlined />} iconPosition="end">{t('crm.stage.reopen')}</Button>
          </Dropdown>
        )}
      </div>
    );
  }

  return (
    <div className="dp-stages">
      <div className="dp-stages__arrows" role="list" aria-label={t('crm.fields.stage')}>
        {open.map((stage, i) => {
          const state = i < index ? 'is-past' : i === index ? 'is-current' : '';
          return (
            <Tooltip key={stage.id} title={i === index ? t('crm.stage.current') : t('crm.stage.moveTo', { name: stage.name })} mouseEnterDelay={0.3}>
              <button
                type="button"
                role="listitem"
                className={`dp-arrow ${state}`}
                style={{ '--c': stage.color, '--ink': inkOn(stage.color) }}
                disabled={disabled || i === index}
                aria-current={i === index ? 'step' : undefined}
                onClick={() => onMove(stage)}
              >
                <span>{stage.name}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>
      {!disabled && (
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              { key: 'won', label: <span className="dp-finish is-won"><Glyph name="trophy" size={14} /> {t('crm.stage.won')}</span>, onClick: () => onFinish('won') },
              { key: 'lost', label: <span className="dp-finish is-lost"><Glyph name="close" size={14} /> {t('crm.stage.lost')}</span>, onClick: () => onFinish('lost') },
            ],
          }}
        >
          <Button className="dp-stages__finish" icon={<DownOutlined />} iconPosition="end">{t('crm.stage.finish')}</Button>
        </Dropdown>
      )}
    </div>
  );
}
