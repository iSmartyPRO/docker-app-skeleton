import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Empty, Modal, Space } from 'antd';
import { DisconnectOutlined, ExportOutlined, LinkOutlined, UserAddOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { adApi, objectUrl } from './api';
import { DirectoryProvider, useDirectory } from './DirectoryContext';
import CreateUserWizard from './components/CreateUserWizard';
import { DirectorySearch } from './components/Dialogs';
import { Avatar, LastLogon, PathText, StatusTags } from './components/Bits';
import './directory.css';

function LinkDialog({ open, employee, onClose }) {
  const { t } = useLocale();
  const { change } = useDirectory();
  const [dn, setDn] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const data = await change(() => adApi.employeeLink(dn, employee.id), { success: t('directory.links.employeeLinked') });
    setBusy(false);
    if (data) onClose(true);
  };
  return (
    <Modal open={open} title={t('directory.employeeTab.linkTitle')} onCancel={() => onClose(false)} onOk={submit} okButtonProps={{ disabled: !dn }} confirmLoading={busy} destroyOnHidden>
      <p className="ad-muted">{t('directory.employeeTab.linkLead', { name: employee.name })}</p>
      <DirectorySearch value={dn} onChange={setDn} style={{ width: '100%' }} />
    </Modal>
  );
}

function Section({ employee, data, reload }) {
  const { t } = useLocale();
  const { modal } = App.useApp();
  const { info, change } = useDirectory();
  const [dialog, setDialog] = useState(null);
  if (!data) return null;
  if (data.error) return <Alert type="warning" showIcon message={t('directory.employeeTab.error')} description={data.error} />;
  if (!data.available) {
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`directory.employeeTab.unavailable.${data.reason || 'off'}`)}>
        {data.reason !== 'rights' && <Link to="/app/directory">{t('apps.directory.name')} →</Link>}
      </Empty>
    );
  }
  const rights = data.rights || {};
  const account = data.account;
  const unlink = () =>
    modal.confirm({
      title: t('directory.links.unlinkEmployeeTitle'),
      content: t('directory.links.unlinkEmployeeText', { name: employee.name }),
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await change(() => adApi.employeeUnlink(employee.id));
        if (res) reload?.();
      },
    });
  const initial = {
    givenName: employee.firstName,
    sn: employee.lastName,
    title: employee.position?.name || '',
    department: employee.unit?.name || '',
    mail: employee.work?.email || '',
    phone: employee.work?.phone || '',
    mobile: employee.work?.mobile || '',
    employeeId: employee.id,
  };
  return (
    <div className="ad-emp" data-tour="directory.employee">
      {data.mode === 'demo' && <Alert type="info" showIcon className="ad-gap" message={t('directory.demoBadgeHint')} />}
      {account && !account.hidden ? (
        <div className="ad-emp__card">
          <Avatar object={account} size={52} />
          <div className="ad-emp__main">
            <strong>{account.name}</strong>
            <span className="ad-muted">{[account.login, account.upn].filter(Boolean).join(' · ')}</span>
            <StatusTags object={account} />
            <span className="ad-muted">
              <PathText path={account.path} /> · {t('directory.card.lastLogon')}: <LastLogon value={account.lastLogon} inactiveDays={info?.settings?.inactiveDays} />
            </span>
            <span className="ad-muted">{t(data.by === 'user' ? 'directory.employeeTab.byUser' : 'directory.employeeTab.byLogin')}</span>
          </div>
          <Space wrap>
            <Link to={objectUrl(account.dn)}>
              <Button icon={<ExportOutlined />}>{t('directory.employeeTab.open')}</Button>
            </Link>
            {rights.link && data.by === 'adAccount' && (
              <Button icon={<DisconnectOutlined />} onClick={unlink}>
                {t('directory.links.unlinkEmployee')}
              </Button>
            )}
          </Space>
        </div>
      ) : account?.hidden ? (
        <Alert type="info" showIcon message={t('directory.employeeTab.hidden')} />
      ) : (
        <div className="ad-emp__empty">
          <p>{data.missing ? t('directory.employeeTab.missing', { login: data.missing }) : t('directory.employeeTab.none')}</p>
          {data.suggestion?.login && !data.missing && <p className="ad-muted">{t('directory.employeeTab.suggestion', { login: data.suggestion.login })}</p>}
          <Space wrap>
            {rights.create && (
              <Button type="primary" icon={<UserAddOutlined />} onClick={() => setDialog('create')} data-tour="directory.employeeCreate">
                {t('directory.employeeTab.create')}
              </Button>
            )}
            {rights.link && (
              <Button icon={<LinkOutlined />} onClick={() => setDialog('link')}>
                {t('directory.employeeTab.link')}
              </Button>
            )}
          </Space>
        </div>
      )}
      <CreateUserWizard open={dialog === 'create'} initial={initial} onClose={(dn) => { setDialog(null); if (dn) reload?.(); }} />
      <LinkDialog open={dialog === 'link'} employee={employee} onClose={(done) => { setDialog(null); if (done) reload?.(); }} />
    </div>
  );
}

/**
 * The «AD» tab of an employee card (registered in register.js through the Employees
 * module's registerEmployeeTab). `data` comes from the server extension
 * (modules/directory/employeeSection.js).
 */
export default function EmployeeAdTab({ employee, data, reload }) {
  return (
    <DirectoryProvider>
      <Section employee={employee} data={data} reload={reload} />
    </DirectoryProvider>
  );
}
