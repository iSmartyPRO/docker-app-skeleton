import { useRef, useState } from 'react';
import { Button, Progress } from 'antd';
import { CameraOutlined, FolderOpenOutlined, UploadOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { useProc } from '../ProcContext';
import { optionalComponent } from '../../../platform/optional';

// Optional links (the module may be off or not installed): provided by its register.js.
const FilePicker = optionalComponent('files', 'FilePicker');

const ACCEPT = 'image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.rtf,.txt,.zip';

/**
 * Drop files here, pick them, take a photo of the invoice with the phone's
 * camera, or choose from the Files module. `onFiles(files)` / `onNodes(nodes)`.
 */
export default function DropZone({ onFiles, onNodes, progress = null, compact = false, title, hint }) {
  const { t } = useLocale();
  const { meta } = useProc();
  const [over, setOver] = useState(false);
  const [picker, setPicker] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const take = (list) => {
    const files = [...(list || [])];
    if (files.length) onFiles(files);
  };
  return (
    <div
      className={`prc-drop${over ? ' is-over' : ''}${compact ? ' is-compact' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files);
      }}
    >
      <span className="prc-drop__icon" aria-hidden="true">🧾</span>
      <div className="prc-drop__text">
        <strong>{title || t('procurement.drop.title')}</strong>
        <span>{hint || t('procurement.drop.hint')}</span>
      </div>
      <div className="prc-drop__buttons">
        <Button icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>
          {t('procurement.drop.choose')}
        </Button>
        <Button icon={<CameraOutlined />} onClick={() => cameraRef.current?.click()} className="prc-drop__camera">
          {t('procurement.drop.camera')}
        </Button>
        {meta?.modules?.files && onNodes && (
          <Button icon={<FolderOpenOutlined />} onClick={() => setPicker(true)}>
            {t('procurement.drop.fromFiles')}
          </Button>
        )}
      </div>
      {progress !== null && <Progress percent={progress} size="small" className="prc-drop__progress" />}
      <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={(event) => { take(event.target.files); event.target.value = ''; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { take(event.target.files); event.target.value = ''; }} />
      {onNodes && (
        <FilePicker
          open={picker}
          title={t('procurement.drop.fromFiles')}
          onClose={() => setPicker(false)}
          onPick={async (nodes) => {
            await onNodes(nodes);
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}
