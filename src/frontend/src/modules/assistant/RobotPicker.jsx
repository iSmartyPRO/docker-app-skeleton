import { useState } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { ROBOTS, Robot } from './robots';

/** Three live robot cards; the hovered one smiles, the chosen one is ticked. */
export default function RobotPicker({ value, onChange, size = 84 }) {
  const { t } = useLocale();
  const [hover, setHover] = useState(null);
  return (
    <div className="asst-picker" role="radiogroup">
      {ROBOTS.map((robot) => {
        const on = value === robot.id;
        return (
          <button
            key={robot.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={`asst-pick${on ? ' is-on' : ''}`}
            style={{ '--asst-accent': robot.accent }}
            onClick={() => onChange(robot.id)}
            onPointerEnter={() => setHover(robot.id)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(robot.id)}
            onBlur={() => setHover(null)}
          >
            {on && <span className="asst-pick__check">✓</span>}
            <Robot kind={robot.id} mood={hover === robot.id ? 'wave' : on ? 'happy' : 'idle'} size={size} />
            <strong>{t(`assistant.robots.${robot.id}.name`)}</strong>
            <span>{t(`assistant.robots.${robot.id}.desc`)}</span>
          </button>
        );
      })}
    </div>
  );
}
