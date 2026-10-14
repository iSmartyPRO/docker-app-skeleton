import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Form, Input, Popconfirm, Radio, Select, Switch } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { DateField } from '../../../components/ui/DateTimeField';
import { userOptions } from '../../shared/People';
import { mpApi } from '../api';
import { useMp, useProject } from '../MpContext';

/** Project card and project settings: moderation, readiness mode, level types. */
export default function ProjectForm() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { meta, users, settings, refresh, isAdmin } = useMp();
  const { project, reload } = useProject();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    form.setFieldsValue({
      name: project.name,
      code: project.code,
      address: project.address,
      class: project.class,
      status: project.status,
      currency: project.currency,
      startDate: project.startDate,
      finishDate: project.finishDate,
      managerId: project.manager?.id,
      description: project.description,
      moderation: project.settings.moderation,
      readinessMode: project.settings.readinessMode,
      levels: project.settings.levels,
    });
  }, [project, form]);
  const save = async () => {
    const v = await form.validateFields();
    setBusy(true);
    try {
      await mpApi.updateProject(project.id, {
        name: v.name,
        code: v.code || '',
        address: v.address || '',
        class: v.class || null,
        status: v.status,
        currency: v.currency,
        startDate: v.startDate || null,
        finishDate: v.finishDate || null,
        managerId: v.managerId || null,
        description: v.description || '',
        settings: { moderation: v.moderation, readinessMode: v.readinessMode, levels: v.levels },
      });
      await Promise.all([refresh(), reload()]);
      message.success(t('common.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Form form={form} layout="vertical" className="mp-projectform" requiredMark={false}>
      <div className="form-grid-2">
        <Form.Item name="name" label={t('mp.projects.name')} rules={[{ required: true, whitespace: true }]}><Input maxLength={160} /></Form.Item>
        <Form.Item name="code" label={t('mp.projects.code')}><Input maxLength={30} /></Form.Item>
        <Form.Item name="class" label={t('mp.projects.class')}><Select allowClear options={(meta?.projectClasses || []).map((key) => ({ value: key, label: t(`mp.class.${key}`) }))} /></Form.Item>
        <Form.Item name="status" label={t('mp.projects.status')}><Select options={(meta?.projectStatuses || []).map((key) => ({ value: key, label: t(`mp.pstatus.${key}`) }))} /></Form.Item>
        <Form.Item name="currency" label={t('mp.projects.currency')}><Select options={(settings.currencies || []).map((code) => ({ value: code, label: code }))} /></Form.Item>
        <Form.Item name="managerId" label={t('mp.projects.manager')}><Select allowClear showSearch optionFilterProp="search" options={userOptions(users)} /></Form.Item>
        <Form.Item name="startDate" label={t('mp.projects.start')}><DateField style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="finishDate" label={t('mp.projects.finish')}><DateField style={{ width: '100%' }} /></Form.Item>
      </div>
      <Form.Item name="address" label={t('mp.projects.address')}><Input maxLength={300} /></Form.Item>
      <Form.Item name="description" label={t('mp.st.description')}><Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} maxLength={5000} /></Form.Item>
      <h3 className="mp-subhead">{t('mp.projects.rules')}</h3>
      <Form.Item name="moderation" label={t('mp.projects.moderation')} valuePropName="checked" extra={t('mp.projects.moderationHint')}><Switch /></Form.Item>
      <Form.Item name="readinessMode" label={t('mp.projects.readinessMode')}>
        <Radio.Group options={[{ value: 'stages', label: t('mp.projects.byStages') }, { value: 'manual', label: t('mp.projects.manual') }]} />
      </Form.Item>
      <Form.List name="levels">
        {(fields, { add, remove }) => (
          <div className="mp-levels-edit">
            <label className="mp-ffield"><span>{t('mp.projects.levels')}</span></label>
            {fields.map((field) => (
              <div key={field.key} className="mp-levels-edit__row">
                <Form.Item name={[field.name, 'name']} rules={[{ required: true }]} noStyle><Input placeholder={t('mp.projects.levelName')} maxLength={40} /></Form.Item>
                <Form.Item name={[field.name, 'key']} rules={[{ required: true, pattern: /^[a-z0-9_]+$/ }]} noStyle><Input placeholder="key" maxLength={24} style={{ width: 130 }} /></Form.Item>
                <Button type="text" onClick={() => remove(field.name)} aria-label={t('common.delete')}>✕</Button>
              </div>
            ))}
            <Button size="small" onClick={() => add({ key: '', name: '' })} icon={<PlusOutlined />}>{t('mp.projects.addLevel')}</Button>
          </div>
        )}
      </Form.List>
      <div className="mp-editor__foot">
        <Button type="primary" loading={busy} onClick={save}>{t('common.save')}</Button>
        {isAdmin && (
          <Popconfirm title={t('mp.projects.deleteConfirm')} description={t('mp.projects.deleteText')} okText={t('common.delete')} okButtonProps={{ danger: true }} cancelText={t('common.cancel')} onConfirm={async () => {
            try {
              await mpApi.deleteProject(project.id);
              await refresh();
              navigate('/app/masterplan/projects');
            } catch (err) {
              message.error(errorMessage(err));
            }
          }}>
            <Button danger>{t('mp.projects.delete')}</Button>
          </Popconfirm>
        )}
      </div>
    </Form>
  );
}
