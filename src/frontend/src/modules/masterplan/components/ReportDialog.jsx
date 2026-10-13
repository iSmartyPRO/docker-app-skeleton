import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Alert, Button, Input, InputNumber, Modal, Progress, Select, Slider, TreeSelect } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { todayISO } from '../../../lib/datetime';
import { DateField } from '../../../components/ui/DateTimeField';
import { mpApi } from '../api';
import { useMp } from '../MpContext';
import { preparePhoto, uploadMedia } from '../media/photos';
import { conflictText } from './StatusDialog';
import { readStore, userKey, writeStore } from '../lib';

let seq = 0;

/**
 * "+ Отчёт" (spec §9.6, §10.4): objects, stage, percent, photos, comment.
 * Built for a phone: the camera button opens the camera, photos are shrunk
 * and uploaded in the background while the form is filled, with retries.
 * Only objects in the person's zone are offered (the server checks again).
 * `open` = { projectId, nodeIds? }.
 */
export default function ReportDialog({ open, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { stages } = useMp();
  const { user } = useAuth();
  const [objects, setObjects] = useState(null);
  const [selected, setSelected] = useState([]);
  const [stageId, setStageId] = useState(null);
  const [percent, setPercent] = useState(null);
  const [factDate, setFactDate] = useState(todayISO());
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const camera = useRef(null);
  const gallery = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setStageId(null);
    setPercent(null);
    setFactDate(todayISO());
    setBody('');
    setPhotos([]);
    setError(null);
    setObjects(null);
    mpApi
      .construction(open.projectId)
      .then((res) => {
        const mine = res.data.items.filter((item) => item.canReport);
        setObjects(mine);
        // From an object: that object; from «+ Отчёт»: the objects of the last report (one tap less on site).
        const wanted = (open.nodeIds || readStore(userKey(user, `report_${open.projectId}`), [])).map(Number);
        const preset = mine.filter((item) => wanted.includes(item.id) || item.path.some((id) => wanted.includes(id))).map((item) => item.id);
        setSelected(preset);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [open]);

  // Objects grouped by their parent level for the picker; checking a group takes the whole line.
  const treeData = useMemo(() => {
    const groups = new Map();
    for (const item of objects || []) {
      const key = item.parent || '—';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups].map(([parent, list]) => ({
      title: `${parent} (${list.length})`,
      value: `g:${parent}`,
      key: `g:${parent}`,
      children: list.map((item) => ({ title: `${item.code || item.name}${item.name && item.code ? ` · ${item.name}` : ''}`, value: item.id, key: item.id })),
    }));
  }, [objects]);

  const sets = useMemo(() => {
    const set = new Set();
    for (const id of selected) {
      const item = objects?.find((obj) => obj.id === id);
      if (item) set.add(item.stageSet);
    }
    return set;
  }, [selected, objects]);
  const stageSet = useMemo(() => {
    // The stage set of the chosen objects (construction list carries the type; the map knows the set).
    const first = objects?.find((obj) => selected.includes(obj.id));
    return first?.stageSet || null;
  }, [objects, selected]);
  const stageOptions = Object.entries(stages)
    .filter(([set]) => !stageSet || set === stageSet || sets.has(set))
    .flatMap(([set, list]) => list.map((stage) => ({ value: stage.id, label: stage.name, set })));

  const addFiles = async (files) => {
    const list = [...files].slice(0, Math.max(0, 30 - photos.length));
    for (const file of list) {
      const id = ++seq;
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      setPhotos((prev) => [...prev, { id, name: file.name, preview, progress: 0, state: 'prep' }]);
      (async () => {
        try {
          const prepared = await preparePhoto(file);
          setPhotos((prev) => prev.map((photo) => (photo.id === id ? { ...photo, state: 'up' } : photo)));
          const media = await uploadMedia(prepared, { projectId: open.projectId, kind: file.type.startsWith('video/') ? 'video' : 'photo' }, (progress) => setPhotos((prev) => prev.map((photo) => (photo.id === id ? { ...photo, progress } : photo))));
          setPhotos((prev) => prev.map((photo) => (photo.id === id ? { ...photo, state: 'done', progress: 1, mediaId: media.id } : photo)));
        } catch (err) {
          setPhotos((prev) => prev.map((photo) => (photo.id === id ? { ...photo, state: 'error', error: errorMessage(err) } : photo)));
        }
      })();
    }
  };

  const pending = photos.some((photo) => photo.state === 'prep' || photo.state === 'up');
  const submit = async () => {
    if (!selected.length) {
      setError(t('mp.report.chooseObjects'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await mpApi.createReport({
        projectId: open.projectId,
        nodeIds: selected,
        stageId: stageId || undefined,
        percent: percent ?? undefined,
        factDate,
        body,
        mediaIds: photos.filter((photo) => photo.mediaId).map((photo) => photo.mediaId),
      });
      writeStore(userKey(user, `report_${open.projectId}`), selected);
      message.success(res.data.report.status === 'review' ? t('mp.report.sentReview') : t('mp.report.published'));
      onClose(res.data.report);
    } catch (err) {
      setError(conflictText(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <Modal open title={t('mp.report.title')} onCancel={() => onClose(null)} className="mp-report-dlg" width={560} destroyOnClose
      footer={[
        <Button key="cancel" onClick={() => onClose(null)}>{t('common.cancel')}</Button>,
        <Button key="ok" type="primary" loading={busy} disabled={pending || !selected.length} onClick={submit}>{pending ? t('mp.report.uploading') : t('mp.report.send')}</Button>,
      ]}
    >
      {error && <Alert type="error" showIcon message={error} className="mp-dlg-alert" />}
      <div className="mp-report">
        <div className="mp-report__photos">
          <input ref={camera} type="file" accept="image/*" capture="environment" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
          <input ref={gallery} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
          <button type="button" className="mp-report__shot is-camera" onClick={() => camera.current?.click()}>
            <span aria-hidden="true">📷</span>
            {t('mp.report.camera')}
          </button>
          <button type="button" className="mp-report__shot" onClick={() => gallery.current?.click()}>
            <span aria-hidden="true">🖼️</span>
            {t('mp.report.gallery')}
          </button>
          {photos.map((photo) => (
            <div key={photo.id} className={`mp-report__thumb is-${photo.state}`} title={photo.error || photo.name}>
              {photo.preview ? <img src={photo.preview} alt="" /> : <span className="mp-report__file">🎬</span>}
              {photo.state !== 'done' && photo.state !== 'error' && <Progress type="circle" size={34} percent={Math.round((photo.progress || 0) * 100)} showInfo={false} strokeColor="#fff" trailColor="rgba(255,255,255,.3)" />}
              {photo.state === 'error' && <span className="mp-report__err">!</span>}
              <button type="button" aria-label={t('common.delete')} onClick={() => setPhotos((prev) => prev.filter((item) => item.id !== photo.id))}>×</button>
            </div>
          ))}
        </div>
        <p className="mp-report__count">{t('mp.report.photos', { n: photos.length })}</p>
        <label className="mp-ffield">
          <span>{t('mp.report.objects')}</span>
          <TreeSelect
            treeData={treeData}
            value={selected}
            onChange={(values) => setSelected(values.filter((value) => typeof value === 'number'))}
            treeCheckable
            showCheckedStrategy={TreeSelect.SHOW_CHILD}
            placeholder={objects === null ? t('common.loading') : objects.length ? t('mp.report.objectsHint') : t('mp.report.noObjects')}
            maxTagCount="responsive"
            treeDefaultExpandAll={(objects || []).length < 40}
            showSearch
            treeNodeFilterProp="title"
            style={{ width: '100%' }}
          />
        </label>
        <div className="form-grid-2">
          <label className="mp-ffield">
            <span>{t('mp.report.stage')}</span>
            <Select allowClear showSearch optionFilterProp="label" value={stageId} onChange={setStageId} options={stageOptions} placeholder={t('mp.report.stageHint')} />
          </label>
          <label className="mp-ffield">
            <span>{t('mp.report.date')}</span>
            <DateField value={factDate} onChange={(day) => setFactDate(day || todayISO())} allowClear={false} style={{ width: '100%' }} />
          </label>
        </div>
        <label className="mp-ffield">
          <span>{t('mp.report.percent')}</span>
          <div className="mp-report__percent">
            <Slider min={0} max={100} step={5} value={percent ?? 0} onChange={setPercent} disabled={!stageId} />
            <InputNumber min={0} max={100} value={percent} onChange={setPercent} disabled={!stageId} addonAfter="%" style={{ width: 110 }} />
          </div>
        </label>
        <label className="mp-ffield">
          <span>{t('mp.report.comment')}</span>
          <Input.TextArea value={body} onChange={(event) => setBody(event.target.value)} autoSize={{ minRows: 2, maxRows: 6 }} maxLength={5000} placeholder={t('mp.report.commentHint')} />
        </label>
      </div>
    </Modal>
  );
}
