import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, Form, Input, Modal, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { HelpButton } from '../../../help/Hint';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { mpApi } from '../api';
import { useMp } from '../MpContext';
import { STATUSES, formatNumber, statusColor } from '../lib';
import { Empty } from '../components/bits';

/** Projects the person sees, with sales at a glance; administrators create new ones. */
export default function ProjectsPage() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { projects, isAdmin, settings, meta, refresh } = useMp();
  // «Подобрать объект» from a CRM deal: keep the picking mode when a project is chosen here.
  const dealParam = new URLSearchParams(useLocation().search).get('deal');
  const pickSearch = dealParam ? `?deal=${encodeURIComponent(dealParam)}` : '';
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const create = async () => {
    const values = await form.validateFields();
    try {
      const res = await mpApi.createProject(values);
      await refresh();
      setCreating(false);
      message.success(t('mp.projects.created'));
      navigate(`/app/masterplan/p/${res.data.project.id}/structure`);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  return (
    <div className="mp-page">
      <header className="mod-hero" style={{ '--c': '#0F766E' }}>
        <span className="mod-hero__badge" aria-hidden="true"><MenuIcon name="siteplan" /></span>
        <div className="mod-hero__text">
          <h1>{t('apps.masterplan.name')}</h1>
          <p>{t('mp.projects.lead')}</p>
        </div>
        <div className="mod-hero__actions">
          <HelpButton id="masterplan" />
          {isAdmin && <Button type="primary" onClick={() => { form.resetFields(); setCreating(true); }} icon={<PlusOutlined />}>{t('mp.projects.create')}</Button>}
        </div>
      </header>
      {!projects.length ? (
        <Empty icon="🗺️" title={t('mp.projects.empty')} text={isAdmin ? t('mp.projects.emptyAdmin') : t('mp.projects.emptyText')} />
      ) : (
        <div className="mp-projects">
          {projects.map((project) => {
            const total = Object.values(project.counts || {}).reduce((sum, n) => sum + n, 0);
            return (
              <Link key={project.id} to={`/app/masterplan/p/${project.id}/plan${pickSearch}`} className="mp-project">
                <div className="mp-project__head">
                  <strong>{project.name}</strong>
                  {project.code && <span className="mod-pill">{project.code}</span>}
                </div>
                <p>{[project.address, project.class ? t(`mp.class.${project.class}`) : null, t(`mp.pstatus.${project.status}`)].filter(Boolean).join(' · ')}</p>
                {project.counts && total > 0 && (
                  <>
                    <div className="mp-statusbar">
                      {STATUSES.filter((status) => project.counts[status]).map((status) => (
                        <span key={status} style={{ flex: project.counts[status], background: statusColor(status, settings) }} />
                      ))}
                    </div>
                    <div className="mp-project__nums">
                      <span>{t('mp.projects.units', { n: formatNumber(total, locale) })}</span>
                      <span style={{ color: statusColor('free', settings) }}>{t('mp.projects.free', { n: formatNumber(project.counts.free || 0, locale) })}</span>
                    </div>
                  </>
                )}
                <div className="mp-project__roles">{project.myRoles.map((role) => <span key={role} className="mp-chip">{t(`mp.role.${role}`)}</span>)}</div>
              </Link>
            );
          })}
        </div>
      )}
      <Modal open={creating} title={t('mp.projects.create')} onCancel={() => setCreating(false)} onOk={create} okText={t('common.create')} cancelText={t('common.cancel')} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ currency: settings.currency, status: 'sales' }}>
          <Form.Item name="name" label={t('mp.projects.name')} rules={[{ required: true, whitespace: true, message: t('mp.projects.nameRequired') }]}>
            <Input maxLength={160} autoFocus placeholder="White Hills" />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item name="code" label={t('mp.projects.code')}>
              <Input maxLength={30} placeholder="WH" />
            </Form.Item>
            <Form.Item name="currency" label={t('mp.projects.currency')}>
              <Select options={(settings.currencies || []).map((code) => ({ value: code, label: code }))} />
            </Form.Item>
          </div>
          <div className="form-grid-2">
            <Form.Item name="class" label={t('mp.projects.class')}>
              <Select allowClear options={(meta?.projectClasses || []).map((key) => ({ value: key, label: t(`mp.class.${key}`) }))} />
            </Form.Item>
            <Form.Item name="status" label={t('mp.projects.status')}>
              <Select options={(meta?.projectStatuses || []).map((key) => ({ value: key, label: t(`mp.pstatus.${key}`) }))} />
            </Form.Item>
          </div>
          <Form.Item name="address" label={t('mp.projects.address')}>
            <Input maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
