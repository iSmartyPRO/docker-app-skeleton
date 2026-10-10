import { useMemo } from 'react';
import { Form } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import LoadState from '../../../components/ui/LoadState';
import { SettingsSection } from '../../../components/ui/SettingsSection';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import SettingsPageHeader from './SettingsPageHeader';

function ModeCards({ value, onChange }) {
  const { t } = useLocale();
  const modes = [
    { id: 'closed', icon: 'lock', title: t('setup.closedTitle'), text: t('setup.closedText') },
    { id: 'open', icon: 'globe', title: t('setup.openTitle'), text: t('setup.openText') },
  ];
  return (
    <div className="choice-grid" role="radiogroup">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="radio"
          aria-checked={value === mode.id}
          className={`choice-card${value === mode.id ? ' is-active' : ''}`}
          onClick={() => onChange?.(mode.id)}
        >
          <span className="choice-card__head">
            <MenuIcon name={mode.icon} />
            <strong>{mode.title}</strong>
            <span className="choice-card__radio" aria-hidden="true" />
          </span>
          <span className="choice-card__text">{mode.text}</span>
        </button>
      ))}
    </div>
  );
}

function AccessForm({ settings, save }) {
  const { t } = useLocale();
  const initial = useMemo(() => ({ accessMode: settings.accessMode || 'closed' }), [settings.accessMode]);
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, save);
  return (
    <Form {...formProps}>
      <SettingsSection title={t('settings.access.mode')} description={t('settings.access.modeDesc')}>
        <Form.Item name="accessMode" noStyle>
          <ModeCards />
        </Form.Item>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function AccessSettings() {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id="access" />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <AccessForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
