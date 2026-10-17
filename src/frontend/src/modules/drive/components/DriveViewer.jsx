import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Modal, Spin, Tooltip } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import DocumentViewer, { ImageViewer } from '../../kb/viewers/DocumentViewer';
import Markdown from '../../kb/viewers/Markdown';
import { CAD, EDITABLE, IMAGE, asViewerItem, copyText, driveApi, formatBytes } from '../api';
import { EntryIcon } from './EntryList';
import '../../kb/kb.css';
import '../../files/files.css';
import '../drive.css';

const CadViewer = lazy(() => import('./CadViewer'));

const isImage = (entry) => !entry.dir && (IMAGE.has(entry.ext) || entry.ext === 'svg');

/** Markdown and plain text, edited in place on the file server. */
function TextEditor({ entry, src, shareId, onSaved, onCancel }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const [text, setText] = useState(null);
  const [original, setOriginal] = useState('');
  const [mode, setMode] = useState(entry.ext === 'md' ? 'split' : 'write');
  const [saving, setSaving] = useState(false);
  const mtime = useRef(entry.mtime);

  useEffect(() => {
    fetch(src.file(entry), { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => res.text())
      .then((body) => {
        setText(body);
        setOriginal(body);
      })
      .catch(() => setText(''));
  }, [entry, src]);

  const save = useCallback(
    async (force = false) => {
      setSaving(true);
      try {
        const { data } = await driveApi.saveText(shareId, entry.path, text, force ? undefined : mtime.current);
        mtime.current = data.entry.mtime;
        setOriginal(text);
        message.success(t('drive.saved'));
        onSaved?.(data.entry);
      } catch (err) {
        if (err?.response?.data?.code === 'CHANGED') {
          modal.confirm({
            title: t('drive.changedTitle'),
            content: t('drive.changedText'),
            okText: t('drive.overwrite'),
            okButtonProps: { danger: true },
            cancelText: t('common.cancel'),
            onOk: () => save(true),
          });
        } else {
          message.error(errorMessage(err));
        }
      } finally {
        setSaving(false);
      }
    },
    [entry.path, message, modal, onSaved, shareId, t, text]
  );

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (text !== original) save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, text, original]);

  if (text === null) return <div className="viewer-loading"><Spin /></div>;
  const dirty = text !== original;
  return (
    <div className="dv-editor">
      <div className="dv-editor__bar">
        {entry.ext === 'md' && (
          <Segmented
            size="small"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'write', label: t('kb.write') },
              { value: 'split', label: t('kb.split') },
              { value: 'preview', label: t('kb.preview') },
            ]}
          />
        )}
        <span className="dv-editor__state">{dirty ? t('drive.unsaved') : t('drive.allSaved')}</span>
        <span className="cadv__grow" />
        <Button size="small" onClick={() => (dirty ? modal.confirm({ title: t('drive.discardTitle'), okText: t('drive.discard'), cancelText: t('common.cancel'), onOk: onCancel }) : onCancel())}>
          {t('drive.closeEditor')}
        </Button>
        <Button size="small" type="primary" disabled={!dirty} loading={saving} onClick={() => save()}>
          {t('common.save')} <kbd className="dv-kbd">Ctrl S</kbd>
        </Button>
      </div>
      <div className={`dv-editor__body is-${mode}`}>
        {mode !== 'preview' && (
          <textarea className={`dv-editor__text${entry.ext === 'md' ? '' : ' is-mono'}`} value={text} onChange={(event) => setText(event.target.value)} spellCheck={entry.ext === 'md'} autoFocus />
        )}
        {entry.ext === 'md' && mode !== 'write' && (
          <div className="dv-editor__preview">
            <Markdown text={text} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The file itself: a header with its name and actions, and the best viewer —
 * drawings in the CAD viewer, Markdown / text with an editor, everything else
 * in the document viewers (PDF, Word, Excel, Office via conversion, media).
 * Used both in the modal and on the file's own page (`lead` / `onClose`).
 */
export function DriveFileView({ entry, src, shareId, unc, conversion, canEdit, startEditing = false, onChanged, onShare, onEditing, lead, extra, onClose }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [editing, setEditingState] = useState(false);
  const [current, setCurrent] = useState(entry);
  const setEditing = useCallback(
    (value) => {
      setEditingState(value);
      onEditing?.(value);
    },
    [onEditing]
  );
  // `startEditing`: opened with "Edit" (a folder's README card) — straight into the text editor.
  useEffect(() => {
    setCurrent(entry);
    setEditing(Boolean(startEditing && canEdit && entry && EDITABLE.has(entry.ext)));
  }, [entry, setEditing, startEditing, canEdit]);

  if (!current) return null;

  const download = src.canDownload ? src.file(current, { download: true }) : null;
  let body;
  if (editing) {
    body = (
      <TextEditor
        entry={current}
        src={src}
        shareId={shareId}
        onSaved={(saved) => {
          setCurrent((prev) => ({ ...prev, ...saved }));
          onChanged?.();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  } else if (CAD.has(current.ext)) {
    body = (
      <Suspense fallback={<div className="viewer-loading"><Spin /></div>}>
        <CadViewer url={src.cad(current)} name={current.name} downloadUrl={download} />
      </Suspense>
    );
  } else {
    body = <DocumentViewer key={`${current.path}:${current.mtime}`} item={asViewerItem(current)} src={src} conversion={conversion} />;
  }

  return (
    <>
      <div className="fs-viewer__head">
        {lead}
        <EntryIcon entry={current} size={30} />
        <div className="fs-viewer__title">
          <strong title={current.name}>{current.name}</strong>
          <span>
            {formatBytes(current.size)}
            {current.mtime && ` · ${formatDateTime(current.mtime, locale)}`}
          </span>
        </div>
        {extra}
        {canEdit && EDITABLE.has(current.ext) && !editing && (
          <Button onClick={() => setEditing(true)}>✎ {t('drive.edit')}</Button>
        )}
        {onShare && !editing && <Button onClick={() => onShare(current)}>{t('drive.shareLink')}</Button>}
        {unc && (
          <Tooltip title={unc}>
            <Button onClick={() => copyText(unc).then(() => message.success(t('drive.pathCopied')))}>⧉ {t('drive.copyPathShort')}</Button>
          </Tooltip>
        )}
        {download && !editing && <Button type="primary" href={download}>⤓ {t('kb.download')}</Button>}
        {onClose && <Button type="text" onClick={onClose} aria-label={t('common.close')}>✕</Button>}
      </div>
      <div className={`fs-viewer__body kb-viewer kb-viewer--file${editing ? ' is-editing' : ''}`}>{body}</div>
    </>
  );
}

/**
 * Opens a drive file over the folder: images in the lightbox (with the
 * folder's other images), everything else in a modal with DriveFileView.
 */
export default function DriveViewer({ entry, siblings = [], src, onNavigate, onClose, ...props }) {
  const [editing, setEditing] = useState(false);
  if (!entry) return null;

  if (isImage(entry)) {
    const images = siblings.filter(isImage).map(asViewerItem);
    const index = Math.max(0, images.findIndex((image) => image.path === entry.path));
    return (
      <ImageViewer
        images={images.length ? images : [asViewerItem(entry)]}
        index={index}
        onIndex={(next) => onNavigate?.(images[next])}
        onClose={onClose}
        src={src}
        canDownload={src.canDownload}
      />
    );
  }

  return (
    <Modal open onCancel={onClose} footer={null} width="min(1280px, 100vw)" className="fs-viewer dv-viewer" destroyOnHidden closable={false} keyboard={!editing}>
      <DriveFileView entry={entry} src={src} onClose={onClose} onEditing={setEditing} {...props} />
    </Modal>
  );
}
