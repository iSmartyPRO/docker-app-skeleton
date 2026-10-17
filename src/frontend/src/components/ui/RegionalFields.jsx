import { useMemo } from 'react';
import { Select } from 'antd';
import Segmented from './Segmented';
import { useLocale } from '../../context/LocaleContext';
import { DATE_FORMATS, deviceZone, fmtDate, fmtDateTime, fmtTime, resolveRegional, zoneLabel, zoneName, zoneOptions } from '../../lib/datetime';
import { SettingRow } from './SettingsSection';

/*
 * Time zone, date format, time format and week start — for the portal
 * (Settings → General, `personal` off) and for a person (Account → Appearance,
 * `personal` on: every field also offers "as the portal", the zone also
 * "as on this device"). value: { timeZone, dateFormat, timeFormat, weekStart }.
 * A live example shows how dates will look.
 */
const WEEK_LABELS = { 1: 'regional.mondayShort', 0: 'regional.sundayShort', 6: 'regional.saturdayShort' };

export default function RegionalFields({ value = {}, onChange, portal = null, personal = false, disabled = false }) {
  const { t, locale } = useLocale();
  const zones = useMemo(() => zoneOptions(), []);
  const set = (patch) => onChange?.({ ...value, ...patch });
  const sample = '2026-10-13T08:05:00Z';
  const effective = personal ? resolveRegional(portal || {}, value, locale) : resolveRegional(value, {}, locale);
  const portalR = resolveRegional(portal || {}, {}, locale);
  const portalSuffix = (text) => `${t('regional.asPortal')}${text ? ` (${text})` : ''}`;

  const dateOptions = DATE_FORMATS.map((format) => ({ value: format, label: `${fmtDate(sample, { ...effective, dateFormat: format, timeZone: 'UTC' })}  ·  ${format}` }));
  const zoneValue = value.timeZone || (personal ? 'portal' : effective.timeZone);

  return (
    <>
      <SettingRow label={t('regional.timeZone')} description={t(personal ? 'regional.timeZoneDescMe' : 'regional.timeZoneDesc')}>
        <Select
          showSearch
          disabled={disabled}
          value={zoneValue}
          onChange={(timeZone) => set({ timeZone: timeZone === 'portal' ? null : timeZone })}
          filterOption={(input, option) => (option.search || '').includes(input.toLowerCase())}
          style={{ width: 340, maxWidth: '100%' }}
          // The chosen "as the portal / this device" reads short in the field (fits a phone); the list keeps the zone names.
          labelRender={({ value: chosen, label }) =>
            chosen === 'portal' && portalR.timeZone ? `${t('regional.asPortalShort')} · ${zoneLabel(portalR.timeZone)}` : chosen === 'device' ? `${t('regional.device')} · ${zoneLabel(deviceZone())}` : label
          }
          options={[
            ...(personal
              ? [
                  { value: 'portal', label: portalSuffix(portalR.timeZone ? `${zoneName(portalR.timeZone)} · ${zoneLabel(portalR.timeZone)}` : ''), search: 'portal портал как в' },
                  { value: 'device', label: `${t('regional.device')} (${zoneName(deviceZone())} · ${zoneLabel(deviceZone())})`, search: 'device устройство как на' },
                ]
              : []),
            ...zones,
          ]}
        />
      </SettingRow>
      <SettingRow label={t('regional.dateFormat')}>
        <Select
          disabled={disabled}
          value={value.dateFormat || (personal ? 'portal' : effective.dateFormat)}
          onChange={(dateFormat) => set({ dateFormat: dateFormat === 'portal' ? null : dateFormat })}
          style={{ width: 340, maxWidth: '100%' }}
          options={[...(personal ? [{ value: 'portal', label: portalSuffix(fmtDate(sample, { ...portalR, timeZone: 'UTC' })) }] : []), ...dateOptions]}
        />
      </SettingRow>
      <SettingRow label={t('regional.timeFormat')}>
        <Segmented
          disabled={disabled}
          value={value.timeFormat || (personal ? 'portal' : effective.timeFormat)}
          onChange={(timeFormat) => set({ timeFormat: timeFormat === 'portal' ? null : timeFormat })}
          options={[
            ...(personal ? [{ value: 'portal', label: `${t('regional.asPortalShort')} · ${portalR.timeFormat === '12' ? '2:30 PM' : '14:30'}` }] : []),
            { value: '24', label: '14:30' },
            { value: '12', label: '2:30 PM' },
          ]}
        />
      </SettingRow>
      <SettingRow label={t('regional.weekStart')}>
        <Segmented
          disabled={disabled}
          value={value.weekStart ?? (personal ? 'portal' : effective.weekStart)}
          onChange={(weekStart) => set({ weekStart: weekStart === 'portal' ? null : weekStart })}
          options={[
            ...(personal ? [{ value: 'portal', label: `${t('regional.asPortalShort')} · ${t(WEEK_LABELS[portalR.weekStart])}` }] : []),
            { value: 1, label: t('regional.monday') },
            { value: 0, label: t('regional.sunday') },
            { value: 6, label: t('regional.saturday') },
          ]}
        />
      </SettingRow>
      <div className="regional-sample" aria-live="polite">
        <span>{t('regional.sample')}</span>
        <strong>{fmtDateTime(new Date().toISOString(), effective)}</strong>
        <span className="muted">
          {zoneName(effective.timeZone)} · {zoneLabel(effective.timeZone)} · {t('regional.dateOnly')}: {fmtDate(new Date().toISOString(), effective)} · {t('regional.timeOnly')}: {fmtTime(new Date().toISOString(), effective)}
        </span>
      </div>
    </>
  );
}
