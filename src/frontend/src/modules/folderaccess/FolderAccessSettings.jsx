import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, InputNumber, Select, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { driveApi } from '../drive/api';

const RIGHTS = ['modify', 'read_execute', 'read', 'full_control'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** File server folders for the drive-letter map (empty when the File server module is off). */
function useShares() {
  const [shares, setShares] = useState(null);
  useEffect(() => {
    driveApi
      .admin()
      .then(({ data }) => setShares((data.servers || []).flatMap((server) => (server.shares || []).map((share) => ({ value: share.id, label: `${share.title} — \\\\${server.host}\\${share.share}` })))))
      .catch(() => setShares([]));
  }, []);
  return shares;
}

function FolderAccessForm({ settings, save }) {
  const { t } = useLocale();
  const shares = useShares();
  const state = settings.modules?.folderaccess || { enabled: false, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ enabled, ...rest }) => save({ modules: { folderaccess: { enabled, settings: rest } } }));
  const right = (value) => ({ value, label: t(`folderAccess.settings.rights.${value}`) });
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('folderAccess.settings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('folderAccess.settings.naming')}>
        <SettingRow label={t('folderAccess.settings.prefix')} description={t('folderAccess.settings.prefixDesc')}>
          <Form.Item name="prefix" noStyle>
            <Input style={{ width: 140 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('folderAccess.settings.orgCode')} description={t('folderAccess.settings.orgCodeDesc')}>
          <Form.Item name="orgCode" noStyle>
            <Input style={{ width: 140 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('folderAccess.settings.orgCodes')} description={t('folderAccess.settings.orgCodesDesc')}>
          <Form.Item name="orgCodes" noStyle>
            <Select mode="tags" style={{ width: 260 }} tokenSeparators={[',', ' ']} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('folderAccess.settings.nameTemplate')} description={t('folderAccess.settings.nameTemplateDesc')}>
          <Form.Item name="nameTemplate" noStyle>
            <Input style={{ width: 260 }} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('folderAccess.settings.directory')}>
        <SettingRow label={t('folderAccess.settings.groupsBase')} description={t('folderAccess.settings.groupsBaseDesc')} stacked>
          <Form.Item name="groupsBase" noStyle>
            <Input placeholder="OU=Groups,OU=CO,OU=Accounts,DC=example,DC=com" />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('folderAccess.settings.newGroupOu')} description={t('folderAccess.settings.newGroupOuDesc')} stacked>
          <Form.Item name="newGroupOu" noStyle>
            <Input placeholder="OU=Groups,OU=CO,OU=Accounts,DC=example,DC=com" />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('folderAccess.settings.subjectsBase')} description={t('folderAccess.settings.subjectsBaseDesc')} stacked>
          <Form.Item name="subjectsBase" noStyle>
            <Input placeholder="DC=example,DC=com" />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('folderAccess.settings.protectedGroups')} description={t('folderAccess.settings.protectedGroupsDesc')}>
          <Form.Item name="protectedGroups" noStyle>
            <Select mode="tags" style={{ width: 300 }} tokenSeparators={[',', ' ']} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('folderAccess.settings.otherGroups')} description={t('folderAccess.settings.otherGroupsDesc')}>
          <Form.Item name="otherGroups" noStyle>
            <Select mode="tags" style={{ width: 300 }} tokenSeparators={[',', ' ']} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('folderAccess.settings.driveMap')} description={t('folderAccess.settings.driveMapDesc')}>
        <Form.List name="driveMap">
          {(fields, { add, remove }) => (
            <div className="fa-map">
              {fields.map((field) => (
                <div key={field.key} className="fa-map__row">
                  <Form.Item name={[field.name, 'letter']} noStyle>
                    <Select style={{ width: 90 }} options={LETTERS.map((letter) => ({ value: letter, label: `${letter}:` }))} />
                  </Form.Item>
                  <span>→</span>
                  <Form.Item name={[field.name, 'shareId']} noStyle>
                    {shares && shares.length ? <Select style={{ minWidth: 280 }} options={shares} /> : <InputNumber min={1} placeholder="share id" />}
                  </Form.Item>
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label={t('folderAccess.remove')} />
                </div>
              ))}
              <Button icon={<PlusOutlined />} onClick={() => add({ letter: 'W', shareId: shares?.[0]?.value })}>
                {t('folderAccess.settings.addLetter')}
              </Button>
            </div>
          )}
        </Form.List>
      </SettingsSection>
      <SettingsSection title={t('folderAccess.settings.typeMap')} description={t('folderAccess.settings.typeMapDesc')}>
        <SettingRow label={t('folderAccess.type.full')}>
          <Form.Item name={['typeMap', 'full']} noStyle>
            <Select style={{ width: 220 }} options={RIGHTS.map(right)} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('folderAccess.type.read')}>
          <Form.Item name={['typeMap', 'read']} noStyle>
            <Select style={{ width: 220 }} options={RIGHTS.map(right)} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

/** Settings → Modules → Folder access. */
export default function FolderAccessSettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId || 'folderaccess'} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <FolderAccessForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
