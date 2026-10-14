import { useEffect, useState } from 'react';
import { App, Button, ColorPicker, Input, InputNumber, Radio, Select, Switch } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import SaveBar from '../../../components/ui/SaveBar';
import { approvalsApi } from '../api';
import { URGENCY_GLYPH, loadMeta, urgencyName, useApprovalsMeta } from '../lib';

const ICONS = Object.keys(URGENCY_GLYPH);

/** Urgency levels (names, colours, reaction time), reminder share, yellow threshold, escalation. */
export default function UrgencyEditor({ readOnly = false }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const meta = useApprovalsMeta();
  const [initial, setInitial] = useState(null);
  const [value, setValue] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (meta && !initial) {
      setInitial(meta.settings);
      setValue(meta.settings);
    }
  }, [meta, initial]);
  if (!value) return null;
  const dirty = JSON.stringify(initial) !== JSON.stringify(value);
  const setLevel = (index, patch) => setValue((prev) => ({ ...prev, urgencies: prev.urgencies.map((level, i) => (i === index ? { ...level, ...patch } : level)) }));
  const move = (index, delta) =>
    setValue((prev) => {
      const list = [...prev.urgencies];
      const [item] = list.splice(index, 1);
      list.splice(index + delta, 0, item);
      return { ...prev, urgencies: list };
    });
  const save = async () => {
    setSaving(true);
    try {
      const res = await approvalsApi.saveSettings(value);
      const fresh = { ...value, ...res.data.settings };
      setInitial(fresh);
      setValue(fresh);
      await loadMeta(true);
      message.success(t('common.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <SettingsSection title={t('approvals.urgencyEditor.title')} description={t('approvals.urgencyEditor.desc')}>
        <div className="apr-levels">
          {value.urgencies.map((level, index) => (
            <div key={`${level.key}-${index}`} className="apr-level" style={{ '--c': level.color }}>
              <div className="apr-level__order">
                <Button size="small" type="text" disabled={readOnly || index === 0} onClick={() => move(index, -1)} aria-label="↑">
                  ↑
                </Button>
                <Button size="small" type="text" disabled={readOnly || index === value.urgencies.length - 1} onClick={() => move(index, 1)} aria-label="↓">
                  ↓
                </Button>
              </div>
              <Select
                value={level.icon}
                onChange={(icon) => setLevel(index, { icon })}
                options={ICONS.map((icon) => ({ value: icon, label: URGENCY_GLYPH[icon] }))}
                style={{ width: 70 }}
                disabled={readOnly}
              />
              <Input
                value={level.label}
                onChange={(event) => setLevel(index, { label: event.target.value })}
                placeholder={urgencyName({ ...level, label: '' }, t)}
                maxLength={40}
                className="apr-level__name"
                disabled={readOnly}
              />
              <ColorPicker value={level.color} onChange={(color) => setLevel(index, { color: color.toHexString().toUpperCase() })} disabledAlpha disabled={readOnly} />
              <InputNumber value={level.hours} min={1} max={2160} onChange={(hours) => setLevel(index, { hours })} addonAfter={t('approvals.urgencyEditor.hours')} style={{ width: 150 }} disabled={readOnly} />
              <Radio checked={value.defaultUrgency === level.key} onChange={() => setValue((prev) => ({ ...prev, defaultUrgency: level.key }))} disabled={readOnly}>
                {t('approvals.urgencyEditor.default')}
              </Radio>
              <Button
                type="text"
                danger
                disabled={readOnly || value.urgencies.length <= 1}
                onClick={() => setValue((prev) => ({ ...prev, urgencies: prev.urgencies.filter((_, i) => i !== index) }))}
                aria-label={t('common.delete')}
              >
                ✕
              </Button>
            </div>
          ))}
          {!readOnly && value.urgencies.length < 8 && (
            <Button type="dashed" onClick={() => setValue((prev) => ({ ...prev, urgencies: [...prev.urgencies, { key: `u${Date.now().toString(36).slice(-4)}`, label: t('approvals.urgencyEditor.newLevel'), color: '#64748B', hours: 48, icon: 'flag' }] }))} icon={<PlusOutlined />}>
              {t('approvals.urgencyEditor.add')}
            </Button>
          )}
        </div>
      </SettingsSection>
      <SettingsSection title={t('approvals.urgencyEditor.slaTitle')}>
        <SettingRow label={t('approvals.urgencyEditor.reminder')} description={t('approvals.urgencyEditor.reminderDesc')}>
          <InputNumber value={value.reminderPercent} min={10} max={95} onChange={(reminderPercent) => setValue((prev) => ({ ...prev, reminderPercent }))} addonAfter="%" disabled={readOnly} />
        </SettingRow>
        <SettingRow label={t('approvals.urgencyEditor.soon')} description={t('approvals.urgencyEditor.soonDesc')}>
          <InputNumber value={value.soonHours} min={1} max={336} onChange={(soonHours) => setValue((prev) => ({ ...prev, soonHours }))} addonAfter={t('approvals.urgencyEditor.hours')} disabled={readOnly} />
        </SettingRow>
        <SettingRow label={t('approvals.urgencyEditor.escalation')} description={t('approvals.urgencyEditor.escalationDesc')}>
          <Switch checked={value.escalation !== false} onChange={(escalation) => setValue((prev) => ({ ...prev, escalation }))} disabled={readOnly} />
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty && !readOnly} saving={saving} onSave={save} onReset={() => setValue(initial)} />
    </>
  );
}
