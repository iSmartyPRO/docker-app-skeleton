import { useEffect, useState } from 'react';
import { App, Button, Input, Popconfirm } from 'antd';
import { AppstoreOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { remoteApi } from '../api';

/** Published RemoteApp programs of a server (RDS alias «||name» or an exe path). */
export default function AppManager({ hostId }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [apps, setApps] = useState(null);
  const [draft, setDraft] = useState({ name: '', alias: '', args: '' });

  const load = () => remoteApi.adminApps(hostId).then((res) => setApps(res.data.apps)).catch(() => setApps([]));
  useEffect(() => { if (hostId) load(); }, [hostId]);

  const add = async () => {
    if (!draft.name.trim() || !draft.alias.trim()) return;
    try {
      await remoteApi.saveApp({ hostId, name: draft.name.trim(), alias: draft.alias.trim(), args: draft.args.trim() });
      setDraft({ name: '', alias: '', args: '' });
      load();
    } catch (err) { message.error(errorMessage(err)); }
  };

  const remove = async (id) => { await remoteApi.deleteApp(id).catch((err) => message.error(errorMessage(err))); load(); };

  if (!hostId) return <p className="rm-muted">{t('remote.apps.saveFirst')}</p>;

  return (
    <div className="rm-appman">
      {apps?.length > 0 && (
        <div className="rm-appman__list">
          {apps.map((a) => (
            <div key={a.id} className="rm-appman__item">
              <AppstoreOutlined />
              <div className="rm-appman__text"><strong>{a.name}</strong><code>{a.alias}</code></div>
              <Popconfirm title={t('remote.apps.deleteConfirm')} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={() => remove(a.id)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('common.delete')} />
              </Popconfirm>
            </div>
          ))}
        </div>
      )}
      <div className="rm-appman__add">
        <Input size="small" placeholder={t('remote.apps.name')} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} style={{ flex: 1 }} />
        <Input size="small" placeholder={t('remote.apps.alias')} value={draft.alias} onChange={(e) => setDraft((d) => ({ ...d, alias: e.target.value }))} style={{ flex: 1 }} />
        <Button size="small" icon={<PlusOutlined />} onClick={add} disabled={!draft.name.trim() || !draft.alias.trim()}>{t('remote.apps.addShort')}</Button>
      </div>
      <p className="rm-muted">{t('remote.apps.aliasHint')}</p>
    </div>
  );
}
