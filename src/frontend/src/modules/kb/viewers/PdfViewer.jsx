import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, InputNumber, Select, Spin, Tooltip } from 'antd';
import Segmented from '../../../components/ui/Segmented';
// The legacy build bundles polyfills (Uint8Array#toHex, Promise.withResolvers…)
// so documents open in browsers that are a few versions behind as well.
import { GlobalWorkerOptions, TextLayer, getDocument } from 'pdfjs-dist/legacy/build/pdf.min.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { useLocale } from '../../../context/LocaleContext';
import PdfSlides, { Thumb } from './PdfSlides';
import './pdf-text-layer.css';

// The query busts browser caches that kept the worker from when it was served
// with a wrong MIME type (the file name alone is content-hashed and unchanged).
GlobalWorkerOptions.workerSrc = `${workerUrl}?m=1`;

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const GAP = 16;

/** One page: placeholder until near the viewport, then canvas + selectable text. */
function PdfPage({ doc, number, scale, size, registerRef, visible }) {
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const [rendered, setRendered] = useState(null);

  useEffect(() => {
    if (!visible || rendered === scale) return undefined;
    let cancelled = false;
    let task;
    let textLayer;
    (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      task = page.render({
        canvas,
        canvasContext: canvas.getContext('2d'),
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
      });
      await task.promise;
      if (cancelled) return;
      const container = textRef.current;
      container.replaceChildren();
      textLayer = new TextLayer({ textContentSource: page.streamTextContent(), container, viewport });
      await textLayer.render();
      if (!cancelled) setRendered(scale);
    })().catch(() => {});
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [doc, number, scale, visible, rendered]);

  return (
    <div
      ref={(node) => registerRef(number, node)}
      data-page={number}
      className={`pdfv-page${rendered !== null ? ' is-ready' : ''}`}
      style={{ width: size.width * scale, height: size.height * scale, '--total-scale-factor': scale }}
    >
      <canvas ref={canvasRef} />
      <div ref={textRef} className="textLayer" />
      {rendered === null && <div className="pdfv-page__loading"><Spin size="small" /></div>}
    </div>
  );
}

/**
 * PDF viewer on pdf.js: lazy page rendering, selectable text, thumbnails,
 * fit-to-width / fit-to-page zoom, page jump, keyboard and full screen —
 * plus slides (one page at a time) and a full-screen presentation.
 */
export default function PdfViewer({ url, downloadUrl, title }) {
  const { t } = useLocale();
  const shellRef = useRef(null);
  const scrollRef = useRef(null);
  const pageRefs = useRef(new Map());
  const [doc, setDoc] = useState(null);
  const [sizes, setSizes] = useState([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [zoom, setZoom] = useState('width');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [current, setCurrent] = useState(1);
  const [visible, setVisible] = useState(() => new Set([1, 2]));
  const [thumbs, setThumbs] = useState(() => window.innerWidth > 900);
  // 'scroll' (all pages) or 'slides'; landscape documents (decks) start as slides.
  const [mode, setMode] = useState(null);
  const [presenting, setPresenting] = useState(false);
  const slidesView = mode === 'slides' || presenting;

  useEffect(() => {
    let destroyed = false;
    const task = getDocument({
      url,
      withCredentials: true,
      isEvalSupported: false,
      wasmUrl: '/pdfjs/wasm/',
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
    });
    task.onProgress = ({ loaded, total }) => total && setProgress(Math.round((loaded / total) * 100));
    task.promise
      .then(async (pdf) => {
        if (destroyed) return;
        const list = [];
        for (let n = 1; n <= pdf.numPages; n += 1) {
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: 1 });
          list.push({ width: viewport.width, height: viewport.height });
        }
        if (!destroyed) {
          setSizes(list);
          setMode((value) => value || (list.length > 1 && list.every((size) => size.width > size.height * 1.1) ? 'slides' : 'scroll'));
          setDoc(pdf);
        }
      })
      .catch((err) => !destroyed && setError(err?.message || 'PDF error'));
    return () => {
      destroyed = true;
      task.destroy();
    };
  }, [url]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
      setHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [doc, slidesView]);

  const scale = useMemo(() => {
    const first = sizes[0];
    if (!first || !width) return 1;
    if (zoom === 'width') return Math.max(0.3, (width - 48) / first.width);
    if (zoom === 'page') return Math.max(0.3, Math.min((width - 48) / first.width, (height - 32) / first.height));
    return zoom;
  }, [zoom, sizes, width, height]);

  const registerRef = useCallback((number, node) => {
    if (node) pageRefs.current.set(number, node);
    else pageRefs.current.delete(number);
  }, []);

  // Which pages to render (near the viewport) and which one is current.
  useEffect(() => {
    if (!doc) return undefined;
    const root = scrollRef.current;
    const near = new IntersectionObserver(
      (entries) =>
        setVisible((prev) => {
          const next = new Set(prev);
          entries.forEach((entry) => entry.isIntersecting && next.add(Number(entry.target.dataset.page)));
          return next.size === prev.size ? prev : next;
        }),
      { root, rootMargin: '1200px 0px' }
    );
    const middle = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setCurrent(Number(hit.target.dataset.page));
      },
      { root, rootMargin: '-45% 0px -45% 0px' }
    );
    pageRefs.current.forEach((node) => {
      near.observe(node);
      middle.observe(node);
    });
    return () => {
      near.disconnect();
      middle.disconnect();
    };
  }, [doc, scale, slidesView]);

  // Back from slides to pages: show the page the slides ended on.
  useEffect(() => {
    if (!doc || slidesView) return;
    setVisible((prev) => (prev.has(current) ? prev : new Set([...prev, current])));
    requestAnimationFrame(() => pageRefs.current.get(current)?.scrollIntoView({ block: 'start' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slidesView, doc]);

  const goTo = (number) => {
    const target = Math.min(Math.max(1, number), sizes.length);
    if (slidesView) setCurrent(target);
    else pageRefs.current.get(target)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const step = (direction) => {
    const numeric = typeof zoom === 'number' ? zoom : scale;
    const next = direction > 0 ? ZOOMS.find((value) => value > numeric + 0.01) : [...ZOOMS].reverse().find((value) => value < numeric - 0.01);
    if (next) setZoom(next);
  };

  useEffect(() => {
    const onKey = (event) => {
      if (slidesView || event.target.closest?.('input, textarea')) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        step(1);
      } else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault();
        step(-1);
      } else if (event.key === 'PageDown') goTo(current + 1);
      else if (event.key === 'PageUp') goTo(current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else shellRef.current?.requestFullscreen?.();
  };

  if (error) {
    return (
      <div className="viewer-empty">
        <strong>{t('kb.viewer.pdfError')}</strong>
        <span>{error}</span>
        {downloadUrl && <a className="ant-btn" href={downloadUrl}>{t('kb.download')}</a>}
      </div>
    );
  }

  return (
    <div className="pdfv" ref={shellRef}>
      <div className="pdfv-bar">
        {!slidesView && (
          <>
            <Tooltip title={t('kb.viewer.thumbnails')}>
              <Button type="text" onClick={() => setThumbs((value) => !value)} className={thumbs ? 'is-on' : ''}>☰</Button>
            </Tooltip>
            <span className="pdfv-bar__sep" />
          </>
        )}
        <Button type="text" onClick={() => goTo(current - 1)} disabled={current <= 1}>‹</Button>
        <span className="pdfv-bar__page">
          <InputNumber size="small" min={1} max={sizes.length || 1} value={current} onChange={(value) => value && goTo(value)} controls={false} />
          <span>/ {sizes.length || '…'}</span>
        </span>
        <Button type="text" onClick={() => goTo(current + 1)} disabled={current >= sizes.length}>›</Button>
        {!slidesView && (
          <>
            <span className="pdfv-bar__sep" />
            <Button type="text" onClick={() => step(-1)}>−</Button>
            <Select
              size="small"
              variant="borderless"
              value={zoom}
              onChange={setZoom}
              popupMatchSelectWidth={false}
              className="pdfv-bar__zoom"
              options={[
                { value: 'width', label: t('kb.viewer.fitWidth') },
                { value: 'page', label: t('kb.viewer.fitPage') },
                ...ZOOMS.map((value) => ({ value, label: `${Math.round(value * 100)}%` })),
              ]}
              labelRender={() => `${Math.round(scale * 100)}%`}
            />
            <Button type="text" onClick={() => step(1)}>+</Button>
          </>
        )}
        <span className="pdfv-bar__grow" title={title} />
        {sizes.length > 1 && (
          <Segmented
            size="small"
            className="pdfv-bar__mode"
            value={mode || 'scroll'}
            onChange={setMode}
            options={[
              { value: 'scroll', label: t('kb.viewer.viewScroll') },
              { value: 'slides', label: t('kb.viewer.viewSlides') },
            ]}
          />
        )}
        {/* In slides the bar under the slide has its own, larger button. */}
        {!slidesView && (
          <Tooltip title={t('kb.viewer.presentHint')}>
            <Button type="text" className="pdfv-bar__present" onClick={() => setPresenting(true)} disabled={!doc}>
              ▶ <span>{t('kb.viewer.present')}</span>
            </Button>
          </Tooltip>
        )}
        {!slidesView && (
          <Tooltip title={t('kb.viewer.fullscreen')}>
            <Button type="text" onClick={fullscreen}>⤢</Button>
          </Tooltip>
        )}
        {downloadUrl && (
          <Tooltip title={t('kb.download')}>
            <Button type="text" href={downloadUrl}>⤓</Button>
          </Tooltip>
        )}
      </div>
      {doc && slidesView ? (
        <div className="pdfv-body">
          <PdfSlides
            doc={doc}
            sizes={sizes}
            page={current}
            onPage={setCurrent}
            presenting={presenting}
            onPresent={() => setPresenting(true)}
            onExit={() => setPresenting(false)}
          />
        </div>
      ) : (
        <div className="pdfv-body">
          {thumbs && doc && (
            <div className="pdfv-thumbs">
              {sizes.map((_, index) => (
                <Thumb key={index + 1} doc={doc} number={index + 1} active={current === index + 1} onClick={() => goTo(index + 1)} />
              ))}
            </div>
          )}
          <div className="pdfv-scroll" ref={scrollRef}>
            {!doc ? (
              <div className="viewer-loading">
                <Spin />
                <span>{progress ? `${progress}%` : t('kb.viewer.loading')}</span>
              </div>
            ) : (
              <div className="pdfv-pages" style={{ gap: GAP }}>
                {sizes.map((size, index) => (
                  <PdfPage
                    key={index + 1}
                    doc={doc}
                    number={index + 1}
                    size={size}
                    scale={scale}
                    registerRef={registerRef}
                    visible={visible.has(index + 1)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
