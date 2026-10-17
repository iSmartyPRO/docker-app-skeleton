import { Suspense, lazy, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import DOMPurify from 'dompurify';
import { App, Tooltip } from 'antd';
import { DownloadOutlined, EditOutlined, EyeInvisibleOutlined, EyeOutlined, ExpandOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { formatBytes, formatDateTime } from '../../lib/format';
import {
  ANCHOR_PREFIX,
  README_MAX_BYTES,
  cacheReadme,
  cachedReadme,
  decodeReadme,
  folderState,
  headingSlug,
  onReadmePrefs,
  parseHref,
  readmesHidden,
  renderReadme,
  setFolderState,
  setReadmesHidden,
} from '../../lib/readme';
import './readme.css';

const ImageViewer = lazy(() => import('../../modules/kb/viewers/ImageViewer'));

// Collapsed preview height (px); the card grows to the full text on demand.
const COLLAPSED = 188;
const COLLAPSED_PHONE = 150;

/** The global "hide READMEs" switch (view options of the folder views). */
export function useReadmesHidden() {
  const hidden = useSyncExternalStore(onReadmePrefs, readmesHidden, () => false);
  return [hidden, setReadmesHidden];
}

// ── Sanitizing ──
// A strict allowlist; links, pictures and ids are rewritten by the hook below.
const TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'input', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'summary',
  'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
];
const ATTRS = ['href', 'src', 'alt', 'title', 'id', 'class', 'align', 'colspan', 'rowspan', 'width', 'height', 'type', 'checked', 'disabled', 'start', 'open', 'aria-hidden', 'tabindex'];
const CLASS_OK = /^(rd-[\w-]+|language-[\w+#.-]+)$/;
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

let purifier = null;
function sanitize(html) {
  if (!purifier) {
    purifier = DOMPurify(window);
    purifier.addHook('afterSanitizeAttributes', (node) => {
      if (node.hasAttribute('class')) {
        const kept = node.getAttribute('class').split(/\s+/).filter((name) => CLASS_OK.test(name));
        if (kept.length) node.setAttribute('class', kept.join(' '));
        else node.removeAttribute('class');
      }
      if (node.hasAttribute('id') && !node.getAttribute('id').startsWith(ANCHOR_PREFIX)) node.setAttribute('id', `${ANCHOR_PREFIX}${node.getAttribute('id')}`);
      if (node.hasAttribute('tabindex') && node.getAttribute('tabindex') !== '-1') node.removeAttribute('tabindex');
      if (node.tagName === 'INPUT') {
        if (node.getAttribute('type') !== 'checkbox') node.remove();
        else node.setAttribute('disabled', '');
        return;
      }
      if (node.tagName === 'A' && node.hasAttribute('href')) {
        const target = parseHref(node.getAttribute('href'));
        if (target.kind === 'external') {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        } else if (target.kind === 'anchor') {
          node.setAttribute('href', `#${encodeURIComponent(target.hash)}`);
          node.setAttribute('data-rd-anchor', target.hash);
        } else if (target.kind === 'relative') {
          node.setAttribute('data-rd-link', node.getAttribute('href'));
          node.setAttribute('href', '#');
        } else {
          node.removeAttribute('href');
        }
      }
      if (node.tagName === 'IMG') {
        const value = node.getAttribute('src') || '';
        const target = parseHref(value);
        if (target.kind === 'relative') {
          node.setAttribute('data-rd-src', value);
          node.removeAttribute('src');
        } else if (!(target.kind === 'external' && /^https?:/i.test(value)) && !DATA_IMAGE.test(value)) {
          node.removeAttribute('src');
        }
        node.setAttribute('loading', 'lazy');
        node.setAttribute('decoding', 'async');
        node.setAttribute('referrerpolicy', 'no-referrer');
      }
    });
  }
  return purifier.sanitize(html, {
    ALLOWED_TAGS: TAGS,
    ALLOWED_ATTR: ATTRS,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'svg', 'math'],
  });
}

const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches;

/** How tall the placeholder is while the text loads: a guess from the file size, so the card hardly moves. */
function placeholderHeight(size, collapsed) {
  const lines = Math.ceil((Number(size) || 0) / 55);
  return Math.max(84, Math.min(collapsed, lines * 25 + 24));
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" transform="translate(0 -2)" />
      <path d="M8.5 7.5h7M8.5 11h5" />
    </svg>
  );
}

/**
 * A folder's README, shown above its listing: a collapsed preview with a soft
 * fade ("Show all" / "Collapse"), or a slim bar when hidden for this folder.
 * The text is fetched through the module's usual read address (same access
 * checks as opening the file), cached by address + version, decoded
 * (UTF-8 / Windows-1251), rendered as GitHub-flavoured Markdown and sanitized.
 *
 * - `file`: { name, size, modified, by } of the README;
 * - `url`: the address its content is read from; `version`: changes when the file does;
 * - `folderKey`: remembers collapsed / expanded / hidden per folder;
 * - `resolveLink(target)` → { href?, open() } | null for links to files and
 *   folders next to it (target from lib/readme parseHref);
 * - `resolveImage(target)` → address | Promise<address> | null for its pictures;
 * - actions: `onOpen`, `onEdit`, `downloadUrl`, `linkUrl` (copied as is).
 */
export default function ReadmeCard({ file, url, version = '', folderKey, resolveLink, resolveImage, onOpen, onEdit, downloadUrl, linkUrl }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [globallyHidden] = useReadmesHidden();
  const [mode, setModeState] = useState(() => folderState(folderKey));
  const collapsedHeight = useMemo(() => (isPhone() ? COLLAPSED_PHONE : COLLAPSED), []);
  const cacheKey = `${url}|${version}|${file?.size ?? ''}`;
  const tooLarge = Number(file?.size) > README_MAX_BYTES;
  const [loaded, setLoaded] = useState(() => (tooLarge ? null : cachedReadme(cacheKey) || null));
  const [status, setStatus] = useState(() => (tooLarge ? 'large' : cachedReadme(cacheKey) ? 'ready' : 'loading'));
  const [attempt, setAttempt] = useState(0);
  const [overflows, setOverflows] = useState(false);
  const [height, setHeight] = useState(null);
  const [gallery, setGallery] = useState(null);
  const card = useRef(null);
  const body = useRef(null);
  const prose = useRef(null);
  const links = useRef(new WeakMap());
  const settle = useRef(null);
  useEffect(() => () => clearTimeout(settle.current), []);
  const bodyId = useId();
  const latest = useRef({ resolveLink, resolveImage });
  latest.current = { resolveLink, resolveImage };

  useEffect(() => setModeState(folderState(folderKey)), [folderKey]);
  // The text is on the page (not the slim "hidden" bar): links and pictures are wired up again.
  const shown = mode !== 'hidden';
  const setMode = useCallback(
    (next) => {
      setModeState(next);
      setFolderState(folderKey, next);
    },
    [folderKey]
  );

  // ── Loading (once per version; folder switches back and forth come from the cache) ──
  useEffect(() => {
    if (tooLarge) {
      setStatus('large');
      setLoaded(null);
      return undefined;
    }
    const hit = cachedReadme(cacheKey);
    if (hit) {
      setLoaded(hit);
      setStatus('ready');
      return undefined;
    }
    if (mode === 'hidden' || globallyHidden) return undefined;
    const controller = new AbortController();
    setStatus('loading');
    setLoaded(null);
    fetch(url, { credentials: 'same-origin', signal: controller.signal })
      .then(async (res) => {
        if (res.status === 403 || res.status === 404 || res.status === 401) {
          setStatus('gone');
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const html = sanitize(renderReadme(decodeReadme(await res.arrayBuffer())));
        const value = { html };
        cacheReadme(cacheKey, value);
        setLoaded(value);
        setStatus('ready');
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setStatus('error');
      });
    return () => controller.abort();
  }, [cacheKey, url, tooLarge, attempt, mode, globallyHidden]);

  // ── After the HTML is in: pictures and links of the folder, copy buttons ──
  useLayoutEffect(() => {
    const root = prose.current;
    if (!root || !loaded) return undefined;
    let alive = true;
    const { resolveLink: linkOf, resolveImage: imageOf } = latest.current;
    root.querySelectorAll('img[data-rd-src]').forEach((img) => {
      const target = parseHref(img.getAttribute('data-rd-src'));
      const drop = () => {
        const alt = document.createElement('span');
        alt.className = 'rd-missing';
        alt.textContent = img.getAttribute('alt') || img.getAttribute('data-rd-src');
        img.replaceWith(alt);
      };
      const result = imageOf?.(target);
      if (typeof result === 'string') img.setAttribute('src', result);
      else if (result && typeof result.then === 'function') {
        img.classList.add('rd-pending');
        result
          .then((address) => {
            if (!alive) return;
            if (address) {
              img.setAttribute('src', address);
              img.classList.remove('rd-pending');
            } else drop();
          })
          .catch(() => alive && drop());
      } else drop();
    });
    root.querySelectorAll('a[data-rd-link]').forEach((anchor) => {
      const resolved = linkOf?.(parseHref(anchor.getAttribute('data-rd-link')));
      if (!resolved) {
        anchor.removeAttribute('href');
        anchor.classList.add('rd-deadlink');
        return;
      }
      if (resolved.href) anchor.setAttribute('href', resolved.href);
      links.current.set(anchor, resolved);
    });
    root.querySelectorAll('.rd-code').forEach((block) => {
      const bar = block.querySelector('.rd-code__bar');
      if (!bar || bar.querySelector('button')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rd-copy';
      button.setAttribute('data-rd-copy', '');
      button.setAttribute('aria-label', t('readme.copyCode'));
      button.textContent = t('readme.copy');
      bar.appendChild(button);
    });
    return () => {
      alive = false;
    };
  }, [loaded, t, shown]);

  // ── Does the text need "Show all"? ──
  useLayoutEffect(() => {
    const root = prose.current;
    if (!root || status !== 'ready') return undefined;
    const measure = () => setOverflows(root.scrollHeight > collapsedHeight + 40);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [status, loaded, collapsedHeight, shown]);

  const expanded = mode === 'expanded' || !overflows;

  // Height animation: from the preview to the full text and back.
  const animateTo = (next) => {
    const element = body.current;
    const root = prose.current;
    if (!element || !root) {
      setMode(next);
      return;
    }
    const full = root.scrollHeight;
    clearTimeout(settle.current);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setHeight(null);
      setMode(next);
      return;
    }
    // transitionend may never come (hidden tab, interrupted): settle anyway.
    settle.current = setTimeout(() => setHeight(null), 600);
    if (next === 'expanded') {
      setHeight(collapsedHeight);
      requestAnimationFrame(() => setHeight(full));
    } else {
      setHeight(full);
      requestAnimationFrame(() => requestAnimationFrame(() => setHeight(collapsedHeight)));
      // Folding a long text: bring the card back into view.
      const top = card.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) card.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setMode(next);
  };

  const onTransitionEnd = (event) => {
    if (event.target === body.current && event.propertyName === 'max-height') setHeight(null);
  };

  const goToAnchor = (hash) => {
    const target = prose.current?.querySelector(`#${CSS.escape(`${ANCHOR_PREFIX}${hash}`)}`) || prose.current?.querySelector(`#${CSS.escape(`${ANCHOR_PREFIX}${headingSlug(hash)}`)}`);
    if (!target) return;
    if (!expanded) animateTo('expanded');
    setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), expanded ? 0 : 320);
  };

  const onClick = (event) => {
    const copy = event.target.closest?.('[data-rd-copy]');
    if (copy) {
      const code = copy.closest('.rd-code')?.querySelector('pre')?.textContent || '';
      copyToClipboard(code).then((ok) => {
        copy.textContent = ok ? t('readme.copied') : t('readme.copy');
        copy.classList.toggle('is-done', ok);
        setTimeout(() => {
          copy.textContent = t('readme.copy');
          copy.classList.remove('is-done');
        }, 1600);
      });
      return;
    }
    const anchor = event.target.closest?.('a');
    if (anchor && prose.current?.contains(anchor)) {
      const hash = anchor.getAttribute('data-rd-anchor') ?? (anchor.classList.contains('rd-anchor') ? decodeURIComponent((anchor.getAttribute('href') || '#').slice(1)) : null);
      if (hash !== null) {
        event.preventDefault();
        goToAnchor(hash);
        return;
      }
      if (anchor.hasAttribute('data-rd-link')) {
        const resolved = links.current.get(anchor);
        // A new tab / window for a real address: the browser does it.
        if (resolved?.href && (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1)) return;
        event.preventDefault();
        resolved?.open?.();
        return;
      }
    }
    const img = event.target.closest?.('img');
    if (img && !img.closest('a') && img.getAttribute('src') && prose.current?.contains(img)) {
      const all = [...prose.current.querySelectorAll('img[src]')].filter((element) => !element.closest('a'));
      setGallery({ images: all.map((element, index) => ({ id: index, title: element.getAttribute('alt') || file.name, url: element.src })), index: Math.max(0, all.indexOf(img)) });
    }
  };

  const copyLink = () => linkUrl && copyToClipboard(linkUrl).then((ok) => ok && message.success(t('readme.linkCopied')));

  if (globallyHidden || status === 'gone') return null;

  const meta = [file?.modified && t('readme.modified', { when: formatDateTime(file.modified, locale) }), file?.by].filter(Boolean).join(' · ');

  if (mode === 'hidden') {
    return (
      <section className="rd-card is-hidden" aria-label={t('readme.label')}>
        <span className="rd-card__icon is-small"><BookIcon /></span>
        <span className="rd-bar__text">
          <strong>{file.name}</strong>
          <span>{t('readme.hiddenHere')}</span>
        </span>
        <button type="button" className="rd-pill" onClick={() => setMode('collapsed')}>
          <EyeOutlined /> {t('readme.show')}
        </button>
      </section>
    );
  }

  const action = (key, title, icon, props) => (
    <Tooltip title={title} key={key}>
      {props.href ? (
        <a className="rd-act" aria-label={title} {...props}>{icon}</a>
      ) : (
        <button type="button" className="rd-act" aria-label={title} {...props}>{icon}</button>
      )}
    </Tooltip>
  );

  const reserve = status === 'loading' ? placeholderHeight(file?.size, collapsedHeight) : null;
  const maxHeight = height !== null ? height : expanded ? 'none' : collapsedHeight;

  return (
    <section ref={card} className={`rd-card${expanded ? ' is-open' : ''}${overflows ? ' is-long' : ''}`} aria-label={t('readme.label')}>
      <header className="rd-card__head">
        <span className="rd-card__icon"><BookIcon /></span>
        <div className="rd-card__title">
          <strong title={file.name}>{file.name}</strong>
          <span>{meta || t('readme.about')}</span>
        </div>
        <div className="rd-card__actions">
          {onOpen && action('open', t('readme.open'), <ExpandOutlined />, { onClick: onOpen })}
          {onEdit && action('edit', t('readme.edit'), <EditOutlined />, { onClick: onEdit })}
          {downloadUrl && action('download', t('readme.download'), <DownloadOutlined />, { href: downloadUrl, download: file.name })}
          {linkUrl && action('link', t('readme.copyLink'), <LinkOutlined />, { onClick: copyLink })}
          {action('hide', t('readme.hide'), <EyeInvisibleOutlined />, { onClick: () => setMode('hidden') })}
        </div>
      </header>

      {status === 'large' ? (
        <div className="rd-note">
          <span>{t('readme.tooLarge', { size: formatBytes(README_MAX_BYTES) })}</span>
          {onOpen && <button type="button" className="rd-pill is-primary" onClick={onOpen}>{t('readme.open')}</button>}
        </div>
      ) : status === 'error' ? (
        <div className="rd-note">
          <span>{t('readme.failed')}</span>
          <button type="button" className="rd-pill" onClick={() => setAttempt((value) => value + 1)}>
            <ReloadOutlined /> {t('readme.retry')}
          </button>
        </div>
      ) : status === 'loading' ? (
        <div className="rd-skeleton" style={{ height: reserve }} aria-busy="true" aria-label={t('readme.loading')}>
          <span style={{ width: '42%' }} />
          <span style={{ width: '88%' }} />
          <span style={{ width: '76%' }} />
          <span style={{ width: '64%' }} />
        </div>
      ) : (
        <>
          <div
            ref={body}
            id={bodyId}
            className="rd-card__body"
            style={{ maxHeight }}
            onTransitionEnd={onTransitionEnd}
          >
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
              ref={prose}
              className="rd-prose"
              onClick={onClick}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: loaded?.html || '' }}
            />
            {!expanded && <div className="rd-fade" aria-hidden="true" />}
          </div>
          {overflows && (
            <div className="rd-card__foot">
              <button type="button" className="rd-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={() => animateTo(expanded ? 'collapsed' : 'expanded')}>
                {expanded ? t('readme.collapse') : t('readme.expand')}
                <span className="rd-toggle__chev" aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
      {gallery && (
        <Suspense fallback={null}>
          <ImageViewer images={gallery.images} index={gallery.index} onIndex={(index) => setGallery((prev) => ({ ...prev, index }))} onClose={() => setGallery(null)} src={{ file: (image) => image.url }} />
        </Suspense>
      )}
    </section>
  );
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

