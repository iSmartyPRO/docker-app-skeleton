import { useRef, useState } from 'react';
import { App, Button, Empty, Popconfirm, Tooltip } from 'antd';
import { DeleteOutlined, DownloadOutlined, FileOutlined, UploadOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate } from '../../../lib/datetime';
import { formatBytes } from '../../../lib/format';
import { empApi } from '../api';
import { empError } from '../lib';

const size = (bytes) => formatBytes(bytes);

/** «Документы» of the card (HR only): passport scans, contracts, certificates… */
export default function DocumentsPanel({ employee, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const docs = employee.documents || [];
  const upload = async (files) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const res = await empApi.uploadDocuments(employee.id, files);
      onChanged(res.data);
      message.success(t('emp.docs.uploaded', { n: files.length }));
    } catch (err) {
      message.error(empError(err, t));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async (doc) => {
    try {
      const res = await empApi.removeDocument(doc.id);
      onChanged(res.data);
    } catch (err) {
      message.error(empError(err, t));
    }
  };
  return (
    <div className="emp-docs">
      <div className="emp-tabbar">
        <Button icon={<UploadOutlined />} loading={busy} onClick={() => input.current?.click()}>
          {t('emp.docs.upload')}
        </Button>
        <span className="emp-muted">{t('emp.docs.hint')}</span>
        <input ref={input} type="file" multiple hidden onChange={(event) => upload([...event.target.files])} accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.odt,.ods,.rtf,.txt,.csv,.heic" />
      </div>
      {docs.length ? (
        <ul className="emp-docs__list">
          {docs.map((doc) => (
            <li key={doc.id}>
              <FileOutlined className="emp-docs__icon" />
              <a href={empApi.documentUrl(doc.id)} target="_blank" rel="noreferrer" className="emp-docs__name">
                {doc.name}
              </a>
              <span className="emp-muted">
                {size(doc.size)} · {fmtDate(doc.createdAt)}
              </span>
              <Tooltip title={t('emp.docs.download')}>
                <Button size="small" type="text" href={empApi.documentUrl(doc.id, true)} icon={<DownloadOutlined />} aria-label={t('emp.docs.download')} />
              </Tooltip>
              <Popconfirm title={t('emp.docs.removeConfirm')} okText={t('common.delete')} cancelText={t('common.cancel')} onConfirm={() => remove(doc)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('common.delete')} />
              </Popconfirm>
            </li>
          ))}
        </ul>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('emp.docs.empty')} />
      )}
    </div>
  );
}
