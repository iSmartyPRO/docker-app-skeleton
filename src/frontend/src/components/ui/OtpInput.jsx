import { useEffect, useRef } from 'react';
import { useLocale } from '../../context/LocaleContext';

/**
 * Six separate digit cells, bank-style.
 *  - typing advances, Backspace steps back, arrows move
 *  - paste or SMS/OS autofill (autocomplete="one-time-code") fills every cell
 *  - `onComplete` fires as soon as the last digit is entered
 */
export default function OtpInput({ value = '', onChange, onComplete, length = 6, disabled, error, autoFocus = true }) {
  const { t } = useLocale();
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, index) => value[index] || '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (error) {
      refs.current[0]?.focus();
    }
  }, [error]);

  const commit = (next) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange?.(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const focus = (index) => refs.current[Math.max(0, Math.min(length - 1, index))]?.focus();

  const onInput = (index, raw) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    if (typed.length > 1) {
      // Autofill or paste into one cell: spread from the start.
      const clean = commit(typed);
      focus(clean.length);
      return;
    }
    const next = (value.slice(0, index) + typed + value.slice(index + 1)).slice(0, length);
    commit(next);
    focus(index + 1);
  };

  const onKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[index]) {
        commit(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        commit(value.slice(0, index - 1) + value.slice(index));
        focus(index - 1);
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focus(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focus(index + 1);
    }
  };

  const onPaste = (event) => {
    event.preventDefault();
    const clean = commit(event.clipboardData.getData('text'));
    focus(clean.length);
  };

  return (
    <div className={`otp${error ? ' is-error' : ''}`} role="group" aria-label={t('common.a11y.oneTimeCode')}>
      {digits.map((digit, index) => (
        <input
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          className={`otp__cell${digit ? ' is-filled' : ''}`}
          value={digit}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={index === 0 ? length : 1}
          disabled={disabled}
          aria-label={t('common.a11y.digit', { n: index + 1 })}
          onChange={(event) => onInput(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={onPaste}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}
