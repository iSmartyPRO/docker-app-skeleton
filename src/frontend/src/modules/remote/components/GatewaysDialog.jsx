import { useEffect, useState } from 'react';
import { App, Button, Input, InputNumber, Modal, Popconfirm } from 'antd';
import { DeleteOutlined, PlusOutlined, SafetyOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { remoteApi } from '../api';
import { useRemote } from '../RemoteContext';

/** Manage the named RD Gateways applications can use (admin). */
export default function GatewaysDialog({ open, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const remote = useRemote();
  const [list, setList] = useState(null);
  const [draft, setDraft] = useState({ name: '', host: '', port: 443 });

  const load = () => remoteApi.gateways().then((res) => setList(res.data.gateways)).catch(() => setList([]));
  useEffect(() => { if (open) load(); }, [open]);

  const add = async () => {
    if (!draft.host.trim()) return;
    try { await remoteApi.saveGateway({ name: draft.name.trim() || draft.host.trim(), host: draft.host.trim(), port: draft.port }); setDraft({ name: '', host: '', port: 443 }); load(); remote.refresh(); }
    catch (err) { message.error(errorMessage(err)); }
  };
  const remove = async (g) => { try { await remoteApi.deleteGateway(g.id); load(); remote.refresh(); } catch (err) { message.error(errorMessage(err)); } };

  return (
    <Modal open={open} onCancel={onClose} footer={[<Button key="c" type="primary" onClick={onClose}>{t('common.close')}</Button>]} title={t('remote.gateways.title')} width={480} destroyOnHidden>
      <p className="rm-muted">{t('remote.gateways.lead')}</p>
      <div className="rm-folder-list">
        {list?.map((g) => (
          <div key={g.id} className="rm-folder-row">
            <SafetyOutlined />
            <span className="rm-folder-row__name"><strong>{g.name}</strong> <code>{g.host}:{g.port}</code></span>
            <Popconfirm title={t('remote.gateways.deleteConfirm')} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={() => remove(g)}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('common.delete')} />
            </Popconfirm>
          </div>
        ))}
      </div>
      <div className="rm-gateway-add">
        <Input placeholder={t('remote.gateways.name')} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <Input placeholder={t('remote.gateways.host')} value={draft.host} onChange={(e) => setDraft((d) => ({ ...d, host: e.target.value }))} />
        <InputNumber min={1} max={65535} value={draft.port} onChange={(port) => setDraft((d) => ({ ...d, port }))} style={{ width: 90 }} />
        <Button icon={<PlusOutlined />} onClick={add} disabled={!draft.host.trim()}>{t('remote.gateways.add')}</Button>
      </div>
    </Modal>
  );
}
