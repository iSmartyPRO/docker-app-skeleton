import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { App, Avatar, Button, Checkbox, DatePicker, Dropdown, Empty, Modal, Result, Skeleton, Spin, Tabs, Tag, Timeline, Tooltip } from 'antd';
import { CameraOutlined, DeleteOutlined, EditOutlined, MailOutlined, MoreOutlined, PhoneOutlined, UserDeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { empApi } from '../api';
import { useEmp } from '../EmpContext';
import EmployeeForm from '../EmployeeForm';
import AccountPanel from '../components/AccountPanel';
import DocumentsPanel from '../components/DocumentsPanel';
import SkillsPanel from '../components/SkillsPanel';
import { employeeTabs, subscribeEmployeeTabs } from '../extensions';
import { STATUS_COLORS, empError, initials } from '../lib';

/** The employee card (spec §4.1): what the viewer may see, decided by the server. */
export default function EmployeeCard() {
  const { id } = useParams();
  const { t } = useLocale();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { meta, touch } = useEmp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [tab, setTab] = useState('overview');
  const photo = useRef(null);
  const extraTabs = useSyncExternalStore(subscribeEmployeeTabs, employeeTabs);

  const load = useCallback(() => {
    empApi
      .get(id)
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch(setError);
  }, [id]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const changed = (next) => {
    if (next?.employee) setData((prev) => ({ ...prev, ...next }));
    else load();
    touch();
  };

  if (error) return <Result status={error?.response?.status === 404 ? '404' : 'warning'} title={empError(error, t)} extra={<Link to="/app/employees">{t('emp.card.back')}</Link>} />;
  if (!data) {
    return (
      <div className="emp-page">
        <Skeleton active avatar paragraph={{ rows: 6 }} />
      </div>
    );
  }
  const employee = data.employee;
  const can = data.can || {};
  const hr = employee.level === 'hr';

  const uploadPhoto = async (file) => {
    if (!file) return;
    try {
      const res = await empApi.uploadPhoto(employee.id, file);
      changed(res.data);
    } catch (err) {
      message.error(empError(err, t));
    } finally {
      if (photo.current) photo.current.value = '';
    }
  };

  const remove = () =>
    modal.confirm({
      title: t('emp.card.deleteTitle', { name: employee.name }),
      content: t('emp.card.deleteText'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await empApi.remove(employee.id);
          touch();
          navigate('/app/employees');
        } catch (err) {
          message.error(empError(err, t));
        }
      },
    });

  const more = [
    hr && employee.photoUrl && { key: 'photo-off', icon: <CameraOutlined />, label: t('emp.card.removePhoto'), onClick: async () => changed((await empApi.removePhoto(employee.id)).data) },
    hr && { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('emp.card.delete'), onClick: remove },
  ].filter(Boolean);

  const tabs = [
    { key: 'overview', label: t('emp.tabs.overview'), children: <Overview employee={employee} meta={meta} t={t} /> },
    (hr || employee.level === 'self') && {
      key: 'skills',
      label: (
        <span data-tour="emp.tab.skills">
          {t('emp.tabs.skills')}
          {employee.skills?.some((skill) => skill.state === 'expired' || skill.state === 'soon') && <span className="emp-dot" aria-hidden="true" />}
        </span>
      ),
      children: <SkillsPanel employee={employee} canEdit={can.skills} onChanged={changed} />,
    },
    hr && { key: 'documents', label: t('emp.tabs.documents'), children: <DocumentsPanel employee={employee} onChanged={changed} /> },
    hr && { key: 'account', label: <span data-tour="emp.tab.account">{t('emp.tabs.account')}</span>, children: <AccountPanel employee={employee} can={can} onChanged={changed} /> },
    ...extraTabs
      .filter((ext) => !ext.when || ext.when({ employee, meta, data: data.extensions?.[ext.id] }))
      .filter((ext) => data.extensions?.[ext.id] !== undefined || ext.always)
      .map((ext) => ({
        key: `ext:${ext.id}`,
        label: t(ext.labelKey),
        children: (
          <Suspense fallback={<Spin />}>
            <ext.Component employee={employee} data={data.extensions?.[ext.id]} reload={load} can={can} />
          </Suspense>
        ),
      })),
    hr && { key: 'history', label: t('emp.tabs.history'), children: <History items={data.history || []} t={t} /> },
  ].filter(Boolean);

  return (
    <div className="emp-page">
      <nav className="emp-crumbs">
        <Link to="/app/employees">{t('apps.employees.name')}</Link> / <span>{employee.name}</span>
      </nav>
      <header className="emp-hero" data-tour="emp.card">
        <div className="emp-hero__photo">
          <Avatar size={96} src={employee.photoUrl || undefined}>
            {initials(employee.name)}
          </Avatar>
          {hr && (
            <>
              <Tooltip title={t('emp.card.changePhoto')}>
                <button type="button" className="emp-hero__camera" onClick={() => photo.current?.click()} aria-label={t('emp.card.changePhoto')}>
                  <CameraOutlined />
                </button>
              </Tooltip>
              <input ref={photo} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => uploadPhoto(event.target.files?.[0])} />
            </>
          )}
        </div>
        <div className="emp-hero__main">
          <h1>{employee.name}</h1>
          <p className="emp-hero__position">{employee.position?.name || t('emp.card.noPosition')}</p>
          <p className="emp-hero__unit">
            {employee.unit ? (
              <>
                <MenuIcon name="layers" variant="mono" /> {employee.unit.path.join(' / ')}
              </>
            ) : (
              t('emp.card.noUnit')
            )}
          </p>
          <div className="emp-hero__tags">
            <Tag bordered={false} color={STATUS_COLORS[employee.status]}>
              {t(`emp.status.${employee.status}`)}
            </Tag>
            {hr && <Tag bordered={false}>{t(`emp.employment.${employee.employment}`)}</Tag>}
            {hr && employee.personnelNo && <Tag bordered={false}>№ {employee.personnelNo}</Tag>}
            {hr && (employee.user ? <Tag bordered={false} color={employee.user.isBlocked ? 'red' : 'blue'}>{employee.user.isBlocked ? t('emp.account.isBlocked') : t('emp.account.has', { username: employee.user.username })}</Tag> : <Tag bordered={false}>{t('emp.account.none')}</Tag>)}
          </div>
        </div>
        <div className="emp-hero__actions">
          {(can.edit || can.self) && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>
              {can.edit ? t('common.edit') : t('emp.card.editMine')}
            </Button>
          )}
          {hr && employee.status !== 'terminated' && (
            <Button icon={<UserDeleteOutlined />} onClick={() => setTerminating(true)} data-tour="emp.terminate">
              {t('emp.terminate.button')}
            </Button>
          )}
          {more.length > 0 && (
            <Dropdown menu={{ items: more }} trigger={['click']}>
              <Button icon={<MoreOutlined />} aria-label={t('emp.card.more')} />
            </Dropdown>
          )}
        </div>
      </header>
      <Tabs className="emp-tabs" activeKey={tabs.some((item) => item.key === tab) ? tab : 'overview'} onChange={setTab} items={tabs} />
      <EmployeeForm open={editing} employee={employee} selfOnly={!can.edit} onClose={() => setEditing(false)} onSaved={(res) => { setEditing(false); changed(res); }} />
      <TerminateDialog open={terminating} employee={employee} canBlock={Boolean(meta?.rights?.manageUsers)} onClose={() => setTerminating(false)} onDone={(res) => { setTerminating(false); changed(res); }} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="emp-field">
      <dt>{label}</dt>
      <dd>{children || <span className="emp-muted">—</span>}</dd>
    </div>
  );
}

function Overview({ employee, meta, t }) {
  const hr = employee.level === 'hr';
  const own = employee.level !== 'view';
  return (
    <div className="emp-overview">
      <section className="emp-panel">
        <h4>{t('emp.sections.place')}</h4>
        <dl className="emp-fields">
          <Field label={t('emp.fields.position')}>{employee.position?.name}</Field>
          <Field label={t('emp.fields.unit')}>{employee.unit?.path?.join(' / ')}</Field>
          <Field label={t('emp.fields.site')}>{employee.site?.name}</Field>
          <Field label={t('emp.fields.manager')}>
            {employee.manager && (
              <Link to={`/app/employees/${employee.manager.id}`} className="emp-inline-person">
                <Avatar size={22} src={employee.manager.photoUrl || undefined}>
                  {initials(employee.manager.name)}
                </Avatar>
                {employee.manager.name}
              </Link>
            )}
          </Field>
        </dl>
      </section>
      <section className="emp-panel">
        <h4>{t('emp.sections.work')}</h4>
        <dl className="emp-fields">
          <Field label={t('emp.fields.workEmail')}>{employee.work.email && <a href={`mailto:${employee.work.email}`}><MailOutlined /> {employee.work.email}</a>}</Field>
          <Field label={t('emp.fields.workPhone')}>{employee.work.phone && <a href={`tel:${employee.work.phone}`}><PhoneOutlined /> {employee.work.phone}</a>}</Field>
          <Field label={t('emp.fields.workMobile')}>{employee.work.mobile && <a href={`tel:${employee.work.mobile}`}><PhoneOutlined /> {employee.work.mobile}</a>}</Field>
          <Field label={t('emp.fields.workLocation')}>{employee.work.location}</Field>
        </dl>
      </section>
      {hr && (
        <section className="emp-panel">
          <h4>{t('emp.sections.hr')}</h4>
          <dl className="emp-fields">
            <Field label={t('emp.fields.personnelNo')}>{employee.personnelNo}</Field>
            <Field label={t('emp.fields.employment')}>{t(`emp.employment.${employee.employment}`)}</Field>
            <Field label={t('emp.fields.hireDate')}>{employee.hireDate && fmtDate(employee.hireDate)}</Field>
            <Field label={t('emp.fields.terminationDate')}>{employee.terminationDate && fmtDate(employee.terminationDate)}</Field>
            {meta?.ad && <Field label={t('emp.fields.adAccount')}>{employee.adAccount}</Field>}
          </dl>
        </section>
      )}
      {own && (
        <section className="emp-panel emp-panel--private">
          <h4>
            {t('emp.sections.personal')} <Tag bordered={false}>{hr ? t('emp.sections.hrOnly') : t('emp.sections.onlyYou')}</Tag>
          </h4>
          <dl className="emp-fields">
            <Field label={t('emp.fields.birthDate')}>{employee.birthDate && fmtDate(employee.birthDate)}</Field>
            <Field label={t('emp.fields.personalEmail')}>{employee.personal?.email}</Field>
            <Field label={t('emp.fields.personalPhone')}>{employee.personal?.phone}</Field>
            <Field label={t('emp.fields.personalAddress')}>{employee.personal?.address}</Field>
            <Field label={t('emp.fields.emergencyContact')}>{employee.personal?.emergency}</Field>
          </dl>
          {hr && employee.hrNotes && (
            <div className="emp-notes">
              <strong>{t('emp.fields.hrNotes')}</strong>
              <p>{employee.hrNotes}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function History({ items, t }) {
  if (!items.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('emp.history.empty')} />;
  return (
    <Timeline
      className="emp-history"
      items={items.map((event) => {
        const key = event.action.startsWith('status_') ? 'emp.history.status' : `emp.history.${event.action}`;
        const text = t(key, { status: t(`emp.status.${event.action.replace('status_', '')}`), username: event.data?.username || '', name: event.data?.name || '' });
        return {
          key: event.id,
          children: (
            <div className="emp-history__item">
              <span>{text === key ? event.action : text}</span>
              <span className="emp-muted">
                {event.actor?.name || t('emp.history.system')} · {fmtDateTime(event.at)}
              </span>
            </div>
          ),
        };
      })}
    />
  );
}

function TerminateDialog({ open, employee, canBlock, onClose, onDone }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [date, setDate] = useState(dayjs());
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const account = employee.user;
  const offer = canBlock && account && !account.isBlocked;
  useEffect(() => {
    if (open) {
      setDate(dayjs());
      setBlock(true);
    }
  }, [open]);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await empApi.terminate(employee.id, { date: date ? date.format('YYYY-MM-DD') : null, blockUser: Boolean(offer && block) });
      message.success(t('emp.terminate.done', { name: employee.name }));
      onDone(res.data);
    } catch (err) {
      message.error(empError(err, t));
    } finally {
      setBusy(false);
    }
  };
  const notice = useMemo(() => (account && !canBlock ? t('emp.terminate.noRight') : null), [account, canBlock, t]);
  return (
    <Modal open={open} onCancel={onClose} onOk={submit} confirmLoading={busy} title={t('emp.terminate.title', { name: employee.name })} okText={t('emp.terminate.ok')} okButtonProps={{ danger: true }} cancelText={t('common.cancel')} destroyOnClose>
      <div className="emp-terminate">
        <label>
          <span>{t('emp.fields.terminationDate')}</span>
          <DatePicker value={date} onChange={setDate} format="DD.MM.YYYY" style={{ width: '100%' }} allowClear={false} />
        </label>
        {offer && (
          <Checkbox checked={block} onChange={(event) => setBlock(event.target.checked)} data-testid="emp-terminate-block">
            {t('emp.terminate.block', { username: account.username })}
          </Checkbox>
        )}
        {account?.isBlocked && <p className="emp-muted">{t('emp.terminate.alreadyBlocked')}</p>}
        {notice && <p className="emp-muted">{notice}</p>}
        {!account && <p className="emp-muted">{t('emp.terminate.noAccount')}</p>}
      </div>
    </Modal>
  );
}
