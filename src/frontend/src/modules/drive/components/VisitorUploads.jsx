import { useCallback, useRef, useState } from 'react';
import { Button, Progress, Tooltip } from 'antd';
import { CheckCircleFilled, CloseOutlined, ExclamationCircleFilled, MinusCircleOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { formatBytes } from '../api';
import { EntryIcon } from './EntryList';

/*
 * Uploads of a public-link visitor: a queue with one row per file (progress,
 * cancel, result), three at a time. `send(item, { signal, onProgress })`
 * performs one upload and resolves with the server's answer.
 */

const PARALLEL = 3;
let seq = 0;

export function useVisitorQueue(send, { onSettled } = {}) {
  const [items, setItems] = useState([]);
  const queue = useRef([]);
  const running = useRef(0);
  const controllers = useRef(new Map());
  const sendRef = useRef(send);
  sendRef.current = send;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const patch = (key, changes) => setItems((list) => list.map((item) => (item.key === key ? { ...item, ...changes } : item)));

  const pump = useCallback(() => {
    while (running.current < PARALLEL && queue.current.length) {
      const item = queue.current.shift();
      running.current += 1;
      const controller = new AbortController();
      controllers.current.set(item.key, controller);
      patch(item.key, { status: 'uploading' });
      sendRef
        .current(item, { signal: controller.signal, onProgress: (progress) => patch(item.key, { progress }) })
        .then((result) => patch(item.key, { status: 'done', progress: 1, result }))
        .catch((err) => {
          if (controller.signal.aborted) patch(item.key, { status: 'cancelled' });
          else patch(item.key, { status: 'error', error: err });
        })
        .finally(() => {
          controllers.current.delete(item.key);
          running.current -= 1;
          if (!running.current && !queue.current.length) settledRef.current?.();
          pump();
        });
    }
  }, []);

  /** Adds files: [{ file, folder, conflict, kind, path, error }] (`error` = refused before sending). */
  const add = useCallback(
    (entries) => {
      const fresh = entries.map((entry) => ({ key: `u${(seq += 1)}`, name: entry.file.name, size: entry.file.size, progress: 0, status: entry.error ? 'error' : 'queued', ...entry }));
      setItems((list) => [...list, ...fresh].slice(-500));
      queue.current.push(...fresh.filter((item) => item.status === 'queued'));
      pump();
    },
    [pump]
  );

  const cancel = useCallback((key) => {
    const index = queue.current.findIndex((item) => item.key === key);
    if (index >= 0) {
      queue.current.splice(index, 1);
      patch(key, { status: 'cancelled' });
      return;
    }
    controllers.current.get(key)?.abort();
  }, []);

  const cancelAll = useCallback(() => {
    for (const item of queue.current) patch(item.key, { status: 'cancelled' });
    queue.current = [];
    for (const controller of controllers.current.values()) controller.abort();
  }, []);

  const clear = useCallback(() => setItems((list) => list.filter((item) => item.status === 'uploading' || item.status === 'queued')), []);

  return { items, add, cancel, cancelAll, clear, busy: items.some((item) => item.status === 'uploading' || item.status === 'queued') };
}

const ext = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

/** The queue as a list (inline on the page). */
export function VisitorUploadList({ queue, describe, title }) {
  const { t } = useLocale();
  const { items, cancel, cancelAll, clear, busy } = queue;
  if (!items.length) return null;
  const done = items.filter((item) => item.status === 'done').length;
  const failed = items.filter((item) => item.status === 'error').length;
  const total = items.reduce((sum, item) => sum + (item.size || 0), 0);
  const sent = items.reduce((sum, item) => sum + (item.status === 'done' ? item.size : item.status === 'uploading' ? (item.size || 0) * (item.progress || 0) : 0), 0);
  return (
    <section className="dv-vq" data-testid="visitor-uploads" aria-live="polite">
      <header className="dv-vq__head">
        <div>
          <strong>{title || (busy ? t('drive.public.uploading') : t('drive.public.uploadedTitle'))}</strong>
          <span>
            {t('drive.public.uploadSummary', { done, total: items.length })}
            {total > 0 && ` · ${formatBytes(sent)} / ${formatBytes(total)}`}
            {failed > 0 && ` · ${t('drive.public.failedN', { n: failed })}`}
          </span>
        </div>
        {busy ? (
          <Button size="small" onClick={cancelAll}>{t('drive.public.cancelAll')}</Button>
        ) : (
          <Button size="small" type="text" onClick={clear}>{t('drive.public.clearList')}</Button>
        )}
      </header>
      {busy && total > 0 && <Progress percent={Math.round((sent / total) * 100)} showInfo={false} size="small" className="dv-vq__total" />}
      <ul className="dv-vq__list">
        {items
          .slice()
          .reverse()
          .slice(0, 200)
          .map((item) => (
            <li key={item.key} className={`dv-vq__row is-${item.status}`} data-testid="visitor-upload-row">
              <EntryIcon entry={{ dir: false, ext: ext(item.name) }} size={28} />
              <div className="dv-vq__main">
                <span className="dv-vq__name" title={item.path || item.name}>
                  {item.result?.entry?.name && item.result.entry.name !== item.name ? (
                    <>
                      {item.result.entry.name} <em>{t('drive.public.renamedFrom', { name: item.name })}</em>
                    </>
                  ) : (
                    item.path || item.name
                  )}
                </span>
                {item.status === 'uploading' || item.status === 'queued' ? (
                  <Progress percent={Math.round((item.progress || 0) * 100)} size="small" status="active" showInfo={false} />
                ) : (
                  <span className="dv-vq__meta">
                    {item.status === 'error' ? describe(item.error) : item.status === 'cancelled' ? t('drive.public.cancelled') : item.kind === 'replace' ? t('drive.public.replacedOk', { size: formatBytes(item.size) }) : formatBytes(item.size)}
                  </span>
                )}
              </div>
              <span className="dv-vq__state">
                {item.status === 'done' && <CheckCircleFilled className="is-ok" aria-label={t('drive.public.done')} />}
                {item.status === 'error' && <ExclamationCircleFilled className="is-err" aria-label={t('drive.public.failed')} />}
                {item.status === 'cancelled' && <MinusCircleOutlined aria-label={t('drive.public.cancelled')} />}
                {(item.status === 'uploading' || item.status === 'queued') && (
                  <Tooltip title={t('drive.public.cancel')}>
                    <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => cancel(item.key)} aria-label={t('drive.public.cancel')} />
                  </Tooltip>
                )}
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
}
