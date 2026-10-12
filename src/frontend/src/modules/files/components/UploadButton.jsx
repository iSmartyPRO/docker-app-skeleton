import { useMemo, useRef } from 'react';
import { Button, Dropdown } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { canPickFolders } from '../folderUpload';

/**
 * "Upload" for Files and Drive: a click picks files (as always); the arrow
 * offers "Upload folder" where the browser can pick folders (not on iOS /
 * Android, where the plain button stays).
 */
export default function UploadButton({ onPickFiles, onFolder }) {
  const { t } = useLocale();
  const folderInput = useRef(null);
  const folders = useMemo(() => canPickFolders(), []);
  if (!folders) {
    return (
      <Button type="primary" onClick={onPickFiles}>
        ⤒ {t('files.upload')}
      </Button>
    );
  }
  return (
    <>
      <Dropdown.Button
        type="primary"
        className="fs-upload-btn"
        onClick={onPickFiles}
        icon={<DownOutlined />}
        menu={{
          items: [
            { key: 'files', label: t('folderUpload.uploadFiles'), onClick: onPickFiles },
            { key: 'folder', label: <span title={t('folderUpload.uploadFolderHint')}>📁 {t('folderUpload.uploadFolder')}</span>, onClick: () => folderInput.current?.click() },
          ],
        }}
      >
        ⤒ {t('files.upload')}
      </Dropdown.Button>
      <input
        ref={(node) => {
          folderInput.current = node;
          if (node) {
            node.setAttribute('webkitdirectory', '');
            node.setAttribute('directory', '');
          }
        }}
        type="file"
        multiple
        hidden
        data-testid="folder-input"
        onChange={(event) => {
          const files = [...event.target.files];
          event.target.value = '';
          onFolder(files);
        }}
      />
    </>
  );
}
