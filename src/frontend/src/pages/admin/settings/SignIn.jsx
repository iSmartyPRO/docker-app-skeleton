import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button, Form, Input, Select, Switch } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import SaveBar from '../../../components/ui/SaveBar';
import LoadState from '../../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { IconDirectory, IconGoogle, IconMail, IconMattermost, IconTelegram, IconUser, IconWhatsapp } from '../../../components/icons/AdminIcons';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useAccessData } from '../../../hooks/useAccessData';
import { useLocale } from '../../../context/LocaleContext';
import SettingsPageHeader from './SettingsPageHeader';
import { HintLabel } from '../../../help/Hint';

/** Shows whether the integration a method depends on is ready, with a shortcut. */
function Readiness({ ready, to }) {
  const { t } = useLocale();
  return ready ? (
    <span className="readiness is-ready">● {t('signinSettings.integrationReady')}</span>
  ) : (
    <Link to={to} className="readiness">
      ● {t('signinSettings.integrationMissing')} →
    </Link>
  );
}

function MethodHead({ icon: Icon, title, description, ready, to, children }) {
  return (
    <div className="method-head">
      <Icon />
      <div className="method-head__text">
        <strong>{title}</strong>
        <span>{description}</span>
        {to && <Readiness ready={ready} to={to} />}
      </div>
      <div className="method-head__control">{children}</div>
    </div>
  );
}

function SignInForm({ settings, save, groups }) {
  const { t } = useLocale();
  const auth = settings.authMethods || {};
  const ready = settings.authReady || {};

  const initial = useMemo(
    () => ({
      passwordEnabled: auth.password?.enabled !== false,
      ldapEnabled: Boolean(auth.ldap?.enabled),
      ldapAutoProvision: auth.ldap?.autoProvision !== false,
      ldapGroupMap: auth.ldap?.groupMap || [],
      telegramEnabled: Boolean(auth.telegram?.enabled),
      telegramAutoProvision: Boolean(auth.telegram?.autoProvision),
      googleEnabled: Boolean(auth.google?.enabled),
      googleAutoProvision: Boolean(auth.google?.autoProvision),
      whatsappCodeEnabled: Boolean(auth.whatsappCode?.enabled),
      whatsappProvider: auth.whatsappCode?.provider || 'gateway',
      whatsappFallback: auth.whatsappCode?.fallback !== false,
      emailCodeEnabled: Boolean(auth.emailCode?.enabled),
      telegramCodeEnabled: Boolean(auth.telegramCode?.enabled),
      mattermostCodeEnabled: Boolean(auth.mattermostCode?.enabled),
      magicLinkEnabled: Boolean(auth.magicLink?.enabled),
    }),
    [auth]
  );

  const { form, dirty, saving, submit, reset, formProps } = useSettingsForm(initial, (v) =>
    save({
      auth: {
        password: { enabled: v.passwordEnabled },
        ldap: {
          enabled: v.ldapEnabled,
          autoProvision: v.ldapAutoProvision,
          groupMap: (v.ldapGroupMap || []).filter((rule) => rule?.adGroup && rule?.groupId),
        },
        telegram: { enabled: v.telegramEnabled, autoProvision: v.telegramAutoProvision },
        google: { enabled: v.googleEnabled, autoProvision: v.googleAutoProvision },
        whatsappCode: { enabled: v.whatsappCodeEnabled, provider: v.whatsappProvider, fallback: v.whatsappFallback },
        emailCode: { enabled: v.emailCodeEnabled },
        telegramCode: { enabled: v.telegramCodeEnabled },
        mattermostCode: { enabled: v.mattermostCodeEnabled },
        magicLink: { enabled: v.magicLinkEnabled },
      },
    })
  );
  const ldapOn = Form.useWatch('ldapEnabled', form);
  const telegramOn = Form.useWatch('telegramEnabled', form);
  const googleOn = Form.useWatch('googleEnabled', form);
  const passwordOn = Form.useWatch('passwordEnabled', form);
  const whatsappOn = Form.useWatch('whatsappCodeEnabled', form);
  const provider = Form.useWatch('whatsappProvider', form) || initial.whatsappProvider;
  const providerReady = { gateway: ready.whatsappGateway, wazzup: ready.whatsappWazzup };
  const backup = provider === 'gateway' ? 'wazzup' : 'gateway';

  const toggle = (name, isReady = true) => (
    <Form.Item name={name} valuePropName="checked" noStyle>
      <Switch disabled={!isReady && !initial[name]} />
    </Form.Item>
  );

  return (
    <Form {...formProps}>
      <SettingsSection title={t('signinSettings.passwordTitle')} description={t('signinSettings.passwordDesc')}>
        <MethodHead icon={IconUser} title={t('signinSettings.password')} description={t('signinSettings.passwordHint')}>
          {toggle('passwordEnabled')}
        </MethodHead>
        {passwordOn === false && <div className="callout">{t('signinSettings.breakGlass')}</div>}
      </SettingsSection>

      <SettingsSection title={t('signinSettings.ssoTitle')} description={t('signinSettings.ssoDesc')}>
        <MethodHead icon={IconGoogle} title="Google" description={t('signinSettings.googleHint')} ready={ready.google} to="/admin/settings/google">
          {toggle('googleEnabled', ready.google)}
        </MethodHead>
        {googleOn && (
          <div className="method-body">
            <SettingRow label={t('signinSettings.autoProvision')} description={t('signinSettings.googleProvisionDesc')}>
              <Form.Item name="googleAutoProvision" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </SettingRow>
          </div>
        )}

        <MethodHead
          icon={IconDirectory}
          title="Active Directory / LDAP"
          description={t('signinSettings.ldapHint')}
          ready={ready.ldap}
          to="/admin/settings/ad"
        >
          {toggle('ldapEnabled', ready.ldap)}
        </MethodHead>
        {ldapOn && (
          <div className="method-body">
            <SettingRow label={t('signinSettings.autoProvision')} description={t('signinSettings.ldapProvisionDesc')}>
              <Form.Item name="ldapAutoProvision" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </SettingRow>
            <div className="setting-row is-stacked">
              <div className="setting-row__text">
                <span className="setting-row__label"><HintLabel id="admin.groupMap">{t('signinSettings.groupMap')}</HintLabel></span>
                <div className="setting-row__desc">{t('signinSettings.groupMapDesc')}</div>
              </div>
              <Form.List name="ldapGroupMap">
                {(fields, { add, remove }) => (
                  <div className="map-rows">
                    {fields.map((field) => (
                      <div key={field.key} className="map-row">
                        <Form.Item name={[field.name, 'adGroup']} noStyle>
                          <Input placeholder="Portal Admins  /  CN=Portal Admins,OU=Groups,DC=corp,DC=local" />
                        </Form.Item>
                        <span className="map-row__arrow">→</span>
                        <Form.Item name={[field.name, 'groupId']} noStyle>
                          <Select
                            placeholder={t('signinSettings.portalGroup')}
                            options={groups.map((group) => ({ value: group.id, label: group.name }))}
                          />
                        </Form.Item>
                        <Button type="text" danger onClick={() => remove(field.name)}>×</Button>
                      </div>
                    ))}
                    <Button onClick={() => add({ adGroup: '', groupId: undefined })} icon={<PlusOutlined />}>
                      {t('signinSettings.addMapping')}
                    </Button>
                  </div>
                )}
              </Form.List>
            </div>
          </div>
        )}

        <MethodHead
          icon={IconTelegram}
          title={t('signinSettings.telegramLogin')}
          description={t('signinSettings.telegramLoginHint')}
          ready={ready.telegram}
          to="/admin/settings/telegram"
        >
          {toggle('telegramEnabled', ready.telegram)}
        </MethodHead>
        {telegramOn && (
          <div className="method-body">
            <SettingRow label={t('signinSettings.autoProvision')} description={t('signinSettings.telegramProvisionDesc')}>
              <Form.Item name="telegramAutoProvision" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </SettingRow>
            <div className="callout">{t('signinSettings.setDomain', { domain: window.location.host })}</div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('signinSettings.codesTitle')} description={t('signinSettings.codesDesc')}>
        <MethodHead
          icon={IconWhatsapp}
          title={t('signinSettings.whatsappCode')}
          description={t('signinSettings.whatsappCodeHint')}
          ready={ready.whatsappCode}
          to={ready.whatsappWazzup ? '/admin/settings/wazzup' : '/admin/settings/whatsapp'}
        >
          {toggle('whatsappCodeEnabled', ready.whatsappCode)}
        </MethodHead>
        {whatsappOn && (
          <div className="method-body">
            <SettingRow label={t('signinSettings.whatsappProvider')} description={t('signinSettings.whatsappProviderDesc')}>
              <Form.Item name="whatsappProvider" noStyle>
                <Select
                  style={{ width: 260 }}
                  options={['gateway', 'wazzup'].map((value) => ({
                    value,
                    label: (
                      <span className="provider-option">
                        {t(`signinSettings.provider_${value}`)}
                        <span className={`readiness${providerReady[value] ? ' is-ready' : ''}`}>
                          ● {providerReady[value] ? t('signinSettings.integrationReady') : t('signinSettings.notConfigured')}
                        </span>
                      </span>
                    ),
                  }))}
                />
              </Form.Item>
            </SettingRow>
            <SettingRow
              label={t('signinSettings.whatsappFallback', { provider: t(`signinSettings.provider_${backup}`) })}
              description={
                providerReady[backup]
                  ? t('signinSettings.whatsappFallbackDesc')
                  : t('signinSettings.whatsappFallbackMissing', { provider: t(`signinSettings.provider_${backup}`) })
              }
            >
              <Form.Item name="whatsappFallback" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </SettingRow>
          </div>
        )}
        <MethodHead icon={IconMail} title={t('signinSettings.emailCode')} description={t('signinSettings.emailCodeHint')} ready={ready.emailCode} to="/admin/settings/email">
          {toggle('emailCodeEnabled', ready.emailCode)}
        </MethodHead>
        <MethodHead icon={IconTelegram} title={t('signinSettings.telegramCode')} description={t('signinSettings.telegramCodeHint')} ready={ready.telegramCode} to="/admin/settings/telegram">
          {toggle('telegramCodeEnabled', ready.telegramCode)}
        </MethodHead>
        <MethodHead icon={IconMattermost} title={t('signinSettings.mattermostCode')} description={t('signinSettings.mattermostCodeHint')} ready={ready.mattermostCode} to="/admin/settings/mattermost">
          {toggle('mattermostCodeEnabled', ready.mattermostCode)}
        </MethodHead>
        <SettingRow label={<HintLabel id="admin.magicLink">{t('signinSettings.magicLink')}</HintLabel>} description={t('signinSettings.magicLinkHint')}>
          <Form.Item name="magicLinkEnabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <div className="protection">
          <strong>{t('signinSettings.protectionTitle')}</strong>
          <ul>
            {['p1', 'p2', 'p3', 'p4', 'p5'].map((key) => (
              <li key={key}>{t(`signinSettings.${key}`)}</li>
            ))}
          </ul>
        </div>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function SignInSettings() {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  const access = useAccessData();
  return (
    <>
      <SettingsPageHeader id="signin" />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <SignInForm settings={settings} save={save} groups={access.groups} />}
      </LoadState>
    </>
  );
}
