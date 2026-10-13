import { Fragment, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useLocale } from '../context/LocaleContext';
import { deviceZone, resolveRegional, setRegional } from '../lib/datetime';
import { updateAccountProfile } from '../services/api';

/**
 * Keeps lib/datetime.js in step with the portal's region settings and the
 * person's own (time zone, date and time formats, week start), and tells the
 * server which zone this device is in (used when someone chooses "as on my
 * device" — e.g. for reminders sent by e-mail or WhatsApp).
 * A change re-mounts the page so every date on screen follows at once.
 */
export default function RegionalSync({ children }) {
  const { settings } = useSettings();
  const { user, setUser } = useAuth();
  const { locale } = useLocale();
  const regional = resolveRegional(settings?.regional || {}, user?.regional || {}, locale);
  setRegional(regional);

  const zone = deviceZone();
  useEffect(() => {
    if (!user?.id || user.impersonator || !zone || user.deviceTz === zone) return;
    updateAccountProfile({ deviceTz: zone })
      .then((res) => res.data?.user && setUser((prev) => ({ ...prev, deviceTz: res.data.user.deviceTz })))
      .catch(() => {});
  }, [user?.id, user?.deviceTz, user?.impersonator, zone, setUser]);

  return <Fragment key={`${regional.timeZone}|${regional.dateFormat}|${regional.timeFormat}|${regional.weekStart}`}>{children}</Fragment>;
}
