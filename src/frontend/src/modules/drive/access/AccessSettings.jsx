import { Form, Input, Select, Switch } from 'antd';
import './access.css';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useLocale } from '../../../context/LocaleContext';

const RIGHTS = ['modify', 'read_execute', 'read', 'full_control'];
// { wh: 'co' } ↔ ['wh=co'] for a tags field.
const aliasTags = (value) => ({ value: Object.entries(value && typeof value === 'object' ? value : {}).map(([from, to]) => `${from}=${to}`) });
const aliasMap = (tags) =>
  Object.fromEntries(
    (tags || [])
      .map((tag) => String(tag).toLowerCase().split(/\s*(?:=|→|->|:)\s*/))
      .filter((pair) => pair.length === 2 && pair[0] && pair[1] && pair[0] !== pair[1])
  );
const DN_PLACEHOLDER = 'OU=Groups,OU=CO,OU=Accounts,DC=example,DC=com';

/**
 * File server settings → «Управление доступом»: the block's own switch and its settings, as
 * fields of the File server settings form (modules.drive.settings.access). The path prefixes
 * that map description paths to File server folders are set per folder (share editor).
 */
export default function AccessSettingsFields({ form }) {
  const { t } = useLocale();
  const enabled = Form.useWatch(['access', 'enabled'], form);
  const right = (value) => ({ value, label: t(`folderAccess.settings.rights.${value}`) });
  return (
    <>
      <SettingsSection title={t('folderAccess.settings.title')} description={t('folderAccess.settings.lead')}>
        <SettingRow label={t('folderAccess.settings.enabled')} description={t('folderAccess.settings.enabledDesc')}>
          <Form.Item name={['access', 'enabled']} valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        {enabled && (
          <>
            <SettingRow label={t('folderAccess.settings.prefix')} description={t('folderAccess.settings.prefixDesc')}>
              <Form.Item name={['access', 'prefix']} noStyle>
                <Input style={{ width: 140 }} />
              </Form.Item>
            </SettingRow>
            <SettingRow label={t('folderAccess.settings.projects')} description={t('folderAccess.settings.projectsDesc')}>
              <Form.Item name={['access', 'projects']} noStyle>
                <Select mode="tags" style={{ width: 280 }} tokenSeparators={[',', ' ']} placeholder={t('folderAccess.settings.projectsAny')} open={false} />
              </Form.Item>
            </SettingRow>
            <SettingRow label={t('folderAccess.settings.defaultProject')} description={t('folderAccess.settings.defaultProjectDesc')}>
              <Form.Item name={['access', 'defaultProject']} noStyle>
                <Input style={{ width: 140 }} placeholder="co" />
              </Form.Item>
            </SettingRow>
            <SettingRow label={t('folderAccess.settings.projectAliases')} description={t('folderAccess.settings.projectAliasesDesc')}>
              <Form.Item name={['access', 'projectAliases']} noStyle getValueProps={aliasTags} normalize={aliasMap}>
                <Select mode="tags" style={{ width: 280 }} tokenSeparators={[',', ' ', ';']} placeholder="wh=co" open={false} />
              </Form.Item>
            </SettingRow>
            <SettingRow label={t('folderAccess.settings.nameTemplate')} description={t('folderAccess.settings.nameTemplateDesc')}>
              <Form.Item name={['access', 'nameTemplate']} noStyle>
                <Input style={{ width: 280 }} />
              </Form.Item>
            </SettingRow>
          </>
        )}
      </SettingsSection>
      {enabled && (
        <>
          <SettingsSection title={t('folderAccess.settings.directory')} description={t('folderAccess.settings.directoryDesc')}>
            <SettingRow label={t('folderAccess.settings.groupsBase')} description={t('folderAccess.settings.groupsBaseDesc')} stacked>
              <Form.Item name={['access', 'groupsBase']} noStyle>
                <Input placeholder="OU=Accounts,DC=example,DC=com" />
              </Form.Item>
            </SettingRow>
            <SettingRow label={t('folderAccess.settings.groupOus')} description={t('folderAccess.settings.groupOusDesc')} stacked>
              <Form.Item name={['access', 'groupOus']} noStyle>
                <Select mode="tags" tokenSeparators={[';', '\n']} placeholder={DN_PLACEHOLDER} open={false} />
              </Form.Item>
            </SettingRow>
            <SettingRow label={t('folderAccess.settings.newGroupOu')} description={t('folderAccess.settings.newGroupOuDesc')} stacked>
              <Form.Item name={['access', 'newGroupOu']} noStyle>
                <Input placeholder={DN_PLACEHOLDER} />
              </Form.Item>
            </SettingRow>
            <SettingRow label={t('folderAccess.settings.subjectsBase')} description={t('folderAccess.settings.subjectsBaseDesc')} stacked>
              <Form.Item name={['access', 'subjectsBase']} noStyle>
                <Input placeholder="DC=example,DC=com" />
              </Form.Item>
            </SettingRow>
            <SettingRow label={t('folderAccess.settings.protectedGroups')} description={t('folderAccess.settings.protectedGroupsDesc')}>
              <Form.Item name={['access', 'protectedGroups']} noStyle>
                <Select mode="tags" style={{ width: 300 }} tokenSeparators={[',', ' ']} open={false} />
              </Form.Item>
            </SettingRow>
            <SettingRow label={t('folderAccess.settings.otherGroups')} description={t('folderAccess.settings.otherGroupsDesc')}>
              <Form.Item name={['access', 'otherGroups']} noStyle>
                <Select mode="tags" style={{ width: 300 }} tokenSeparators={[',', ' ']} open={false} />
              </Form.Item>
            </SettingRow>
          </SettingsSection>
          <SettingsSection title={t('folderAccess.settings.typeMap')} description={t('folderAccess.settings.typeMapDesc')}>
            <SettingRow label={t('folderAccess.type.full')}>
              <Form.Item name={['access', 'typeMap', 'full']} noStyle>
                <Select style={{ width: 220 }} options={RIGHTS.map(right)} />
              </Form.Item>
            </SettingRow>
            <SettingRow label={t('folderAccess.type.read')}>
              <Form.Item name={['access', 'typeMap', 'read']} noStyle>
                <Select style={{ width: 220 }} options={RIGHTS.map(right)} />
              </Form.Item>
            </SettingRow>
            <p className="fa-note fa-settings-note">{t('folderAccess.settings.prefixesNote')}</p>
          </SettingsSection>
        </>
      )}
    </>
  );
}
