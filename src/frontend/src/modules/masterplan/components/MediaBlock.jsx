import { useState } from 'react';
import { App, Button, Image, Popconfirm, Upload } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { mpApi } from '../api';
import { preparePhoto, uploadMedia } from '../media/photos';

/**
 * Plans, renders and documents of a card: the object's own, or the series'
 * (shared by every object of a house project / apartment type). Uploading
 * adds a layout or a render; pictures are shrunk in the browser first.
 * target: { projectId, nodeId } | { projectId, series }.
 */
export default function MediaBlock({ title, name, hint, items, target, canEdit, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(null);
  const images = items.filter((item) => item.mime?.startsWith('image/'));
  const files = items.filter((item) => !item.mime?.startsWith('image/'));
  if (!items.length && !canEdit) return null;

  const upload = (kind) => async (file) => {
    setBusy(kind);
    try {
      const prepared = await preparePhoto(file);
      await uploadMedia(prepared, { ...target, kind: file.type === 'application/pdf' ? 'doc' : kind });
      message.success(t('mp.series.uploaded'));
      onChanged?.();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
    return false;
  };
  const remove = async (item) => {
    try {
      await mpApi.deleteMedia(item.id);
      onChanged?.();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <section className="mp-media">
      <div className="mp-media__head">
        <h4>
          {title}
          {name && <span className="mp-media__name">{name}</span>}
        </h4>
        {canEdit && (
          <span className="mp-media__add">
            <Upload accept=".png,.jpg,.jpeg,.webp,.pdf" showUploadList={false} beforeUpload={upload('layout')}>
              <Button size="small" loading={busy === 'layout'}>＋ {t('mp.series.layout')}</Button>
            </Upload>
            <Upload accept=".png,.jpg,.jpeg,.webp" showUploadList={false} beforeUpload={upload('render')}>
              <Button size="small" loading={busy === 'render'}>＋ {t('mp.series.render')}</Button>
            </Upload>
          </span>
        )}
      </div>
      {hint && <p className="mp-muted mp-small">{hint}</p>}
      {images.length > 0 && (
        <div className="mp-gallery">
          <Image.PreviewGroup>
            {images.map((item) => (
              <span key={item.id} className="mp-gallery__item">
                <Image src={item.thumbUrl || item.url} preview={{ src: item.url }} alt={item.name} width={88} height={66} />
                {item.kind === 'layout' && <em className="mp-gallery__tag">{t('mp.series.layoutShort')}</em>}
                {canEdit && (
                  <Popconfirm title={t('mp.series.deleteConfirm')} onConfirm={() => remove(item)} okText={t('common.delete')} okButtonProps={{ danger: true }} cancelText={t('common.cancel')}>
                    <button type="button" className="mp-gallery__del" aria-label={t('common.delete')}>✕</button>
                  </Popconfirm>
                )}
              </span>
            ))}
          </Image.PreviewGroup>
        </div>
      )}
      {files.map((item) => (
        <span key={item.id} className="mp-doc">
          <a href={item.url} target="_blank" rel="noreferrer">📄 {item.name}</a>
          {canEdit && (
            <Popconfirm title={t('mp.series.deleteConfirm')} onConfirm={() => remove(item)} okText={t('common.delete')} okButtonProps={{ danger: true }} cancelText={t('common.cancel')}>
              <button type="button" className="mp-gallery__del is-inline" aria-label={t('common.delete')}>✕</button>
            </Popconfirm>
          )}
        </span>
      ))}
      {!items.length && <p className="mp-muted mp-small">{t('mp.series.empty')}</p>}
    </section>
  );
}
