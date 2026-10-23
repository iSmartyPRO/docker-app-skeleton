import { useEffect, useMemo, useState } from 'react';
import { Input, Select, Spin } from 'antd';
import { DatabaseOutlined, EditOutlined, KeyOutlined, LockOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { remoteApi } from '../api';
import { useRemote } from '../RemoteContext';

/**
 * Chooses where the session's credentials come from: the computer's own saved
 * credentials, an entry of the portal password manager, a Passbolt entry, or
 * typed in manually. `value` is { source, id, username, domain, password };
 * the dialog passes `value` as the session's `auth` plus manual fields.
 */
export default function CredentialPicker({ host, value, onChange, passwordOnly = false }) {
  const { t } = useLocale();
  const remote = useRemote();
  const [vault, setVault] = useState(null);
  const [resources, setResources] = useState(null);
  const [loadingRes, setLoadingRes] = useState(false);

  useEffect(() => {
    remoteApi.credentials().then((res) => setVault(res.data.credentials)).catch(() => setVault([]));
  }, []);

  // Lazy-load Passbolt entries the first time the person opens that source.
  const loadResources = () => {
    if (resources || loadingRes) return;
    setLoadingRes(true);
    remoteApi.passboltResources().then((res) => setResources(res.data.resources)).catch(() => setResources([])).finally(() => setLoadingRes(false));
  };

  const key = value.source === 'vault' ? `vault:${value.id}` : value.source === 'passbolt' ? `passbolt:${value.id}` : value.source;
  const set = (patch) => onChange({ ...value, ...patch });

  const options = useMemo(() => {
    const groups = [];
    if (host?.hasCredentials) groups.push({ label: t('remote.creds.host'), options: [{ value: 'host', label: `${t('remote.creds.hostOption')}${host.credUsername ? ` · ${host.credUsername}` : ''}` }] });
    if (vault?.length) groups.push({ label: t('remote.creds.vault'), options: vault.map((c) => ({ value: `vault:${c.id}`, label: `${c.name}${c.username ? ` · ${c.username}` : ''}${c.scope === 'personal' ? ` · ${t('remote.creds.personal')}` : ''}` })) });
    if (remote.settings.passbolt) groups.push({ label: t('remote.creds.passbolt'), options: [{ value: 'passbolt:__pick', label: t('remote.creds.passboltPick') }] });
    groups.push({ label: t('remote.creds.other'), options: [{ value: 'manual', label: t('remote.creds.manual') }] });
    return groups;
  }, [host, vault, remote.settings.passbolt, t]);

  const onSelect = (val) => {
    if (val === 'host' || val === 'manual') { set({ source: val, id: null }); return; }
    if (val.startsWith('vault:')) { set({ source: 'vault', id: Number(val.slice(6)) }); return; }
    if (val.startsWith('passbolt:')) { set({ source: 'passbolt', id: val === 'passbolt:__pick' ? null : val.slice(9) }); loadResources(); }
  };

  return (
    <div className="rm-creds-pick">
      <label className="rm-field__label">{t('remote.creds.source')}</label>
      <Select
        value={key}
        onChange={onSelect}
        options={options}
        style={{ width: '100%' }}
        suffixIcon={<KeyOutlined />}
        placeholder={t('remote.creds.choose')}
      />

      {value.source === 'passbolt' && (
        <div className="rm-creds-pick__sub">
          <label className="rm-field__label"><DatabaseOutlined /> {t('remote.creds.passboltEntry')}</label>
          {loadingRes ? <Spin size="small" /> : resources?.length ? (
            <Select
              showSearch
              optionFilterProp="label"
              value={value.id || undefined}
              placeholder={t('remote.creds.passboltChoose')}
              onChange={(id) => set({ id })}
              options={resources.map((r) => ({ value: r.id, label: `${r.name}${r.username ? ` · ${r.username}` : ''}` }))}
              style={{ width: '100%' }}
            />
          ) : (
            <p className="rm-muted">{resources ? t('remote.creds.passboltEmpty') : ''}</p>
          )}
        </div>
      )}

      {value.source === 'manual' && (
        <div className="rm-creds-pick__sub rm-creds__row">
          {!passwordOnly && <Input prefix={<EditOutlined />} placeholder={t('remote.host.credUser')} value={value.username || ''} onChange={(e) => set({ username: e.target.value })} autoComplete="off" />}
          {!passwordOnly && <Input placeholder={t('remote.host.credDomain')} value={value.domain || ''} onChange={(e) => set({ domain: e.target.value })} style={{ maxWidth: 150 }} autoComplete="off" />}
          <Input.Password prefix={<LockOutlined />} placeholder={t('remote.host.credPassword')} value={value.password || ''} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
        </div>
      )}
    </div>
  );
}

/** The initial credential choice for a host, from its saved default. */
export function defaultCredentialValue(host) {
  const def = host?.defaultCred || (host?.hasCredentials ? 'host' : 'manual');
  if (def.startsWith('vault:')) return { source: 'vault', id: Number(def.slice(6)), username: '', domain: '', password: '' };
  if (def.startsWith('passbolt:')) return { source: 'passbolt', id: def.slice(9), username: '', domain: '', password: '' };
  return { source: def || 'manual', id: null, username: '', domain: '', password: '' };
}
