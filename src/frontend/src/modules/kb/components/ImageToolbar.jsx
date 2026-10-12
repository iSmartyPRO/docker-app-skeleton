import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Input, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { IMAGE_ALIGNS, IMAGE_SIZES, safeHref } from './ImageNode';

/*
 * Floating toolbar over the selected picture: size presets, layout relative to
 * the text, caption, description (alt), link, replace, open / download, delete.
 * It sits in the editor's scroll box right after the text (so Tab from the
 * editor reaches it and it scrolls with the picture), above the picture or
 * below it when there is no room, never outside the box. The small forms in it
 * keep the picture selected while you type. ←/→ move between buttons, Esc
 * returns to the text.
 */

// Layout icons: the picture is the solid block, the text lines are faint.
const LINE = 1.6;
const LAYOUT_ICONS = {
  center: { pic: [6, 3.8, 8, 7.6], lines: [[1, 1, 18], [1, 13.4, 18]] },
  left: { pic: [1, 3.8, 8, 7.6], lines: [[1, 1, 18], [1, 13.4, 18]] },
  right: { pic: [11, 3.8, 8, 7.6], lines: [[1, 1, 18], [1, 13.4, 18]] },
  'wrap-left': { pic: [1, 1, 8, 8.4], lines: [[11, 1, 8], [11, 4.4, 8], [11, 7.8, 6], [1, 11.2, 18], [1, 14.4, 14]] },
  'wrap-right': { pic: [11, 1, 8, 8.4], lines: [[1, 1, 8], [1, 4.4, 8], [3, 7.8, 6], [1, 11.2, 18], [5, 14.4, 14]] },
};

function LayoutIcon({ kind }) {
  const { pic, lines } = LAYOUT_ICONS[kind];
  return (
    <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true">
      {lines.map(([x, y, w]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={LINE} rx={LINE / 2} fill="currentColor" opacity="0.42" />
      ))}
      <rect x={pic[0]} y={pic[1]} width={pic[2]} height={pic[3]} rx="1.6" fill="currentColor" />
    </svg>
  );
}

const icon = (paths, size = 16) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);
const ICONS = {
  caption: icon(
    <>
      <rect x="2" y="1.8" width="12" height="8" rx="1.6" />
      <path d="M4 13h8M6 15h4" />
    </>
  ),
  link: icon(<path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" />),
  replace: icon(<path d="M2.5 6.5a5.5 5.5 0 019.8-2.3M13.5 9.5a5.5 5.5 0 01-9.8 2.3M12.5 1.5v3h-3M3.5 14.5v-3h3" />),
  open: icon(<path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M12 9.5v3a1 1 0 01-1 1H3.5a1 1 0 01-1-1V5a1 1 0 011-1h3" />),
  download: icon(<path d="M8 2v8.5M4.5 7.5L8 11l3.5-3.5M2.5 13.5h11" />),
  delete: icon(<path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.2a1 1 0 001 .8h4.6a1 1 0 001-.8L12 4M6.8 7v4.5M9.2 7v4.5" />),
  upload: icon(<path d="M8 11V2.5M4.5 6L8 2.5 11.5 6M2.5 13.5h11" />),
  files: icon(<path d="M1.8 4.2a1 1 0 011-1h3.4l1.5 1.6h5.5a1 1 0 011 1v6.9a1 1 0 01-1 1H2.8a1 1 0 01-1-1z" />),
  web: icon(
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14C6.2 12.3 5.4 10.3 5.4 8S6.2 3.7 8 2z" />
    </>
  ),
};

function Btn({ title, active, danger, onClick, children, className = '', label }) {
  return (
    <Tooltip title={title} mouseEnterDelay={0.35} zIndex={1300}>
      <button
        type="button"
        className={`ve-ibar__btn${active ? ' is-on' : ''}${danger ? ' is-danger' : ''} ${className}`.trim()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        aria-label={label || title}
        aria-pressed={active === undefined ? undefined : Boolean(active)}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * @param fileUrl   nodeId → URL (for download links)
 * @param onReplace (how: 'upload'|'files'|'url') → replaces the selected picture
 * @param canUpload / canPick   whether upload / Files are available
 * @param boundary  the editor's scroll box: the toolbar never leaves it
 */
export default function ImageToolbar({ editor, boundary, fileUrl, onReplace, canUpload, canPick }) {
  const { t } = useLocale();
  const [panel, setPanel] = useState(null);
  const [draft, setDraft] = useState('');
  const [inside, setInside] = useState(false);
  const [place, setPlace] = useState(null);
  const bar = useRef(null);
  const active = editor.isEditable && editor.isActive('image');
  const attrs = active ? editor.getAttributes('image') : {};
  const { from } = editor.state.selection;
  const typingCaption = typeof document !== 'undefined' && Boolean(document.activeElement?.closest?.('.ve-img__caption'));
  const shown = active && !typingCaption && (editor.isFocused || inside || Boolean(panel));

  // Another picture (or none): close the small form.
  useEffect(() => setPanel(null), [from, active]);

  /** Above the picture, below it when there is no room, always inside the scroll box. */
  const measure = useCallback(() => {
    const element = bar.current;
    if (!element || !boundary || !editor.isActive('image')) return;
    const figure = editor.view.nodeDOM(editor.state.selection.from);
    const frame = figure?.querySelector?.('.ve-img__frame');
    if (!frame) return;
    const box = boundary.getBoundingClientRect();
    const rect = frame.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const gap = 12;
    const pad = 8;
    const left = Math.max(pad, Math.min(rect.left + rect.width / 2 - width / 2 - box.left, boundary.clientWidth - width - pad));
    let top = rect.top - box.top - height - gap;
    let side = 'top';
    if (top < pad) {
      // Below the caption too.
      top = figure.getBoundingClientRect().bottom - box.top + gap;
      side = 'bottom';
      // A tall picture: keep the toolbar on screen over it.
      if (top + height > boundary.clientHeight - pad) {
        top = pad;
        side = 'over';
      }
    }
    const next = { left: Math.round(left + boundary.scrollLeft), top: Math.round(top + boundary.scrollTop), side };
    setPlace((current) => (current && current.left === next.left && current.top === next.top && current.side === next.side ? current : next));
  }, [boundary, editor]);

  useLayoutEffect(() => {
    if (shown) measure();
  });

  useEffect(() => {
    if (!shown || !boundary) return undefined;
    boundary.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      boundary.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [shown, boundary, measure]);

  const set = (values) => editor.chain().focus().updateAttributes('image', values).run();
  const back = () => editor.chain().focus().run();
  const open = (name, value = '') => {
    if (panel === name) {
      setPanel(null);
      return;
    }
    setDraft(value);
    setPanel(name);
  };
  const saveAlt = () => {
    set({ alt: draft.trim() || null });
    setPanel(null);
  };
  const saveLink = (remove) => {
    const href = remove ? null : safeHref(draft);
    if (!remove && draft.trim() && !href) return;
    set({ href });
    setPanel(null);
  };
  const toggleCaption = () => {
    if (attrs.caption === null || attrs.caption === undefined) {
      set({ caption: '' });
      // Put the cursor right into the new caption.
      requestAnimationFrame(() => editor.view.dom.querySelector('.ProseMirror-selectednode .ve-img__caption textarea')?.focus());
    } else set({ caption: null });
  };
  const original = attrs.kbfile ? fileUrl(Number(attrs.kbfile)) : attrs.src;
  const download = attrs.kbfile ? `${fileUrl(Number(attrs.kbfile))}${String(fileUrl(Number(attrs.kbfile))).includes('?') ? '&' : '?'}download=1` : null;

  // ←/→ between the buttons, Esc back to the text.
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      // Esc closes the form / returns to the text, never the whole dialog.
      event.preventDefault();
      event.stopPropagation();
      if (panel) setPanel(null);
      back();
      return;
    }
    if (event.target.tagName === 'INPUT' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...bar.current.querySelectorAll('.ve-ibar__row button')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  };

  if (!shown) return null;
  const hasCaption = attrs.caption !== null && attrs.caption !== undefined;
  const align = attrs.align || 'center';
  return (
    <div
      className={`ve-ibar-pop is-${place?.side || 'top'}`}
      style={{ left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? undefined : 'hidden' }}
      onFocus={() => setInside(true)}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setInside(false)}
    >
      <div className="ve-ibar" ref={bar} role="toolbar" aria-label={t('kb.ve.img.toolbar')} onKeyDown={onKeyDown}>
        <div className="ve-ibar__row">
          <div className="ve-ibar__group ve-ibar__sizes" role="group" aria-label={t('kb.ve.img.size')}>
            {IMAGE_SIZES.map((size) => (
              <Btn
                key={size.key}
                title={t(`kb.ve.img.sizes.${size.key}`)}
                active={(attrs.width || null) === size.width}
                className="ve-ibar__size"
                onClick={() => set({ width: size.width })}
              >
                {t(`kb.ve.img.sizeLabels.${size.key}`)}
              </Btn>
            ))}
          </div>
          <span className="ve-ibar__sep" />
          <div className="ve-ibar__group" role="group" aria-label={t('kb.ve.img.layout')}>
            {IMAGE_ALIGNS.map((kind) => (
              <Btn key={kind} title={t(`kb.ve.img.align.${kind}`)} active={align === kind} onClick={() => set({ align: kind === 'center' ? null : kind })}>
                <LayoutIcon kind={kind} />
              </Btn>
            ))}
          </div>
          <span className="ve-ibar__sep" />
          <div className="ve-ibar__group" role="group">
            <Btn title={t(hasCaption ? 'kb.ve.img.captionOff' : 'kb.ve.img.captionOn')} active={hasCaption} onClick={toggleCaption}>
              {ICONS.caption}
            </Btn>
            <Btn title={t('kb.ve.img.alt')} active={panel === 'alt' || Boolean(attrs.alt)} onClick={() => open('alt', attrs.alt || '')}>
              <span className="ve-ibar__alt">ALT</span>
            </Btn>
            <Btn title={attrs.href ? `${t('kb.ve.img.link')}: ${attrs.href}` : t('kb.ve.img.link')} active={panel === 'link' || Boolean(attrs.href)} onClick={() => open('link', attrs.href || 'https://')}>
              {ICONS.link}
            </Btn>
          </div>
          <span className="ve-ibar__sep" />
          <div className="ve-ibar__group" role="group">
            {(canUpload || canPick) && (
              <Btn title={t('kb.ve.img.replace')} active={panel === 'replace'} onClick={() => open('replace')}>
                {ICONS.replace}
              </Btn>
            )}
            {original && (
              <Btn title={t('kb.ve.img.open')} onClick={() => window.open(original, '_blank', 'noopener')}>
                {ICONS.open}
              </Btn>
            )}
            {download && (
              <Btn
                title={t('kb.ve.img.download')}
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = download;
                  link.download = '';
                  link.rel = 'noopener';
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                }}
              >
                {ICONS.download}
              </Btn>
            )}
            <Btn title={t('kb.ve.img.delete')} danger onClick={() => editor.chain().focus().deleteSelection().run()}>
              {ICONS.delete}
            </Btn>
          </div>
        </div>
        {panel === 'alt' && (
          <div className="ve-ibar__panel">
            <label className="ve-ibar__label" htmlFor="ve-ibar-alt">
              {t('kb.ve.img.altLabel')}
            </label>
            <div className="ve-ibar__form">
              <Input
                id="ve-ibar-alt"
                size="small"
                autoFocus
                value={draft}
                maxLength={300}
                placeholder={t('kb.ve.img.altPlaceholder')}
                onChange={(event) => setDraft(event.target.value)}
                onPressEnter={saveAlt}
              />
              <Button size="small" type="primary" onClick={saveAlt}>
                {t('kb.ve.img.apply')}
              </Button>
            </div>
            <span className="ve-ibar__hint">{t('kb.ve.img.altHint')}</span>
          </div>
        )}
        {panel === 'link' && (
          <div className="ve-ibar__panel">
            <label className="ve-ibar__label" htmlFor="ve-ibar-link">
              {t('kb.ve.img.linkLabel')}
            </label>
            <div className="ve-ibar__form">
              <Input
                id="ve-ibar-link"
                size="small"
                autoFocus
                value={draft}
                placeholder="https://"
                status={draft.trim() && draft.trim() !== 'https://' && !safeHref(draft) ? 'error' : undefined}
                onChange={(event) => setDraft(event.target.value)}
                onPressEnter={() => saveLink(!draft.trim() || draft.trim() === 'https://')}
              />
              <Button size="small" type="primary" onClick={() => saveLink(!draft.trim() || draft.trim() === 'https://')}>
                {t('kb.ve.img.apply')}
              </Button>
              {attrs.href && (
                <Button size="small" onClick={() => saveLink(true)}>
                  {t('kb.ve.img.unlink')}
                </Button>
              )}
            </div>
            <span className="ve-ibar__hint">{t('kb.ve.img.linkHint')}</span>
          </div>
        )}
        {panel === 'replace' && (
          <div className="ve-ibar__panel">
            <span className="ve-ibar__label">{t('kb.ve.img.replaceWith')}</span>
            <div className="ve-ibar__choices">
              {canUpload && (
                <button type="button" className="ve-ibar__choice" onClick={() => (setPanel(null), onReplace('upload'))}>
                  {ICONS.upload}
                  {t('kb.ve.imageUpload')}
                </button>
              )}
              {canPick && (
                <button type="button" className="ve-ibar__choice" onClick={() => (setPanel(null), onReplace('files'))}>
                  {ICONS.files}
                  {t('kb.ve.imageFiles')}
                </button>
              )}
              <button type="button" className="ve-ibar__choice" onClick={() => (setPanel(null), onReplace('url'))}>
                {ICONS.web}
                {t('kb.ve.imageUrl')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
