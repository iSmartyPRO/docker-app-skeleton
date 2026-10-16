import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button } from 'antd';
import { ApiOutlined, ApartmentOutlined, ExperimentOutlined, LockOutlined, SafetyOutlined, TeamOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { useAuth } from '../../../context/AuthContext';
import { can } from '../../../lib/access';
import { errorMessage } from '../../../lib/errors';
import api from '../../../services/api';
import { useDirectory } from '../DirectoryContext';

/**
 * Shown while there is nothing to browse: the AD integration is not set up (and no demo
 * directory), or no managed root is chosen. Explains the setup step by step; a
 * superadministrator can fill the demo directory to look around.
 */
export default function Setup() {
  const { t } = useLocale();
  const { user } = useAuth();
  const { message } = App.useApp();
  const { info, refresh } = useDirectory();
  const [busy, setBusy] = useState(false);
  const noRoot = info?.mode !== 'off' && !info?.setup?.rootSet;
  const superadmin = (user?.permissions || []).includes('*');
  const canIntegrations = can(user, 'settings.integrations');
  const canModules = can(user, 'settings.modules');

  const seed = async () => {
    setBusy(true);
    try {
      await api.post('/admin/demo/directory/seed');
      message.success(t('directory.setup.demoDone'));
      await refresh();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    { key: 'integration', icon: <ApiOutlined />, done: info?.mode === 'ldap', action: canIntegrations && <Link to="/admin/settings/ad">{t('directory.setup.openIntegration')}</Link> },
    { key: 'root', icon: <ApartmentOutlined />, done: Boolean(info?.setup?.rootSet), action: canModules && <Link to="/admin/settings/directory">{t('directory.setup.openSettings')}</Link> },
    { key: 'secure', icon: <LockOutlined />, done: Boolean(info?.passwordsAvailable), action: null },
    { key: 'admins', icon: <TeamOutlined />, done: false, action: null },
  ];

  return (
    <div className="ad-setup">
      <div className="ad-setup__hero">
        <span className="ad-setup__badge"><SafetyOutlined /></span>
        <div>
          <h1>{noRoot ? t('directory.setup.rootTitle') : t('directory.setup.title')}</h1>
          <p>{noRoot ? t('directory.setup.rootLead') : t('directory.setup.lead')}</p>
        </div>
      </div>
      <ol className="ad-setup__steps">
        {steps.map((step, index) => (
          <li key={step.key} className={step.done ? 'is-done' : ''}>
            <span className="ad-setup__num">{step.done ? '✓' : index + 1}</span>
            <div>
              <h3>
                {step.icon} {t(`directory.setup.steps.${step.key}.title`)}
              </h3>
              <p>{t(`directory.setup.steps.${step.key}.text`)}</p>
              {step.action}
            </div>
          </li>
        ))}
      </ol>
      {info?.mode === 'off' && superadmin && (
        <div className="ad-setup__demo">
          <ExperimentOutlined />
          <div>
            <strong>{t('directory.setup.demoTitle')}</strong>
            <p>{t('directory.setup.demoText')}</p>
          </div>
          <Button type="primary" loading={busy} onClick={seed}>
            {t('directory.setup.demoButton')}
          </Button>
        </div>
      )}
      <p className="ad-note">
        <Link to="/admin/modules/directory/docs">{t('directory.setup.docs')}</Link>
      </p>
    </div>
  );
}
