import { useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, Modal, Popconfirm, Segmented, Select, Switch } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { translate } from '../../../i18n/translations';
import { errorMessage } from '../../../lib/errors';
import { roleLabel } from '../../../lib/access';
import { MODULE_COLORS, itemText, resourcesApi } from '../api';
import { useSettings } from '../../../context/SettingsContext';
import { MODULE_REGISTRY, moduleLabel } from '../../registry';
import IconPicker from './IconPicker';
import ResourceIcon from './ResourceIcon';

const VISIBILITY = [
  { id: 'public', icon: '🌐' },
  { id: 'signed', icon: '🏢' },
  { id: 'custom', icon: '👥' },
];

function ChoiceCards({ value, onChange, options }) {
  return (
    <div className="rs-choices" role="radiogroup">
      {options.map((option) => (
        <button key={option.id} type="button" role="radio" aria-checked={value === option.id} className={`rs-choice${value === option.id ? ' is-active' : ''}`} onClick={() => onChange(option.id)}>
          <span className="rs-choice__icon" aria-hidden="true">{option.icon}</span>
          <strong>{option.title}</strong>
          <span>{option.text}</span>
        </button>
      ))}
    </div>
  );
}

/** Translation in a given language (placeholders show the module name in each language). */
function translateFor(code, key, params, fallback) {
  const text = translate(code, key, params);
  return text ?? fallback(key, params);
}

/** Create or edit a resource with a live tile preview. */
export default function ResourceDialog({ open, item, categories, onClose }) {
  const { t, locale, portalDefault } = useLocale();
  const { settings } = useSettings();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [subjects, setSubjects] = useState(null);
  const [lang, setLang] = useState(portalDefault || locale);
  const values = Form.useWatch([], form) || {};
  const modules = MODULE_REGISTRY.filter((module) => module.id !== 'resources' && settings?.modules?.[module.id]?.enabled);
  const primary = portalDefault || locale;

  useEffect(() => {
    if (!open) return;
    setLang(primary);
    // Texts live per language; an older resource's own title becomes the default language's text.
    const i18n = { ru: {}, en: {}, ...(item?.i18n || {}) };
    if (item && !i18n[primary]?.title && item.title) i18n[primary] = { ...i18n[primary], title: item.title, description: i18n[primary]?.description || item.description || '' };
    form.setFieldsValue(
      item
        ? { ...item, kind: item.kind || 'link', i18n, access: (item.access || []).map((entry) => `${entry.subjectType}:${entry.subjectId ?? ''}`) }
        : { kind: 'link', i18n: { ru: {}, en: {} }, url: 'https://', categoryId: null, target: 'blank', visibility: 'signed', active: true, access: [], icon: { type: 'letter', style: 'gradient', color: '#6366F1' } }
    );
    if (!subjects) resourcesApi.subjects().then((res) => setSubjects(res.data)).catch(() => setSubjects({ users: [], groups: [], roles: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  const subjectOptions = useMemo(() => {
    if (!subjects) return [];
    return [
      { label: t('nav.groups'), options: subjects.groups.map((group) => ({ value: `group:${group.id}`, label: `👥 ${group.name}` })) },
      { label: t('nav.roles'), options: subjects.roles.map((role) => ({ value: `role:${role.id}`, label: `🛡 ${roleLabel(role, t)}` })) },
      { label: t('nav.users'), options: subjects.users.map((user) => ({ value: `user:${user.id}`, label: `${user.name} · @${user.username}` })) },
    ];
  }, [subjects, t]);

  const submit = async () => {
    const raw = await form.validateFields();
    const titled = Object.values(raw.i18n || {}).some((entry) => entry?.title?.trim());
    if (raw.kind !== 'module' && !titled) {
      setLang(primary);
      form.setFields([{ name: ['i18n', primary, 'title'], errors: [t('resources.required')] }]);
      return;
    }
    const payload = {
      ...raw,
      // The server keeps the first filled language as the fallback text.
      title: '',
      description: '',
      access: (raw.access || []).map((key) => {
        const [subjectType, id] = key.split(':');
        return { subjectType, subjectId: Number(id) };
      }),
    };
    setBusy(true);
    try {
      if (item) await resourcesApi.updateItem(item.id, payload);
      else await resourcesApi.createItem(payload);
      message.success(t('common.saved'));
      onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await resourcesApi.deleteItem(item.id);
      message.success(t('resources.deleted'));
      onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => onClose(false)}
      width={1040}
      destroyOnHidden
      title={item ? t('resources.editTitle') : t('resources.addTitle')}
      footer={
        <div className="rs-dialog__foot">
          {item && (
            <Popconfirm title={t('resources.deleteConfirm')} onConfirm={remove}>
              <Button danger type="text">{t('common.delete')}</Button>
            </Popconfirm>
          )}
          <span className="rs-dialog__grow" />
          <Button onClick={() => onClose(false)}>{t('common.cancel')}</Button>
          <Button type="primary" loading={busy} onClick={submit}>{t('common.save')}</Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false} className="rs-dialog">
        <div className="rs-dialog__main">
          <div className="rs-dialog__live">
            {(() => {
              const text = itemText({ ...values, i18n: values.i18n || {}, title: '', description: '' }, { locale: lang, t, settings, registry: MODULE_REGISTRY });
              return (
                <div className="rs-tile is-preview">
                  <ResourceIcon icon={values.icon} title={text.title} size={52} />
                  <span className="rs-tile__text">
                    <strong>{text.title || t('resources.titlePlaceholder')}</strong>
                    {text.description && <span className="rs-tile__desc">{text.description}</span>}
                    <span className="rs-tile__host">{values.kind === 'module' ? t('resources.portalModule') : text.host} {values.target === 'blank' && <span className="rs-tile__ext">↗</span>}</span>
                  </span>
                </div>
              );
            })()}
          </div>
          <Form.Item name="kind" className="rs-kind">
            <Segmented
              block
              onChange={(kind) => {
                if (kind === 'module') form.setFieldsValue({ target: 'self' });
              }}
              options={[
                { value: 'link', label: `🔗 ${t('resources.kindLink')}` },
                { value: 'module', label: `⊞ ${t('resources.kindModule')}` },
              ]}
            />
          </Form.Item>
          {values.kind === 'module' ? (
            <Form.Item name="module" label={t('resources.fieldModule')} extra={t('resources.moduleHint')} rules={[{ required: true, message: t('resources.required') }]}>
              <Select
                placeholder={t('resources.pickModule')}
                onChange={(id) => {
                  const module = modules.find((entry) => entry.id === id);
                  const icon = form.getFieldValue('icon');
                  if (module && (!icon || icon.type === 'letter' || icon.type === 'menu')) {
                    form.setFieldsValue({ icon: { type: 'menu', name: module.icon, style: icon?.style || 'gradient', color: MODULE_COLORS[id] || '#6366F1' } });
                  }
                }}
                options={modules.map((module) => ({ value: module.id, label: moduleLabel(module, settings, t) }))}
              />
            </Form.Item>
          ) : (
            <Form.Item name="url" label={t('resources.fieldUrl')} extra={t('resources.urlHint')} rules={[{ required: true, message: t('resources.required') }]}>
              <Input placeholder="https://mail.company.com" />
            </Form.Item>
          )}
          <div className="rs-lang-tabs">
            <Segmented
              value={lang}
              onChange={setLang}
              options={['ru', 'en'].map((code) => ({
                value: code,
                label: (
                  <span>
                    {code === 'ru' ? 'Русский' : 'English'}
                    {values.i18n?.[code]?.title ? <em>✓</em> : null}
                  </span>
                ),
              }))}
            />
            <span className="rs-lang-tabs__hint">{t('resources.translationsHint')}</span>
          </div>
          {['ru', 'en'].map((code) => (
            <div key={code} hidden={code !== lang}>
              <Form.Item name={['i18n', code, 'title']} label={`${t('resources.fieldTitle')} · ${code.toUpperCase()}`}>
                <Input
                  maxLength={120}
                  placeholder={
                    values.kind === 'module' && values.module
                      ? itemText({ kind: 'module', module: values.module, i18n: {} }, { locale: code, t: (key, p) => translateFor(code, key, p, t), settings, registry: MODULE_REGISTRY }).title
                      : t('resources.titlePlaceholder')
                  }
                />
              </Form.Item>
              <Form.Item name={['i18n', code, 'description']} label={`${t('resources.fieldDescription')} · ${code.toUpperCase()}`}>
                <Input.TextArea maxLength={300} rows={2} showCount placeholder={t('resources.descriptionPlaceholder')} />
              </Form.Item>
            </div>
          ))}
          <div className="rs-dialog__grid">
            <Form.Item name="categoryId" label={t('resources.fieldCategory')}>
              <Select allowClear placeholder={t('resources.noCategory')} options={categories.map((category) => ({ value: category.id, label: <span><span className="rs-chips__dot" style={{ '--c': category.color }} /> {category.name}</span> }))} />
            </Form.Item>
            <Form.Item name="target" label={t('resources.fieldTarget')}>
              <Select
                options={[
                  { value: 'blank', label: `↗ ${t('resources.targetBlank')}` },
                  { value: 'self', label: `→ ${t('resources.targetSelf')}` },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="visibility" label={t('resources.fieldVisibility')}>
            <ChoiceCards
              options={VISIBILITY.map((option) => ({ ...option, title: t(`resources.visibility.${option.id}`), text: t(`resources.visibility.${option.id}Desc`) }))}
            />
          </Form.Item>
          {values.visibility === 'custom' && (
            <Form.Item name="access" label={t('resources.fieldAccess')} rules={[{ required: true, message: t('resources.accessRequired') }]}>
              <Select mode="multiple" allowClear loading={!subjects} options={subjectOptions} optionFilterProp="label" placeholder={t('resources.accessPlaceholder')} />
            </Form.Item>
          )}
          <Form.Item name="active" valuePropName="checked" label={t('resources.fieldActive')} extra={t('resources.activeHint')}>
            <Switch />
          </Form.Item>
        </div>
        <div className="rs-dialog__side">
          <Form.Item name="icon" noStyle>
            <IconPicker title={values.i18n?.[lang]?.title || values.i18n?.[primary]?.title || ''} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
