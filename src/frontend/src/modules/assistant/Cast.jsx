import { useState } from 'react';
import { Tooltip } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { ROBOTS, ROBOT_GROUPS, Robot, TINTS } from './robots';

/**
 * The cast of assistants grouped by kind, with the chosen one ticked and, when
 * `onTint` is given, a colour row for it. `compact` fits the robot's panel
 * (three in a row, names only); otherwise cards show a short description.
 *
 *   value    chosen character id
 *   colors   { [id]: '#rrggbb' } the person's colours (cards show them)
 *   onPick   (id) => void
 *   onTint   (id, color | null) => void — omit to hide the colour row
 *   only     ids to show (characters the administrator allows)
 *   selected + onToggle  — selection mode (administrator): cards toggle in a set
 */
export default function Cast({ value, colors = {}, onPick, onTint, compact = false, only = null, selected = null, onToggle = null }) {
  const { t } = useLocale();
  const [hover, setHover] = useState(null);
  const visible = only ? ROBOTS.filter((robot) => only.includes(robot.id)) : ROBOTS;
  const selecting = Array.isArray(selected) && Boolean(onToggle);
  const chosen = visible.find((robot) => robot.id === value) || visible[0] || ROBOTS[0];
  const tint = colors[chosen.id] || null;
  return (
    <div className={`asst-castx${compact ? ' is-compact' : ''}`}>
      {ROBOT_GROUPS.filter((group) => visible.some((robot) => robot.group === group)).map((group) => (
        <section key={group} className="asst-castx__group">
          <h4>{t(`assistant.groups.${group}`)}</h4>
          <div className="asst-castx__grid" role="radiogroup" aria-label={t(`assistant.groups.${group}`)}>
            {visible.filter((robot) => robot.group === group).map((robot, index) => {
              const on = selecting ? selected.includes(robot.id) : robot.id === chosen.id;
              const color = colors[robot.id] || null;
              return (
                <button
                  key={robot.id}
                  type="button"
                  role={selecting ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  title={compact ? t(`assistant.robots.${robot.id}.desc`) : undefined}
                  className={`asst-castx__item${on ? ' is-on' : ''}${selecting && !on ? ' is-off' : ''}`}
                  style={{ '--asst-accent': color || robot.accent, animationDelay: `${index * 0.04}s` }}
                  onClick={() => (selecting ? onToggle(robot.id) : onPick(robot.id))}
                  onPointerEnter={() => setHover(robot.id)}
                  onPointerLeave={() => setHover(null)}
                >
                  {selecting ? <span className={`asst-castx__box${on ? ' is-on' : ''}`}>{on ? '✓' : ''}</span> : on && <span className="asst-castx__check">✓</span>}
                  <span className="asst-castx__stage">
                    <Robot kind={robot.id} tint={color} still={selecting && !on} mood={hover === robot.id ? 'wave' : on ? 'happy' : 'idle'} size={compact ? 58 : 84} />
                  </span>
                  <strong>{t(`assistant.robots.${robot.id}.name`)}</strong>
                  {!compact && <span>{t(`assistant.robots.${robot.id}.desc`)}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {onTint && !selecting && (
        <section className="asst-tints" style={{ '--asst-accent': tint || chosen.accent }}>
          <h4>
            {t('assistant.color.title', { name: t(`assistant.robots.${chosen.id}.name`) })}
          </h4>
          <div className="asst-tints__row" role="radiogroup" aria-label={t('assistant.color.title', { name: t(`assistant.robots.${chosen.id}.name`) })}>
            <Tooltip title={t('assistant.color.original')} mouseEnterDelay={0.3}>
              <button
                type="button"
                role="radio"
                aria-checked={!tint}
                aria-label={t('assistant.color.original')}
                className={`asst-tints__swatch is-original${!tint ? ' is-on' : ''}`}
                style={{ '--sw': chosen.accent }}
                onClick={() => onTint(chosen.id, null)}
              />
            </Tooltip>
            {TINTS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={tint === color.toLowerCase()}
                aria-label={color}
                className={`asst-tints__swatch${tint === color.toLowerCase() ? ' is-on' : ''}`}
                style={{ '--sw': color }}
                onClick={() => onTint(chosen.id, color.toLowerCase())}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
