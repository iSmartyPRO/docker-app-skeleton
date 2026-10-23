import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { remoteApi } from '../api';

/**
 * Picks the credentials used when connecting in one click:
 * «saved here» (the target's own stored credentials), a password-manager entry,
 * or «ask each time». Value is stored as default_cred ('' | 'vault:<id>' | 'ask').
 */
export default function DefaultCredSelect({ value, onChange }) {
  const { t } = useLocale();
  const [vault, setVault] = useState([]);
  useEffect(() => { remoteApi.credentials().then((r) => setVault(r.data.credentials)).catch(() => setVault([])); }, []);

  const options = [
    { label: t('remote.connect.defaultGroup'), options: [
      { value: '', label: t('remote.connect.defaultOwn') },
      { value: 'ask', label: t('remote.connect.defaultAsk') },
    ] },
  ];
  if (vault.length) options.push({ label: t('remote.creds.vault'), options: vault.map((c) => ({ value: `vault:${c.id}`, label: `${c.name}${c.username ? ` · ${c.username}` : ''}` })) });

  return <Select value={value ?? ''} onChange={onChange} options={options} style={{ width: '100%' }} />;
}
