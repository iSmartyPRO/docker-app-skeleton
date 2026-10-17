import { useMemo } from 'react';
import { Alert, Form, Select, Switch, Tag, Tooltip } from 'antd';
import { HolderOutlined } from '@ant-design/icons';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SaveBar from '../../../components/ui/SaveBar';
import LoadState from '../../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import { LANGUAGES, REFERENCE_LOCALE, languageInfo, resolveLocale, sanitizeLocalization } from '../../../i18n/languages';
import { TRANSLATION_COVERAGE } from '../../../i18n/translations';
import SettingsPageHeader from './SettingsPageHeader';
import './languages.css';

/*
 * Settings → Languages (superadministrators; the API refuses everyone else):
 * which interface languages people may choose, in what order switchers show
 * them, and the default — one language, or the browser's language among the
 * enabled ones with a fallback.
 */

const browserLanguages = () => (navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean));

/** The form's list: every language, enabled ones first in their saved order. */
function toRows(localization) {
  const enabled = localization.enabled;
  const rest = LANGUAGES.map((language) => language.code).filter((code) => !enabled.includes(code));
  return [...enabled.map((code) => ({ code, enabled: true })), ...rest.map((code) => ({ code, enabled: false }))];
}

function Row({ row, onToggle, lastEnabled }) {
  const { t } = useLocale();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.code });
  const info = languageInfo(row.code);
  const coverage = TRANSLATION_COVERAGE?.[row.code];
  const percent = coverage === undefined ? null : Math.round(coverage * 100);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`lng-row${isDragging ? ' is-dragging' : ''}${row.enabled ? '' : ' is-off'}`}>
      <button type="button" className="lng-row__handle" aria-label={t('settings.languages.reorder', { name: info.name })} {...attributes} {...listeners}>
        <HolderOutlined />
      </button>
      <span className="lng-row__code" aria-hidden="true">{row.code.toUpperCase()}</span>
      <span className="lng-row__names">
        <strong lang={info.tag}>{info.name}</strong>
        {t(`settings.languages.names.${row.code}`) !== info.name && <span>{t(`settings.languages.names.${row.code}`)}</span>}
      </span>
      <span className="lng-row__tags">
        {row.code === REFERENCE_LOCALE ? (
          <Tag color="blue">{t('settings.languages.reference')}</Tag>
        ) : percent !== null ? (
          <Tooltip title={t('settings.languages.coverageHint')}>
            <Tag color={percent >= 99 ? 'green' : percent > 0 ? 'gold' : 'default'}>{percent >= 99 ? t('settings.languages.complete') : t('settings.languages.coverage', { percent })}</Tag>
          </Tooltip>
        ) : null}
      </span>
      <Tooltip title={lastEnabled ? t('settings.languages.lastOne') : null}>
        <Switch checked={row.enabled} disabled={lastEnabled} onChange={(on) => onToggle(row.code, on)} aria-label={info.name} />
      </Tooltip>
    </li>
  );
}

/** Form.Item adapter: [{ code, enabled }] in display order. */
function LanguageList({ value = [], onChange }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const enabledCount = value.filter((row) => row.enabled).length;
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = value.map((row) => row.code);
    onChange(arrayMove(value, ids.indexOf(active.id), ids.indexOf(over.id)));
  };
  const onToggle = (code, on) => onChange(value.map((row) => (row.code === code ? { ...row, enabled: on } : row)));
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={value.map((row) => row.code)} strategy={verticalListSortingStrategy}>
        <ul className="lng-list">
          {value.map((row) => (
            <Row key={row.code} row={row} onToggle={onToggle} lastEnabled={row.enabled && enabledCount === 1} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function LanguagesForm({ settings, save }) {
  const { t } = useLocale();
  const current = useMemo(() => sanitizeLocalization(settings.localization, settings.defaultLocale), [settings.localization, settings.defaultLocale]);
  const initial = useMemo(() => ({ rows: toRows(current), default: current.default, fallback: current.fallback }), [current]);
  const { form, dirty, saving, submit, reset, formProps } = useSettingsForm(initial, async (values) => {
    const enabled = values.rows.filter((row) => row.enabled).map((row) => row.code);
    const def = values.default === 'browser' || enabled.includes(values.default) ? values.default : enabled[0];
    const fallback = enabled.includes(values.fallback) ? values.fallback : enabled.includes(REFERENCE_LOCALE) ? REFERENCE_LOCALE : enabled[0];
    await save({ localization: { enabled, default: def, fallback } });
  });

  const rows = Form.useWatch('rows', form) || initial.rows;
  const def = Form.useWatch('default', form) ?? initial.default;
  const fallback = Form.useWatch('fallback', form) ?? initial.fallback;
  const enabled = rows.filter((row) => row.enabled).map((row) => row.code);
  const option = (code) => ({ value: code, label: <span lang={languageInfo(code).tag}>{languageInfo(code).name}</span> });
  const draft = { enabled, default: def === 'browser' || enabled.includes(def) ? def : enabled[0], fallback: enabled.includes(fallback) ? fallback : enabled[0] };
  const here = resolveLocale({ localization: draft, browser: browserLanguages() });

  return (
    <Form {...formProps}>
      <SettingsSection title={t('settings.languages.listTitle')} description={t('settings.languages.listDesc')}>
        <Form.Item name="rows" noStyle>
          <LanguageList />
        </Form.Item>
      </SettingsSection>

      <SettingsSection title={t('settings.languages.defaultTitle')} description={t('settings.languages.defaultDesc')}>
        <SettingRow label={t('settings.languages.default')} description={t('settings.languages.defaultHint')}>
          <Form.Item name="default" noStyle>
            <Select style={{ minWidth: 240 }} options={[{ value: 'browser', label: t('settings.languages.browser') }, ...enabled.map(option)]} />
          </Form.Item>
        </SettingRow>
        {def === 'browser' && (
          <SettingRow label={t('settings.languages.fallback')} description={t('settings.languages.fallbackHint')}>
            <Form.Item name="fallback" noStyle>
              <Select style={{ minWidth: 240 }} options={enabled.map(option)} />
            </Form.Item>
          </SettingRow>
        )}
        <Alert
          type="info"
          showIcon
          className="page-alert"
          message={t('settings.languages.preview', { name: languageInfo(here.locale).name, browser: browserLanguages().join(', ') || '—' })}
        />
      </SettingsSection>

      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function LanguagesSettings() {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id="languages" />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <LanguagesForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
