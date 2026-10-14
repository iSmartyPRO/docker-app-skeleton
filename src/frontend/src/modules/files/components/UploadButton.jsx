import { useMemo, useRef } from 'react';
import { Button, Dropdown } from 'antd';
import { DownOutlined, FileAddOutlined, FolderAddOutlined, UploadOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { canPickFolders } from '../folderUpload';

/** Hidden <input webkitdirectory> that hands the picked folder's files to `onFolder`. */
function FolderInput({ inputRef, onFolder }) {
  return (
    <input
      ref={(node) => {
        inputRef.current = node;
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
  );
}

/**
 * "Upload" as a ModuleHeader action: a click picks files; the arrow offers
 * "Upload folder" where the browser can pick folders (not on iOS / Android,
 * where the plain button stays). Returns `[action, folderInputAction]` —
 * pass both in the header's `actions`.
 */
export function useUploadActions({ onPickFiles, onFolder, tooltip }) {
  const { t } = useLocale();
  const folderInput = useRef(null);
  const folders = useMemo(() => canPickFolders(), []);
  return [
    {
      key: 'upload',
      primary: true,
      icon: <UploadOutlined />,
      label: t('files.upload'),
      tooltip,
      onClick: onPickFiles,
      menu: folders
        ? [
            { key: 'files', icon: <FileAddOutlined />, label: t('folderUpload.uploadFiles'), onClick: onPickFiles },
            { key: 'folder', icon: <FolderAddOutlined />, label: <span title={t('folderUpload.uploadFolderHint')}>{t('folderUpload.uploadFolder')}</span>, onClick: () => folderInput.current?.click() },
          ]
        : null,
    },
    folders && { key: 'upload-folder-input', node: <FolderInput inputRef={folderInput} onFolder={onFolder} /> },
  ].filter(Boolean);
}

/**
 * Stand-alone "Upload" button (pages without a ModuleHeader): same menu as
 * `useUploadActions`.
 */
export default function UploadButton({ onPickFiles, onFolder }) {
  const { t } = useLocale();
  const folderInput = useRef(null);
  const folders = useMemo(() => canPickFolders(), []);
  if (!folders) {
    return (
      <Button type="primary" icon={<UploadOutlined />} onClick={onPickFiles}>
        {t('files.upload')}
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
            { key: 'files', icon: <FileAddOutlined />, label: t('folderUpload.uploadFiles'), onClick: onPickFiles },
            { key: 'folder', icon: <FolderAddOutlined />, label: <span title={t('folderUpload.uploadFolderHint')}>{t('folderUpload.uploadFolder')}</span>, onClick: () => folderInput.current?.click() },
          ],
        }}
      >
        <UploadOutlined /> {t('files.upload')}
      </Dropdown.Button>
      <FolderInput inputRef={folderInput} onFolder={onFolder} />
    </>
  );
}
