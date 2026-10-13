import { Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';

/**
 * Segmented stage bar: open stages, then one closing segment (won / lost).
 * Segments up to the current one are filled in its colour; a click on a
 * segment moves the deal there (onMove(stage)).
 */
export default function StageProgress({ pipeline, stageId, onMove, disabled }) {
  const { t } = useLocale();
  const stages = pipeline?.stages || [];
  const open = stages.filter((stage) => stage.kind === 'open');
  const current = stages.find((stage) => stage.id === stageId);
  const won = stages.find((stage) => stage.kind === 'won');
  const lost = stages.find((stage) => stage.kind === 'lost');
  const index = current?.kind === 'open' ? open.findIndex((stage) => stage.id === stageId) : open.length;
  const color = current?.color || '#94a3b8';
  const final = current?.kind === 'lost' ? lost : won;
  const segments = [...open, final].filter(Boolean);
  return (
    <div className={`crm-progress${disabled ? ' is-disabled' : ''}`} style={{ '--c': color }} onClick={(event) => event.stopPropagation()} role="group" aria-label={current ? t('crm.list.stageIs', { name: current.name }) : t('crm.fields.stage')}>
      <div className="crm-progress__bar">
        {segments.map((stage, i) => (
          <Tooltip key={stage.id} title={stage.kind === 'open' ? stage.name : current?.kind === 'open' ? t('crm.stage.finish') : stage.name} mouseEnterDelay={0.2}>
            <button
              type="button"
              className={`crm-progress__seg${i <= index ? ' is-on' : ''}${stage.id === stageId ? ' is-current' : ''}`}
              disabled={disabled || stage.id === stageId}
              onClick={() => onMove?.(stage.kind === 'open' ? stage : current?.kind === 'open' ? 'finish' : stage)}
              aria-label={stage.name}
            />
          </Tooltip>
        ))}
      </div>
      <span className="crm-progress__name">{current?.name || '—'}</span>
    </div>
  );
}
