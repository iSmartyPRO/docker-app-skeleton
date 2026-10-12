import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import Image from '@tiptap/extension-image';
import { useLocale } from '../../../context/LocaleContext';

/*
 * Pictures of the visual editor. Stored HTML:
 *
 *   <img src="kbfile:42" alt="…">                       — a plain picture (centred)
 *   <figure class="kb-figure" data-align="wrap-left" data-width="50">
 *     <a href="https://…" target="_blank" rel="noopener noreferrer"><img src="kbfile:42" alt="…"></a>
 *     <figcaption>Caption</figcaption>
 *   </figure>                                           — size, layout, link or caption set
 *
 * `data-width` is a percentage of the text column (10…100, step 5) and
 * `data-align` one of center / left / right / wrap-left / wrap-right; both are
 * drawn by the `.kb-prose .kb-figure` rules, so the article looks the same in
 * the editor, the article view and on public links.
 */

export const IMAGE_ALIGNS = ['center', 'left', 'right', 'wrap-left', 'wrap-right'];
export const IMAGE_SIZES = [
  { key: 's', width: 25 },
  { key: 'm', width: 50 },
  { key: 'l', width: 75 },
  { key: 'full', width: 100 },
  { key: 'original', width: null },
];
const SAFE_HREF = /^(https?:|mailto:|\/|#)/i;

/** 10…100 in steps of 5, anything else is "natural size". */
export function clampWidth(value) {
  const n = Math.round(Number(value) / 5) * 5;
  return Number.isFinite(n) && n >= 10 ? Math.min(100, n) : null;
}
export const safeHref = (value) => {
  const href = String(value || '').trim();
  return href && SAFE_HREF.test(href) ? href : null;
};

const imgOf = (element) => (element.tagName === 'IMG' ? element : element.querySelector('img'));
const figureOf = (element) => (element.tagName === 'FIGURE' ? element : null);
const oneLine = (text) => String(text || '').replace(/\s*\n\s*/g, ' ');
const clean = (attrs) => Object.fromEntries(Object.entries(attrs).filter(([, value]) => value !== null && value !== undefined && value !== ''));

function ImageView({ node, updateAttributes, selected, editor, getPos }) {
  const { t } = useLocale();
  const { src, alt, title, width, align, caption, href } = node.attrs;
  const frame = useRef(null);
  const picture = useRef(null);
  const captionInput = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [drag, setDrag] = useState(null);
  const [focusCaption, setFocusCaption] = useState(false);
  const editable = editor.isEditable;

  useEffect(() => {
    const element = picture.current;
    setFailed(false);
    setLoaded(Boolean(element?.complete && element.naturalWidth));
  }, [src]);

  useEffect(() => {
    if (!focusCaption || !captionInput.current) return;
    captionInput.current.focus();
    setFocusCaption(false);
  }, [focusCaption, caption]);

  // The caption grows with its text.
  useLayoutEffect(() => {
    const element = captionInput.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  }, [caption, width, align, loaded]);

  // A picture that changes size moves the floating toolbar along.
  const nudge = () => window.dispatchEvent(new Event('resize'));

  const openCaption = () => {
    if (!editable) return;
    if (caption === null || caption === undefined) updateAttributes({ caption: '' });
    setFocusCaption(true);
  };

  /** Corner handles: the picture keeps its proportions, width snaps to 5 % of the column. */
  function startResize(event, east) {
    if (!editable || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    const figure = frame.current?.closest('figure');
    const content = editor.view.dom;
    if (!figure || !content) return;
    const style = getComputedStyle(content);
    const column = content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const startWidth = frame.current.getBoundingClientRect().width;
    const startX = event.clientX;
    // A centred picture grows on both sides, so the corner follows the pointer.
    const factor = !align || align === 'center' ? 2 : 1;
    const direction = east ? 1 : -1;
    const handle = event.currentTarget;
    const root = figure.closest('.ve');
    let pct = null;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* not capturable (synthetic event) */
    }
    root?.classList.add('is-resizing');
    const move = (moveEvent) => {
      const px = Math.max(40, Math.min(column, startWidth + direction * (moveEvent.clientX - startX) * factor));
      pct = Math.max(10, Math.min(100, Math.round(((px / column) * 100) / 5) * 5));
      figure.style.width = `${pct}%`;
      figure.style.maxWidth = '100%';
      setDrag({ pct, px: Math.round((column * pct) / 100) });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      figure.style.width = '';
      figure.style.maxWidth = '';
      root?.classList.remove('is-resizing');
      setDrag(null);
      if (pct) updateAttributes({ width: pct });
      requestAnimationFrame(nudge);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  const leaveCaption = (event) => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    if (event.key === 'Escape' || event.key === 'ArrowUp' || (event.key === 'Backspace' && !caption)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Backspace') updateAttributes({ caption: null });
      editor.chain().focus().setNodeSelection(pos).run();
    } else if (event.key === 'Enter' || (event.key === 'ArrowDown' && !event.shiftKey)) {
      event.preventDefault();
      // Typing goes on in the next paragraph (a new one when there is none).
      const after = pos + node.nodeSize;
      const next = editor.state.doc.resolve(after).nodeAfter;
      if (next?.isTextblock) editor.chain().focus().setTextSelection(after + 1).run();
      else editor.chain().focus().setNodeSelection(pos).createParagraphNear().run();
    }
  };

  const classes = ['ve-img'];
  if (selected) classes.push('is-selected');
  if (drag) classes.push('is-dragging');
  return (
    <NodeViewWrapper className={classes.join(' ')}>
      <div ref={frame} className={`ve-img__frame${loaded || failed ? '' : ' is-loading'}${failed ? ' is-failed' : ''}`}>
        <img
          ref={picture}
          src={src}
          alt={alt || ''}
          title={title || undefined}
          data-drag-handle=""
          draggable={editable}
          onLoad={() => {
            setLoaded(true);
            nudge();
          }}
          onError={() => setFailed(true)}
          onDoubleClick={openCaption}
        />
        {failed && <span className="ve-img__failed">{t('kb.ve.img.failed')}</span>}
        {href && (
          <span className="ve-img__badge" title={href} aria-hidden="true">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
        )}
        {editable &&
          ['nw', 'ne', 'sw', 'se'].map((corner) => (
            <span key={corner} className={`ve-img__handle is-${corner}`} onPointerDown={(event) => startResize(event, corner[1] === 'e')} aria-hidden="true" />
          ))}
        {drag && (
          <span className="ve-img__size">
            {drag.pct}% <i>·</i> {drag.px} px
          </span>
        )}
      </div>
      {caption !== null && caption !== undefined && (
        <figcaption className="ve-img__caption">
          {editable ? (
            <textarea
              ref={captionInput}
              rows={1}
              value={caption}
              placeholder={t('kb.ve.img.captionPlaceholder')}
              aria-label={t('kb.ve.img.caption')}
              onChange={(event) => updateAttributes({ caption: oneLine(event.target.value) })}
              onKeyDown={leaveCaption}
            />
          ) : (
            caption
          )}
        </figcaption>
      )}
    </NodeViewWrapper>
  );
}

const attr = (parse, fallback = null) => ({ default: fallback, rendered: false, parseHTML: parse });

/** Block picture with size, layout, caption and link; `kbfile` keeps the Files id while editing. */
export const KbImage = Image.extend({
  addAttributes() {
    return {
      src: attr((element) => imgOf(element)?.getAttribute('src') || null),
      alt: attr((element) => imgOf(element)?.getAttribute('alt') || null),
      title: attr((element) => imgOf(element)?.getAttribute('title') || null),
      kbfile: attr((element) => imgOf(element)?.getAttribute('data-kbfile') || null),
      width: attr((element) => clampWidth(figureOf(element)?.getAttribute('data-width'))),
      align: attr((element) => {
        const value = figureOf(element)?.getAttribute('data-align');
        return IMAGE_ALIGNS.includes(value) && value !== 'center' ? value : null;
      }),
      caption: attr((element) => {
        const figcaption = figureOf(element)?.querySelector('figcaption');
        return figcaption ? oneLine(figcaption.textContent).trim() : null;
      }),
      href: attr((element) => {
        const link = figureOf(element) ? element.querySelector('a[href]') : element.parentElement?.closest('a[href]');
        return safeHref(link?.getAttribute('href'));
      }),
    };
  },

  parseHTML() {
    const real = 'img[src]:not([src^="data:"])';
    return [
      // Our figures and figures pasted from other sites (picture + caption).
      { tag: 'figure', priority: 60, getAttrs: (element) => (element.querySelector(real) ? null : false) },
      { tag: real },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, title, kbfile, width, align, caption, href } = node.attrs;
    const img = ['img', clean({ src, alt, title, 'data-kbfile': kbfile })];
    if (!width && !align && (caption === null || caption === undefined) && !href) return img;
    const media = href ? ['a', { href, target: '_blank', rel: 'noopener noreferrer' }, img] : img;
    const figure = ['figure', clean({ class: 'kb-figure', 'data-align': align, 'data-width': width ? String(width) : null }), media];
    if (caption !== null && caption !== undefined) figure.push(['figcaption', {}, caption]);
    return figure;
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView, {
      as: 'figure',
      className: 'kb-figure ve-figure',
      attrs: ({ node }) => ({ 'data-align': node.attrs.align || 'center', 'data-width': node.attrs.width ? String(node.attrs.width) : '' }),
    });
  },
});
