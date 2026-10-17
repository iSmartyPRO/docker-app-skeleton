import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Input, Modal, Popconfirm, Skeleton, Tag } from 'antd';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { IconTelegram } from '../../components/icons/AdminIcons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { formatRelative } from '../../lib/format';
import api from '../../services/api';

/*
 * Users → a person → links to integrations:
 *   - Active Directory: link a manually created person to a directory account
 *     (search the directory), or unlink;
 *   - Domain password (superadministrators): check a domain login and password
 *     and store it for file servers — for people who sign in with a code;
 *   - Telegram (link by id / unlink), Google (unlink), Mattermost and WhatsApp
 *     phone at a glance;
 *   - "Sign in as" this person (superadministrators).
 */

function DirectoryPicker({ open, userId, onClose, onPick }) {
  const { t } = useLocale();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!open) return undefined;
    const text = q.trim();
    if (text.length < 2) {
      setPeople(null);
      return undefined;
    }
    const mine = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/admin/directory/search', { params: { q: text, forUser: userId } });
        if (mine === seq.current) {
          setPeople(res.data.people);
          setError(null);
        }
      } catch (err) {
        if (mine === seq.current) setError(errorMessage(err));
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, open, userId]);

  return (
    <Modal open={open} title={t('userLinks.pickTitle')} onCancel={onClose} footer={null} destroyOnHidden width={560}>
      <Input.Search autoFocus allowClear value={q} onChange={(event) => setQ(event.target.value)} loading={loading} placeholder={t('userLinks.pickSearch')} />
      <div className="ulink-results">
        {error && <div className="ulink-error">✕ {error}</div>}
        {people && people.length === 0 && <div className="muted">{t('userLinks.pickNothing')}</div>}
        {(people || []).map((person) => (
          <button key={person.dn} type="button" className="ulink-person" disabled={Boolean(person.linkedTo)} onClick={() => onPick(person)}>
            <strong>{person.displayName}</strong>
            <span>
              {person.username}
              {person.email ? ` · ${person.email}` : ''}
            </span>
            <code>{person.dn}</code>
            {person.linkedTo && <Tag color="orange">{t('userLinks.takenBy', { name: person.linkedTo.username })}</Tag>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export default function UserLinks({ user, canManage, isSelf }) {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const [data, setData] = useState(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(null);
  const [cred, setCred] = useState({ login: '', password: '' });
  const [checked, setChecked] = useState(null);
  const [tg, setTg] = useState({ id: '', username: '' });

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/admin/users/${user.id}/links`);
      setData(res.data);
    } catch (err) {
      message.error(errorMessage(err));
    }
  }, [user.id, message]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (data?.links?.directory?.username && !cred.login) setCred((value) => ({ ...value, login: data.links.directory.username }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.links?.directory?.username]);

  const act = async (key, request, done) => {
    setBusy(key);
    try {
      const res = await request();
      if (res.data?.links) setData((value) => ({ ...value, links: res.data.links }));
      else await load();
      if (done) message.success(done);
      return res;
    } catch (err) {
      message.error(errorMessage(err));
      return null;
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <SettingsSection title={t('userLinks.title')}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </SettingsSection>
    );
  }
  const { links, canSetPassword, canImpersonate } = data;
  const dir = links.directory;

  return (
    <>
      <SettingsSection title={t('userLinks.title')} description={t('userLinks.desc')}>
        <SettingRow label={t('userLinks.directory')} description={t('userLinks.directoryDesc')}>
          {!links.directoryReady && !dir ? (
            <span className="muted">
              {t('userLinks.directoryOff')} <Link to="/admin/settings/ad">{t('userLinks.setUp')} →</Link>
            </span>
          ) : dir ? (
            <div className="ulink-card">
              <div>
                <strong>{dir.displayName || dir.username || t('userLinks.directoryLinked')}</strong>
                {dir.found === false && <Tag color="red">{t('userLinks.notFound')}</Tag>}
                {dir.unreachable && <Tag color="orange">{t('userLinks.unreachable')}</Tag>}
                <span className="muted">
                  {[dir.username, dir.email].filter(Boolean).join(' · ')}
                </span>
                <code>{dir.dn}</code>
              </div>
              {canManage && (
                <div className="ulink-actions">
                  <Button size="small" onClick={() => setPicker(true)} disabled={!links.directoryReady}>
                    {t('userLinks.change')}
                  </Button>
                  <Popconfirm title={t('userLinks.unlinkConfirm')} onConfirm={() => act('unlink', () => api.delete(`/admin/users/${user.id}/directory`), t('common.saved'))}>
                    <Button size="small" type="text" danger loading={busy === 'unlink'}>
                      {t('users.unlink')}
                    </Button>
                  </Popconfirm>
                </div>
              )}
            </div>
          ) : (
            <div className="ulink-card is-empty">
              <span className="muted">{t('userLinks.directoryNone')}</span>
              {canManage && (
                <Button type="primary" size="small" onClick={() => setPicker(true)}>
                  {t('userLinks.link')}
                </Button>
              )}
            </div>
          )}
        </SettingRow>

        {canSetPassword && links.directoryReady && !isSelf && (
          <SettingRow label={t('userLinks.password')} description={t('userLinks.passwordDesc')} stacked>
            <div className="ulink-cred">
              {links.domainPassword ? (
                <div className="ulink-stored">
                  <Tag color={links.domainPassword.status === 'ok' ? 'green' : 'red'} bordered={false}>
                    {links.domainPassword.status === 'ok' ? t('userLinks.stored') : t('userLinks.storedFailed')}
                  </Tag>
                  <span>
                    {links.domainPassword.username} · {t(`userLinks.source.${links.domainPassword.source}`)} · {formatRelative(links.domainPassword.updatedAt, locale)}
                  </span>
                  <Popconfirm title={t('userLinks.forgetConfirm')} onConfirm={() => act('forget', () => api.delete(`/admin/users/${user.id}/directory/password`), t('common.saved'))}>
                    <Button size="small" type="text" danger loading={busy === 'forget'}>
                      {t('userLinks.forget')}
                    </Button>
                  </Popconfirm>
                </div>
              ) : (
                <span className="muted">{t('userLinks.notStored')}</span>
              )}
              <div className="ulink-cred__form">
                <Input value={cred.login} onChange={(event) => setCred({ ...cred, login: event.target.value })} placeholder={t('userLinks.login')} autoComplete="off" />
                <Input.Password value={cred.password} onChange={(event) => setCred({ ...cred, password: event.target.value })} placeholder={t('userLinks.passwordPh')} autoComplete="new-password" />
                <Button
                  loading={busy === 'test'}
                  disabled={!cred.login || !cred.password}
                  onClick={async () => {
                    const res = await act('test', () => api.post(`/admin/users/${user.id}/directory/test`, cred));
                    setChecked(res ? res.data.profile : false);
                  }}
                >
                  {t('userLinks.test')}
                </Button>
                <Button
                  type="primary"
                  loading={busy === 'save'}
                  disabled={!cred.login || !cred.password}
                  onClick={async () => {
                    const res = await act('save', () => api.put(`/admin/users/${user.id}/directory/password`, cred), t('userLinks.saved'));
                    if (res) {
                      setCred((value) => ({ ...value, password: '' }));
                      setChecked(null);
                      if (!res.data.stored) message.warning(t('userLinks.noDrive'));
                    }
                  }}
                >
                  {t('common.save')}
                </Button>
              </div>
              {checked && (
                <div className="ulink-ok">
                  ✓ {t('userLinks.testOk', { name: checked.displayName, login: checked.username })}
                  {dir && dir.dn.toLowerCase() !== checked.dn.toLowerCase() && <div className="ulink-error">{t('userLinks.otherAccount')}</div>}
                </div>
              )}
            </div>
          </SettingRow>
        )}

        <SettingRow label="Telegram" description={t('users.telegramDesc')}>
          {links.telegram ? (
            <span className="linked-account">
              <IconTelegram />
              <span>{links.telegram.username ? `@${links.telegram.username}` : `ID ${links.telegram.id}`}</span>
              {canManage && (
                <Popconfirm title={t('users.unlinkTelegram')} onConfirm={() => act('tg', () => api.delete(`/admin/users/${user.id}/telegram`), t('common.saved'))}>
                  <Button size="small" type="text" danger>
                    {t('users.unlink')}
                  </Button>
                </Popconfirm>
              )}
            </span>
          ) : canManage ? (
            <div className="ulink-inline">
              <Input value={tg.id} onChange={(event) => setTg({ ...tg, id: event.target.value.replace(/\D/g, '') })} placeholder={t('userLinks.telegramId')} inputMode="numeric" style={{ width: 150 }} />
              <Input value={tg.username} onChange={(event) => setTg({ ...tg, username: event.target.value })} prefix="@" placeholder={t('common.a11y.username')} style={{ width: 150 }} />
              <Button disabled={tg.id.length < 4} loading={busy === 'tglink'} onClick={() => act('tglink', () => api.put(`/admin/users/${user.id}/telegram`, { telegramId: tg.id, username: tg.username }), t('common.saved'))}>
                {t('userLinks.link')}
              </Button>
            </div>
          ) : (
            <span className="muted">{t('users.telegramNotLinked')}</span>
          )}
        </SettingRow>

        <SettingRow label="Google" description={t('userLinks.googleDesc')}>
          {links.google ? (
            <span className="linked-account">
              <span>{links.google.email}</span>
              {links.google.status !== 'ok' && <Tag color="orange">{links.google.status}</Tag>}
              {canManage && (
                <Popconfirm title={t('userLinks.googleUnlink')} onConfirm={() => act('google', () => api.delete(`/admin/users/${user.id}/google`), t('common.saved'))}>
                  <Button size="small" type="text" danger>
                    {t('users.unlink')}
                  </Button>
                </Popconfirm>
              )}
            </span>
          ) : (
            <span className="muted">{t('userLinks.googleNone')}</span>
          )}
        </SettingRow>

        <SettingRow label={t('userLinks.messengers')} description={t('userLinks.messengersDesc')}>
          <span className="ulink-chips">
            <Tag bordered={false} color={links.phone ? 'green' : 'default'}>WhatsApp: {links.phone || '—'}</Tag>
            <Tag bordered={false} color={links.mattermost ? 'green' : 'default'}>Mattermost: {links.mattermost || '—'}</Tag>
          </span>
        </SettingRow>
      </SettingsSection>

      {canImpersonate && !isSelf && (
        <SettingsSection title={t('userLinks.asTitle')} description={t('userLinks.asDesc')}>
          <Button
            icon={<span aria-hidden="true">👁</span>}
            disabled={user.isActive === false || user.isBlocked}
            loading={busy === 'as'}
            onClick={() =>
              modal.confirm({
                title: t('userLinks.asConfirmTitle', { name: user.displayName || user.username }),
                content: t('userLinks.asConfirmText'),
                okText: t('userLinks.asGo'),
                cancelText: t('common.cancel'),
                onOk: async () => {
                  const res = await act('as', () => api.post(`/admin/users/${user.id}/impersonate`));
                  if (res) window.location.assign('/');
                },
              })
            }
          >
            {t('userLinks.asButton', { name: user.displayName || user.username })}
          </Button>
        </SettingsSection>
      )}

      <DirectoryPicker
        open={picker}
        userId={user.id}
        onClose={() => setPicker(false)}
        onPick={async (person) => {
          const res = await act('link', () => api.put(`/admin/users/${user.id}/directory`, { dn: person.dn }), t('userLinks.linked', { name: person.displayName }));
          if (res) setPicker(false);
        }}
      />
    </>
  );
}
