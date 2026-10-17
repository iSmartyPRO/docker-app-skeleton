import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox, Form, InputNumber, Radio, Switch } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { HintLabel } from '../../help/Hint';

const GROUPS = ['images', 'pdf', 'office', 'text', 'media', 'archives'];

function FilesForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.files || { enabled: true, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { form, dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ enabled, ...rest }) =>
    save({ modules: { files: { enabled, settings: rest } } })
  );
  const allowAny = Form.useWatch('allowAny', form);
  const links = Form.useWatch('publicLinks', form);
  const writeLinks = Form.useWatch('writeLinks', form);
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('filesSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.kb')} description={t('filesSettings.kbDesc')}>
          <Link to="/admin/settings/kb">{t('settings.kb.title')} →</Link>
        </SettingRow>
        <SettingRow label={t('driveSettings.openMode')} description={t('driveSettings.openModeDesc')}>
          <Form.Item name="openMode" noStyle>
            <Radio.Group
              optionType="button"
              options={[
                { value: 'page', label: t('driveSettings.openPage') },
                { value: 'modal', label: t('driveSettings.openModal') },
              ]}
            />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('filesSettings.storage')} description={t('filesSettings.storageDesc')}>
        <SettingRow label={t('filesSettings.maxUpload')}>
          <Form.Item name="maxUploadMb" noStyle>
            <InputNumber min={1} max={4096} addonAfter={t('format.bytes.mb')} style={{ width: 160 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={<HintLabel id="files.quota">{t('filesSettings.quota')}</HintLabel>} description={t('filesSettings.quotaDesc')}>
          <Form.Item name="quotaMb" noStyle>
            <InputNumber min={0} max={10000000} addonAfter={t('format.bytes.mb')} style={{ width: 180 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.trashDays')} description={t('filesSettings.trashDaysDesc')}>
          <Form.Item name="trashDays" noStyle>
            <InputNumber min={1} max={365} addonAfter={t('settings.login.days')} style={{ width: 160 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.allowAny')} description={t('filesSettings.allowAnyDesc')}>
          <Form.Item name="allowAny" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        {!allowAny && (
          <SettingRow label={t('kbSettings.types')} stacked>
            <Form.Item name="fileGroups" noStyle>
              <Checkbox.Group className="type-groups" options={GROUPS.map((group) => ({ value: group, label: t(`kbSettings.group_${group}`) }))} />
            </Form.Item>
          </SettingRow>
        )}
      </SettingsSection>
      <SettingsSection title={t('filesSettings.sharing')} description={t('filesSettings.sharingDesc')}>
        <SettingRow label={t('filesSettings.spaceCreation')} description={t('filesSettings.spaceCreationDesc')}>
          <Form.Item name="spaceCreation" noStyle>
            <Radio.Group
              optionType="button"
              options={[
                { value: 'everyone', label: t('tasksSettings.creation_everyone') },
                { value: 'admins', label: t('tasksSettings.creation_admins') },
              ]}
            />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.publicLinks')} description={t('filesSettings.publicLinksDesc')}>
          <Form.Item name="publicLinks" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={<HintLabel id="files.requirePassword">{t('filesSettings.requirePassword')}</HintLabel>}>
          <Form.Item name="requireLinkPassword" valuePropName="checked" noStyle>
            <Switch disabled={!links} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.maxDays')} description={t('filesSettings.maxDaysDesc')}>
          <Form.Item name="maxLinkDays" noStyle>
            <InputNumber min={0} max={3650} disabled={!links} addonAfter={t('settings.login.days')} style={{ width: 160 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.linkSharing')} description={t('filesSettings.linkSharingDesc')}>
          <Form.Item name="linkSharing" noStyle>
            <Radio.Group
              optionType="button"
              disabled={!links}
              options={[
                { value: 'owners', label: t('filesSettings.linkSharing_owners') },
                { value: 'members', label: t('filesSettings.linkSharing_members') },
              ]}
            />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.writeLinks')} description={t('filesSettings.writeLinksDesc')}>
          <Form.Item name="writeLinks" valuePropName="checked" noStyle>
            <Switch disabled={!links} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.writeLinkPassword')} description={t('filesSettings.writeLinkPasswordDesc')}>
          <Form.Item name="requireWriteLinkPassword" valuePropName="checked" noStyle>
            <Switch disabled={!links || writeLinks === false} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.linkQuota')} description={t('filesSettings.linkQuotaDesc')}>
          <Form.Item name="linkQuotaMb" noStyle>
            <InputNumber min={0} max={10000000} disabled={!links || writeLinks === false} addonAfter={t('format.bytes.mb')} style={{ width: 180 }} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function FilesSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <FilesForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
