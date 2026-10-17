import { useEffect, useState } from 'react';
import { Input, InputNumber, Modal, Select, Switch } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { useSettings } from '../../../context/SettingsContext';
import { enabledModules, moduleLabel } from '../../registry';
import { WIDGET_CATALOG, withDefaults } from '../catalog';
import { useOptions } from '../options';
import { Hint } from '../../../help/Hint';

/** Settings that have a help hint (help/content/dashboard.js → fields). */
const HINTED = new Set(['scope', 'period']);

/** Settings form of one widget, built from its catalog fields. */
export default function WidgetSettings({ widget, onClose }) {
  const { t } = useLocale();
  const { settings: portal } = useSettings();
  const options = useOptions() || {};
  const [values, setValues] = useState({});
  const def = widget ? WIDGET_CATALOG[widget.type] : null;

  useEffect(() => {
    if (widget) setValues(withDefaults(widget.type, widget.settings));
  }, [widget]);

  if (!widget || !def) return null;
  const set = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));
  const choices = (field) => {
    if (field.from === 'modules') {
      return enabledModules(portal)
        .filter((module) => module.id !== 'dashboard')
        .map((module) => ({ value: module.id, label: moduleLabel(module, portal, t) }));
    }
    const list = options[field.from] || [];
    return list.map((item) => ({
      value: item.id,
      label: (
        <span className="dash-opt">
          {item.color && <i style={{ background: item.color }} />}
          {item.name || item.title}
        </span>
      ),
      search: item.name || item.title,
    }));
  };
  const modulesOn = new Set(enabledModules(portal).map((module) => module.id));

  return (
    <Modal
      open
      title={
        <span className="dash-settings__title">
          <span className="dash-card__icon" style={{ '--w-accent': def.color }}>
            <MenuIcon name={def.icon} variant="mono" />
          </span>
          {t('dashboard.settings.title', { name: t(`dashboard.widgets.${widget.type}.name`) })}
        </span>
      }
      onCancel={() => onClose(null)}
      onOk={() => onClose(values)}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      width={520}
      destroyOnHidden
    >
      <div className="dash-settings">
        <div className="dash-field">
          <span>
            {t('dashboard.labels.title')} <Hint id="dashboard.widgetTitle" />
          </span>
          <Input value={values.title || ''} maxLength={60} placeholder={t(`dashboard.widgets.${widget.type}.name`)} onChange={(event) => set('title', event.target.value)} allowClear />
        </div>
        {def.fields
          .filter((field) => !field.module || modulesOn.has(field.module))
          .map((field) => {
            const label = t(`dashboard.labels.${field.key}`);
            let control = null;
            const value = values[field.key];
            switch (field.type) {
              case 'segmented':
                control = (
                  <Segmented
                    block
                    value={value}
                    onChange={(next) => set(field.key, next)}
                    options={field.options.map((option) => ({ value: option.value, label: t(option.labelKey, { n: option.n }) }))}
                  />
                );
                break;
              case 'select':
                control = (
                  <Select
                    value={value ?? (field.allowEmpty ? '' : undefined)}
                    onChange={(next) => set(field.key, next === '' ? undefined : next)}
                    showSearch
                    optionFilterProp="search"
                    options={[
                      ...(field.allowEmpty ? [{ value: '', label: t(field.allowEmpty), search: t(field.allowEmpty) }] : []),
                      ...(field.from ? choices(field) : field.options.map((option) => ({ value: option.value, label: t(option.labelKey, { n: option.n }), search: t(option.labelKey) }))),
                    ]}
                  />
                );
                break;
              case 'multi':
                control = (
                  <Select
                    mode="multiple"
                    allowClear
                    value={value || []}
                    onChange={(next) => set(field.key, next)}
                    placeholder={field.allowEmpty ? t(field.allowEmpty) : undefined}
                    optionFilterProp="search"
                    options={choices(field).map((option) => ({ ...option, search: option.search || option.label }))}
                  />
                );
                break;
              case 'zones':
                control = (
                  <Select
                    mode="multiple"
                    allowClear
                    maxCount={6}
                    value={value || []}
                    onChange={(next) => set(field.key, next)}
                    options={field.options.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }))}
                  />
                );
                break;
              case 'switch':
                return (
                  <label key={field.key} className="dash-field is-inline">
                    <span>{label}</span>
                    <Switch checked={value !== false} onChange={(next) => set(field.key, next)} />
                  </label>
                );
              case 'number':
                control = <InputNumber min={field.min} max={field.max} value={value} onChange={(next) => set(field.key, next)} style={{ width: 120 }} />;
                break;
              case 'color':
                control = (
                  <div className="dash-swatches">
                    {field.options.map((color) => (
                      <button key={color} type="button" className={value === color ? 'is-active' : ''} style={{ background: color }} onClick={() => set(field.key, color)} aria-label={color} />
                    ))}
                  </div>
                );
                break;
              default:
                control = null;
            }
            return (
              <div key={field.key} className="dash-field">
                <span>
                  {label}
                  {HINTED.has(field.key) && <> <Hint id={`dashboard.${field.key}`} /></>}
                </span>
                {control}
              </div>
            );
          })}
      </div>
    </Modal>
  );
}
