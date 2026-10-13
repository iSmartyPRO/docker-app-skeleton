import { useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { Glyph } from '../components/bits';

/**
 * A field row of the deal card: label on the left, the value on the right.
 * A click turns the value into its editor; Enter / ✓ saves, Esc / ✕ cancels.
 * `instant` editors (selects, switches) save on change and close by themselves.
 *
 *   <InlineRow label="Источник" value={deal.source} display={…}
 *     renderEditor={({ value, setValue, commit }) => <Select … />} onSave={(v) => …} />
 */
export default function InlineRow({ label, value, display, renderEditor, onSave, disabled, instant, required, stacked }) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = async (next = draft) => {
    if (required && (next === null || next === undefined || String(next).trim() === '')) return;
    if (JSON.stringify(next ?? null) === JSON.stringify(value ?? null)) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const ok = await onSave(next);
      if (ok !== false) setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  // A click outside an instant editor (its dropdown closed) ends editing.
  useEffect(() => {
    if (!editing) return undefined;
    const onDown = (event) => {
      if (box.current?.contains(event.target)) return;
      if (event.target.closest?.('.ant-select-dropdown, .ant-picker-dropdown, .ant-popover, .ant-modal-wrap')) return;
      if (instant) setEditing(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing, instant]);

  return (
    <div className={`dp-row${editing ? ' is-editing' : ''}${stacked ? ' is-stacked' : ''}`}>
      <span className="dp-row__label">{label}</span>
      {editing ? (
        <div
          ref={box}
          className="dp-row__editor"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              cancel();
            }
            if (event.key === 'Enter' && !event.shiftKey && event.target.tagName === 'INPUT' && !instant) {
              event.preventDefault();
              commit();
            }
          }}
        >
          <div className="dp-row__control">{renderEditor({ value: draft, setValue: setDraft, commit, cancel })}</div>
          {!instant && (
            <div className="dp-row__actions">
              <Button size="small" type="primary" loading={busy} onClick={() => commit()} aria-label={t('common.save')} icon={<Glyph name="check" size={13} />} />
              <Button size="small" onClick={cancel} aria-label={t('common.cancel')} icon={<Glyph name="close" size={12} />} />
            </div>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          className={`dp-row__value${disabled ? ' is-disabled' : ''}`}
          onClick={() => !disabled && setEditing(true)}
          onKeyDown={(event) => !disabled && event.key === 'Enter' && event.target === event.currentTarget && setEditing(true)}
        >
          {display}
          {!disabled && (
            <span className="dp-row__pen" aria-hidden="true">
              <Glyph name="edit" size={12} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
