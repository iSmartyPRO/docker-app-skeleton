import { useState } from 'react';
import { App, Alert, Button, Input, Modal, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { remoteApi } from '../api';

/** Import an RDWeb .rdp file → an RDS server (with its gateway) and a RemoteApp. */
export default function RdpImportDialog({ open, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => { setText(''); setResult(null); };

  const run = async (rdp) => {
    setBusy(true);
    try {
      const res = await remoteApi.importRdp(rdp);
      setResult(res.data);
      message.success(t('remote.rdp.done'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => { reset(); onClose(result ? true : false); }}
      title={t('remote.rdp.title')}
      footer={result ? [<Button key="c" type="primary" onClick={() => { reset(); onClose(true); }}>{t('common.close')}</Button>] : [
        <Button key="x" onClick={() => onClose(false)}>{t('common.cancel')}</Button>,
        <Button key="go" type="primary" loading={busy} disabled={!text.trim()} onClick={() => run(text)}>{t('remote.rdp.import')}</Button>,
      ]}
      width={560}
      destroyOnHidden
    >
      {result ? (
        <Alert
          type="success"
          showIcon
          message={t('remote.rdp.created')}
          description={
            <div>
              <div><strong>{result.host.name}</strong> · {result.host.address}{result.host.gatewayHost ? ` · ${t('remote.rdp.viaGateway', { gw: result.host.gatewayHost })}` : ''}</div>
              {result.app && <div>{t('remote.rdp.app')}: <strong>{result.app.name}</strong> (<code>{result.app.alias}</code>)</div>}
            </div>
          }
        />
      ) : (
        <>
          <p className="rm-muted">{t('remote.rdp.lead')}</p>
          <Upload.Dragger
            accept=".rdp"
            showUploadList={false}
            beforeUpload={(file) => { const r = new FileReader(); r.onload = (e) => run(String(e.target.result)); r.readAsText(file); return false; }}
            style={{ marginBottom: 12 }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">{t('remote.rdp.drop')}</p>
          </Upload.Dragger>
          <p className="rm-muted">{t('remote.rdp.orPaste')}</p>
          <Input.TextArea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="full address:s:RDS...&#10;remoteapplicationprogram:s:||app" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
        </>
      )}
    </Modal>
  );
}
