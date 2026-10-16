import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, Modal, Result, Select, Spin, Steps, Tag } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, CopyOutlined, LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { adApi, adError, errorCode, errorInfo } from '../api';
import { useDirectory } from '../DirectoryContext';
import { LOGIN_RE, generatePassword, passwordIssues, rdnName } from '../lib';
import OuTree from './OuTree';
import { PasswordHints, SecureChannelNote } from './Dialogs';

const STEPS = ['person', 'account', 'ou', 'password', 'groups', 'review'];

/**
 * «Create user» wizard: name → login from the template (checked free in the whole domain) →
 * OU inside the root → UPN / mail → initial password (secure channel only) + must change at
 * next logon → groups → review. Without a password the account is created disabled.
 * `initial`: prefill (an employee card passes names, title, department, mail, ou, employeeId).
 */
export default function CreateUserWizard({ open, initial = null, onClose }) {
  const { t } = useLocale();
  const { info, change } = useDirectory();
  const settings = info?.settings || {};
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [loginState, setLoginState] = useState({ checking: false, taken: false, valid: true, suggestion: null });
  const [ou, setOu] = useState(null);
  const [groups, setGroups] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const touched = useRef({ login: false, mail: false, displayName: false });
  const values = Form.useWatch([], form) || {};

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setResult(null);
    setError(null);
    setGroups([]);
    touched.current = { login: false, mail: false, displayName: false };
    form.resetFields();
    form.setFieldsValue({
      givenName: initial?.givenName || '',
      sn: initial?.sn || '',
      title: initial?.title || '',
      department: initial?.department || '',
      company: initial?.company || '',
      telephoneNumber: initial?.phone || '',
      mobile: initial?.mobile || '',
      upnSuffix: settings.upnSuffixes?.[0],
      mustChange: settings.mustChangeDefault !== false,
      enabled: true,
      password: '',
    });
    const start = initial?.ou || settings.defaultUserOu || null;
    setOu(start ? { dn: start, name: rdnName(start) } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Login, display name and mail follow the names until the person edits them.
  const nameKey = `${values.givenName || ''}|${values.sn || ''}`;
  useEffect(() => {
    if (!open || !values.givenName || !values.sn) return undefined;
    if (!touched.current.displayName) form.setFieldValue('displayName', `${values.givenName} ${values.sn}`.trim());
    const timer = setTimeout(async () => {
      try {
        const { data } = await adApi.suggestLogin({ first: values.givenName, last: values.sn });
        if (!touched.current.login && data.login) form.setFieldValue('login', data.login);
        if (!touched.current.mail && data.mail && !initial?.mail) form.setFieldValue('mail', data.mail);
        if (!touched.current.mail && initial?.mail) form.setFieldValue('mail', initial.mail);
        setLoginState({ checking: false, taken: false, valid: true, suggestion: data.taken ? data.login : null, base: data.base, baseTaken: data.taken });
      } catch {
        /* the check below still runs */
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameKey, open]);

  // Is the login free in the domain?
  useEffect(() => {
    const login = values.login;
    if (!open || !login) return undefined;
    if (!LOGIN_RE.test(login)) {
      setLoginState((prev) => ({ ...prev, valid: false, taken: false, checking: false }));
      return undefined;
    }
    setLoginState((prev) => ({ ...prev, checking: true, valid: true }));
    const timer = setTimeout(async () => {
      try {
        const upn = values.upnSuffix ? `${login}@${values.upnSuffix}` : '';
        const { data } = await adApi.checkLogin(login, upn);
        setLoginState((prev) => ({ ...prev, checking: false, valid: data.valid, taken: data.taken || data.upnTaken, suggestion: data.suggestion || null }));
      } catch {
        setLoginState((prev) => ({ ...prev, checking: false }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [values.login, values.upnSuffix, open]);

  const searchGroups = async (q) => {
    if (!String(q).trim()) return;
    try {
      const { data } = await adApi.groups(q);
      setGroupOptions(data.groups.map((group) => ({ value: group.dn, label: group.name, group })));
    } catch {
      setGroupOptions([]);
    }
  };

  // The server checks the password against the display name it will write (else «first last»).
  const personName = String(values.displayName || '').trim() || `${values.givenName || ''} ${values.sn || ''}`.trim();
  const fieldsOf = { person:['givenName', 'sn', 'displayName'], account: ['login', 'upnSuffix', 'mail'], password: ['password'] };
  const canNext = () => {
    const key = STEPS[step];
    if (key === 'account') return values.login && loginState.valid && !loginState.taken && !loginState.checking;
    if (key === 'ou') return Boolean(ou);
    if (key === 'password') return !values.password || passwordIssues(values.password, settings, { login: values.login, name: personName }).length === 0;
    return true;
  };
  const next = async () => {
    const key = STEPS[step];
    if (fieldsOf[key]) await form.validateFields(fieldsOf[key]);
    setStep((value) => Math.min(STEPS.length - 1, value + 1));
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    const body = {
      givenName: values.givenName,
      sn: values.sn,
      displayName: values.displayName,
      title: values.title,
      department: values.department,
      company: values.company,
      telephoneNumber: values.telephoneNumber,
      mobile: values.mobile,
      login: values.login,
      upnSuffix: values.upnSuffix,
      mail: values.mail,
      ou: ou?.dn,
      password: values.password || undefined,
      mustChange: values.mustChange,
      enabled: values.enabled,
      groups,
      employeeId: initial?.employeeId || undefined,
    };
    try {
      const data = await change(() => adApi.createUser(body), { rethrow: true, success: false });
      if (data) setResult(data);
    } catch (err) {
      const code = errorCode(err);
      const extra = errorInfo(err);
      if (code === 'AD_LOGIN_TAKEN') {
        setLoginState((prev) => ({ ...prev, taken: true, suggestion: extra?.suggestion || null }));
        setStep(1);
      }
      setError(extra?.issues?.length ? `${adError(err, t)}: ${extra.issues.map((issue) => t(`directory.password.issue.${issue}`)).join(', ')}` : adError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const groupLabels = useMemo(() => new Map(groupOptions.map((option) => [option.value, option.label])), [groupOptions]);
  const [knownGroups, setKnownGroups] = useState(new Map());
  useEffect(() => {
    setKnownGroups((prev) => new Map([...prev, ...groupLabels]));
  }, [groupLabels]);

  const loginStatus = loginState.checking ? (
    <span className="ad-muted"><LoadingOutlined /> {t('directory.wizard.checking')}</span>
  ) : !loginState.valid ? (
    <span className="ad-bad"><CloseCircleFilled /> {t('directory.errors.AD_BAD_LOGIN')}</span>
  ) : loginState.taken ? (
    <span className="ad-bad">
      <CloseCircleFilled /> {t('directory.wizard.taken')}
      {loginState.suggestion && (
        <Button size="small" type="link" onClick={() => form.setFieldValue('login', loginState.suggestion)}>
          {t('directory.wizard.use', { login: loginState.suggestion })}
        </Button>
      )}
    </span>
  ) : values.login ? (
    <span className="ad-good"><CheckCircleFilled /> {t('directory.wizard.free')}</span>
  ) : null;

  const footer = result
    ? [
        <Button key="again" onClick={() => { setResult(null); setStep(0); form.resetFields(); }}>{t('directory.wizard.another')}</Button>,
        <Button key="open" type="primary" onClick={() => onClose(result.dn)}>{t('directory.wizard.openCard')}</Button>,
      ]
    : [
        step > 0 && <Button key="back" onClick={() => setStep((value) => value - 1)}>{t('directory.wizard.back')}</Button>,
        step < STEPS.length - 1 ? (
          <Button key="next" type="primary" disabled={!canNext()} onClick={next}>
            {t('directory.wizard.next')}
          </Button>
        ) : (
          <Button key="create" type="primary" loading={busy} onClick={create}>
            {t('directory.wizard.create')}
          </Button>
        ),
      ].filter(Boolean);

  return (
    <Modal open={open} title={t('directory.wizard.title')} onCancel={() => onClose(result?.dn || null)} width={720} footer={footer} destroyOnHidden maskClosable={false} className="ad-wizard">
      {result ? (
        <Result
          status={result.warnings?.length ? 'warning' : 'success'}
          title={t('directory.wizard.created', { login: result.login })}
          subTitle={result.warnings?.map((warning) => t(`directory.wizard.warning.${warning}`)).join(' ')}
          extra={
            <ul className="ad-steps-result">
              {result.steps.map((item, index) => (
                <li key={index} className={item.ok ? 'is-ok' : 'is-bad'}>
                  {item.ok ? <CheckCircleFilled /> : <CloseCircleFilled />} {t(`directory.wizard.step.${item.step}`, { group: item.group || '' })}
                  {!item.ok && item.code ? ` — ${t(`directory.errors.${item.code}`)}` : ''}
                </li>
              ))}
              {result.employee?.employee && <li className="is-ok"><CheckCircleFilled /> {t('directory.wizard.employeeLinked', { name: result.employee.employee.name })}</li>}
            </ul>
          }
        />
      ) : (
        <>
          <Steps size="small" current={step} className="ad-wizard__steps" items={STEPS.map((key) => ({ title: t(`directory.wizard.steps.${key}`) }))} responsive={false} />
          <Form form={form} layout="vertical" className="ad-wizard__body" onValuesChange={(changed) => {
            if ('login' in changed) touched.current.login = true;
            if ('mail' in changed) touched.current.mail = true;
            if ('displayName' in changed) touched.current.displayName = true;
          }}>
            <div hidden={STEPS[step] !== 'person'} className="ad-edit-grid">
              <Form.Item name="givenName" label={t('directory.attr.givenName')} rules={[{ required: true, message: t('directory.wizard.required') }]}>
                <Input autoFocus maxLength={64} />
              </Form.Item>
              <Form.Item name="sn" label={t('directory.attr.sn')} rules={[{ required: true, message: t('directory.wizard.required') }]}>
                <Input maxLength={64} />
              </Form.Item>
              <Form.Item name="displayName" label={t('directory.attr.displayName')} className="ad-edit-grid__wide" extra={t('directory.wizard.displayNameHint')}>
                <Input maxLength={256} />
              </Form.Item>
              <Form.Item name="title" label={t('directory.attr.title')}><Input maxLength={128} /></Form.Item>
              <Form.Item name="department" label={t('directory.attr.department')}><Input maxLength={64} /></Form.Item>
              <Form.Item name="company" label={t('directory.attr.company')}><Input maxLength={64} /></Form.Item>
              <Form.Item name="telephoneNumber" label={t('directory.attr.telephoneNumber')}><Input maxLength={64} /></Form.Item>
            </div>
            <div hidden={STEPS[step] !== 'account'}>
              <Form.Item name="login" label={t('directory.attr.sAMAccountName')} normalize={(value) => String(value || '').toLowerCase().replace(/[^a-z0-9._-]/g, '')} extra={<div className="ad-login-help">{loginStatus}<span className="ad-muted">{t('directory.wizard.template', { template: settings.loginTemplate || '{f}.{last}' })}</span></div>}>
                <Input maxLength={20} />
              </Form.Item>
              <div className="ad-edit-grid">
                <Form.Item name="upnSuffix" label={t('directory.wizard.upnSuffix')} extra={values.login && values.upnSuffix ? `${values.login}@${values.upnSuffix}` : null}>
                  <Select options={(settings.upnSuffixes || []).map((suffix) => ({ value: suffix, label: `@${suffix}` }))} />
                </Form.Item>
                <Form.Item name="mail" label={t('directory.attr.mail')} rules={[{ type: 'email', message: t('directory.errors.AD_BAD_MAIL') }]}>
                  <Input maxLength={256} />
                </Form.Item>
              </div>
            </div>
            <div hidden={STEPS[step] !== 'ou'}>
              <p className="ad-muted">{t('directory.wizard.ouLead')}</p>
              <div className="ad-picker">{open && <OuTree selected={ou?.dn} onSelect={(dn, node) => setOu({ dn, name: node.name })} height={300} />}</div>
              {ou && <div className="ad-picked">{t('directory.wizard.ouChosen', { name: ou.name })}</div>}
            </div>
            <div hidden={STEPS[step] !== 'password'}>
              <SecureChannelNote info={info} />
              {info?.passwordsAvailable ? (
                <>
                  <Form.Item label={t('directory.password.initial')} extra={t('directory.wizard.passwordOptional')}>
                    <div className="ad-row">
                      <Form.Item name="password" noStyle>
                        <Input.Password autoComplete="new-password" />
                      </Form.Item>
                      <Button icon={<ReloadOutlined />} onClick={() => form.setFieldValue('password', generatePassword())}>{t('directory.password.generate')}</Button>
                      <Button icon={<CopyOutlined />} disabled={!values.password} onClick={() => navigator.clipboard?.writeText(values.password)} aria-label={t('directory.password.copy')} />
                    </div>
                  </Form.Item>
                  {values.password && <PasswordHints password={values.password} policy={settings} login={values.login} name={personName} />}
                  <Form.Item name="mustChange" valuePropName="checked" noStyle>
                    <Checkbox disabled={!values.password}>{t('directory.password.mustChange')}</Checkbox>
                  </Form.Item>
                  <br />
                  <Form.Item name="enabled" valuePropName="checked" noStyle>
                    <Checkbox disabled={!values.password}>{t('directory.wizard.enableNow')}</Checkbox>
                  </Form.Item>
                </>
              ) : (
                <Alert type="info" showIcon message={t('directory.wizard.noPassword')} />
              )}
            </div>
            <div hidden={STEPS[step] !== 'groups'}>
              <p className="ad-muted">{t('directory.wizard.groupsLead')}</p>
              <Select
                mode="multiple"
                showSearch
                filterOption={false}
                onSearch={searchGroups}
                value={groups}
                onChange={setGroups}
                options={groupOptions}
                style={{ width: '100%' }}
                placeholder={t('directory.groups.search')}
                notFoundContent={null}
              />
              <p className="ad-note">{t('directory.groups.note')}</p>
            </div>
            <div hidden={STEPS[step] !== 'review'}>
              <dl className="ad-fields ad-review">
                <div className="ad-field"><dt>{t('directory.attr.displayName')}</dt><dd>{values.displayName}</dd></div>
                <div className="ad-field"><dt>{t('directory.attr.sAMAccountName')}</dt><dd>{values.login}</dd></div>
                <div className="ad-field"><dt>{t('directory.attr.userPrincipalName')}</dt><dd>{values.login}@{values.upnSuffix}</dd></div>
                <div className="ad-field"><dt>{t('directory.attr.mail')}</dt><dd>{values.mail || '—'}</dd></div>
                <div className="ad-field ad-field--wide"><dt>{t('directory.card.ou')}</dt><dd>{ou?.name}</dd></div>
                <div className="ad-field"><dt>{t('directory.password.initial')}</dt><dd>{values.password ? t('directory.wizard.passwordSet') : t('directory.wizard.passwordNone')}</dd></div>
                <div className="ad-field"><dt>{t('directory.wizard.stateAfter')}</dt><dd>{values.password && values.enabled ? t('directory.status.enabled') : t('directory.status.disabled')}{values.password && values.mustChange ? ` · ${t('directory.status.mustChange')}` : ''}</dd></div>
                <div className="ad-field ad-field--wide"><dt>{t('directory.card.groups')}</dt><dd>{groups.length ? groups.map((dn) => <Tag key={dn}>{knownGroups.get(dn) || rdnName(dn)}</Tag>) : '—'}</dd></div>
              </dl>
              {error && <Alert type="error" showIcon message={error} />}
              {busy && <Spin />}
            </div>
          </Form>
        </>
      )}
    </Modal>
  );
}
