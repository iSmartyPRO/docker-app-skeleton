import { useEffect, useState } from 'react';
import { App, Button, ColorPicker, Input, Select, Switch, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { MenuIcon } from '../../components/icons/menuIcons';
import { orgApi, orgChanged } from './api';
import { knownError } from './errors';
import { purposeLabel, typeLabel } from './lib';

const ICONS = ['building', 'briefcase', 'map', 'layers', 'siteplan', 'people', 'box', 'globe', 'flag', 'home', 'pin', 'cart', 'wrench', 'server'];
const STOCK_TYPES = ['company', 'office', 'branch', 'department', 'site'];
const STOCK_PURPOSES = ['warehouse', 'construction', 'sales', 'production', 'office'];
const slug = (text, prefix) => {
  const base = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
  return /^[a-z]/.test(base) ? base : `${prefix}${Date.now().toString(36).slice(-5)}`;
};

/** «Типы и назначения»: unit types (name, icon, colour, legal entity, site) and purposes. */
export default function TypesEditor({ meta, units, canManage, onSaved }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [types, setTypes] = useState(meta?.types || []);
  const [purposes, setPurposes] = useState(meta?.purposes || []);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setTypes(meta?.types || []);
    setPurposes(meta?.purposes || []);
    setDirty(false);
  }, [meta]);
  const used = new Set(units.map((unit) => unit.type));
  const editType = (index, patch) => {
    setTypes((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setDirty(true);
  };
  const editPurpose = (index, patch) => {
    setPurposes((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setDirty(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      await orgApi.saveSettings({ types, purposes });
      message.success(t('common.saved'));
      setDirty(false);
      orgChanged();
      await onSaved?.();
    } catch (err) {
      message.error(knownError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="org-types" data-tour="org.types">
      <section className="org-panel">
        <h4>{t('org.typesEditor.types')}</h4>
        <p className="org-muted">{t('org.typesEditor.typesLead')}</p>
        <div className="org-types__list">
          {types.map((type, index) => (
            <div key={type.key} className="org-types__row" style={{ '--c': type.color }}>
              <span className="org-types__icon">
                <MenuIcon name={type.icon} variant="mono" />
              </span>
              <Input
                value={type.label}
                placeholder={STOCK_TYPES.includes(type.key) ? typeLabel({ key: type.key }, t) : t('org.typesEditor.name')}
                onChange={(event) => editType(index, { label: event.target.value })}
                disabled={!canManage}
                aria-label={t('org.typesEditor.name')}
                className="org-types__name"
              />
              <Select
                value={type.icon}
                onChange={(icon) => editType(index, { icon })}
                disabled={!canManage}
                style={{ width: 76 }}
                aria-label={t('org.typesEditor.icon')}
                options={ICONS.map((icon) => ({ value: icon, label: <MenuIcon name={icon} variant="mono" /> }))}
              />
              <ColorPicker value={type.color} onChange={(color) => editType(index, { color: color.toHexString().toUpperCase() })} disabled={!canManage} />
              <Tooltip title={t('org.typesEditor.legalHint')}>
                <label className="org-switch">
                  <Switch size="small" checked={Boolean(type.legal)} onChange={(legal) => editType(index, { legal })} disabled={!canManage} /> {t('org.typesEditor.legal')}
                </label>
              </Tooltip>
              <Tooltip title={t('org.typesEditor.siteHint')}>
                <label className="org-switch">
                  <Switch size="small" checked={Boolean(type.site)} onChange={(site) => editType(index, { site })} disabled={!canManage} /> {t('org.typesEditor.site')}
                </label>
              </Tooltip>
              <Tooltip title={used.has(type.key) ? t('org.typesEditor.inUse') : t('common.delete')}>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={t('common.delete')}
                  disabled={!canManage || used.has(type.key) || types.length < 2}
                  onClick={() => {
                    setTypes((list) => list.filter((_, i) => i !== index));
                    setDirty(true);
                  }}
                />
              </Tooltip>
            </div>
          ))}
        </div>
        {canManage && types.length < 20 && (
          <Button
            icon={<PlusOutlined />}
            type="dashed"
            onClick={() => {
              setTypes((list) => [...list, { key: slug('', 't'), label: t('org.typesEditor.newType'), icon: 'layers', color: '#64748B', legal: false, site: false }]);
              setDirty(true);
            }}
          >
            {t('org.typesEditor.addType')}
          </Button>
        )}
      </section>
      <section className="org-panel">
        <h4>{t('org.typesEditor.purposes')}</h4>
        <p className="org-muted">{t('org.typesEditor.purposesLead')}</p>
        <div className="org-types__list">
          {purposes.map((purpose, index) => (
            <div key={purpose.key} className="org-types__row">
              <code className="org-types__key">{purpose.key}</code>
              <Input
                value={purpose.label}
                placeholder={STOCK_PURPOSES.includes(purpose.key) ? purposeLabel({ key: purpose.key }, t) : t('org.typesEditor.name')}
                onChange={(event) => editPurpose(index, { label: event.target.value })}
                disabled={!canManage}
                aria-label={t('org.typesEditor.name')}
                className="org-types__name"
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={t('common.delete')}
                disabled={!canManage}
                onClick={() => {
                  setPurposes((list) => list.filter((_, i) => i !== index));
                  setDirty(true);
                }}
              />
            </div>
          ))}
        </div>
        {canManage && purposes.length < 30 && (
          <Button
            icon={<PlusOutlined />}
            type="dashed"
            onClick={() => {
              setPurposes((list) => [...list, { key: slug('', 'p'), label: t('org.typesEditor.newPurpose') }]);
              setDirty(true);
            }}
          >
            {t('org.typesEditor.addPurpose')}
          </Button>
        )}
      </section>
      {canManage && (
        <div className="org-details__actions">
          <Button type="primary" disabled={!dirty} loading={busy} onClick={save}>
            {t('common.save')}
          </Button>
          {dirty && (
            <Button
              onClick={() => {
                setTypes(meta?.types || []);
                setPurposes(meta?.purposes || []);
                setDirty(false);
              }}
            >
              {t('common.cancel')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
