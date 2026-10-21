import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { qrApi } from './api';

/** Module data every page needs: templates, module settings, whether the person manages templates. */
const QrContext = createContext(null);

export function QrProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await qrApi.bootstrap();
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => {
    const templates = data?.templates || [];
    return {
      ready: Boolean(data),
      error,
      refresh,
      templates,
      activeTemplates: templates.filter((template) => template.active),
      defaultTemplate: templates.find((template) => template.isDefault && template.active) || templates.find((template) => template.active) || null,
      settings: data?.settings || { allowCustom: true, allowUploads: true, dynamic: true, maxCodes: 500 },
      canManage: Boolean(data?.canManage),
    };
  }, [data, error, refresh]);

  return <QrContext.Provider value={value}>{children}</QrContext.Provider>;
}

export function useQr() {
  return useContext(QrContext);
}
