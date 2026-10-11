import { useEffect, useState } from 'react';
import { App, InputNumber, Switch } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { consoleApi } from '../client';
import { Hint } from '../../help/Hint';

const HINTS = { webhooksPrivate: 'api.privateNetwork' };

const SWITCHES = ['enabled', 'personalTokens', 'docsPublic', 'webhooks', 'webhooksPrivate'];
const LABEL = { enabled: 'enabled', personalTokens: 'personalTokens', docsPublic: 'docsPublic', webhooks: 'webhooks', webhooksPrivate: 'private' };

export default function ApiSettings({ config, setOverview }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(config), [config]);
  if (!draft) return <div className="ax-skeleton" />;
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const save = async () => {
    setSaving(true);
    try {
      const res = await consoleApi.saveConfig(draft);
      setOverview((prev) => ({ ...prev, config: res.data.config }));
      message.success(t('api.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const row = (key, control) => (
    <div className="ax-setting" key={key}>
      <div>
        <strong>
          {t(`api.settings.${LABEL[key] || key}`)}
          {HINTS[key] && <Hint id={HINTS[key]} />}
        </strong>
        <p>{t(`api.settings.${LABEL[key] || key}Desc`)}</p>
      </div>
      {control}
    </div>
  );
  return (
    <div className="ax-settings">
      <section className="ax-card">
        {SWITCHES.slice(0, 3).map((key) => row(key, <Switch checked={draft[key]} onChange={(value) => set({ [key]: value })} />))}
      </section>
      <section className="ax-card">
        {row('maxLifetime', <InputNumber min={0} max={3650} value={draft.maxLifetimeDays} onChange={(value) => set({ maxLifetimeDays: value ?? 0 })} addonAfter={t('api.settings.days')} />)}
        {row('defaultRate', <InputNumber min={1} max={100000} value={draft.defaultRateLimit} onChange={(value) => set({ defaultRateLimit: value ?? 120 })} addonAfter={t('api.editor.perMinute')} />)}
        {row('retention', <InputNumber min={1} max={365} value={draft.logRetentionDays} onChange={(value) => set({ logRetentionDays: value ?? 30 })} addonAfter={t('api.settings.days')} />)}
      </section>
      <section className="ax-card">
        {SWITCHES.slice(3).map((key) => row(key, <Switch checked={draft[key]} onChange={(value) => set({ [key]: value })} disabled={key === 'webhooksPrivate' && !draft.webhooks} />))}
      </section>
      <SaveBar visible={dirty} saving={saving} onSave={save} onReset={() => setDraft(config)} />
    </div>
  );
}
