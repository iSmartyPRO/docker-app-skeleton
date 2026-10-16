import { useEffect, useState } from 'react';
import { App, Button, DatePicker, Empty, Form, Input, Modal, Popconfirm, Segmented, Tag, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SafetyCertificateOutlined, StarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate } from '../../../lib/datetime';
import { empApi } from '../api';
import { CLEARANCE_COLORS, daysUntil, empError } from '../lib';

/** «Навыки и допуски»: clearances with expiry (reminders) and skills. */
export default function SkillsPanel({ employee, canEdit, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [editing, setEditing] = useState(null);
  const skills = employee.skills || [];
  const groups = [
    { kind: 'clearance', icon: <SafetyCertificateOutlined />, title: t('emp.skills.clearances'), items: skills.filter((skill) => skill.kind === 'clearance') },
    { kind: 'skill', icon: <StarOutlined />, title: t('emp.skills.skills'), items: skills.filter((skill) => skill.kind === 'skill') },
  ];
  const remove = async (skill) => {
    try {
      const res = await empApi.removeSkill(employee.id, skill.id);
      onChanged(res.data);
    } catch (err) {
      message.error(empError(err, t));
    }
  };
  return (
    <div className="emp-skills" data-tour="emp.skills">
      {canEdit && (
        <div className="emp-tabbar">
          <Button icon={<PlusOutlined />} onClick={() => setEditing({ kind: 'clearance' })}>
            {t('emp.skills.addClearance')}
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => setEditing({ kind: 'skill' })}>
            {t('emp.skills.addSkill')}
          </Button>
        </div>
      )}
      {!skills.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('emp.skills.empty')} />}
      {groups
        .filter((group) => group.items.length)
        .map((group) => (
          <section key={group.kind} className="emp-skills__group">
            <h4>
              {group.icon} {group.title}
            </h4>
            <ul className="emp-skills__list">
              {group.items.map((skill) => {
                const left = daysUntil(skill.expiresOn);
                return (
                  <li key={skill.id} className={`emp-skill is-${skill.state}`}>
                    <div className="emp-skill__main">
                      <strong>{skill.name}</strong>
                      <span className="emp-muted">
                        {[skill.number, skill.level, skill.issuedOn && t('emp.skills.issued', { date: fmtDate(skill.issuedOn) })].filter(Boolean).join(' · ') || ' '}
                      </span>
                      {skill.note && <span className="emp-skill__note">{skill.note}</span>}
                    </div>
                    {skill.expiresOn && (
                      <Tag bordered={false} color={CLEARANCE_COLORS[skill.state]}>
                        {skill.state === 'expired'
                          ? t('emp.skills.expiredOn', { date: fmtDate(skill.expiresOn) })
                          : skill.state === 'soon'
                            ? t('emp.skills.expiresIn', { n: left, date: fmtDate(skill.expiresOn) })
                            : t('emp.skills.until', { date: fmtDate(skill.expiresOn) })}
                      </Tag>
                    )}
                    {canEdit && (
                      <span className="emp-skill__actions">
                        <Tooltip title={t('common.edit')}>
                          <Button size="small" type="text" icon={<EditOutlined />} aria-label={t('common.edit')} onClick={() => setEditing(skill)} />
                        </Tooltip>
                        <Popconfirm title={t('emp.skills.removeConfirm')} okText={t('common.delete')} cancelText={t('common.cancel')} onConfirm={() => remove(skill)}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('common.delete')} />
                        </Popconfirm>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      <SkillDialog
        skill={editing}
        employee={employee}
        onClose={() => setEditing(null)}
        onSaved={(data) => {
          setEditing(null);
          onChanged(data);
        }}
      />
    </div>
  );
}

function SkillDialog({ skill, employee, onClose, onSaved }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const kind = Form.useWatch('kind', form);
  useEffect(() => {
    if (!skill) return;
    form.resetFields();
    form.setFieldsValue({
      kind: skill.kind || 'skill',
      name: skill.name || '',
      number: skill.number || '',
      level: skill.level || '',
      issuedOn: skill.issuedOn ? dayjs(skill.issuedOn) : null,
      expiresOn: skill.expiresOn ? dayjs(skill.expiresOn) : null,
      note: skill.note || '',
    });
  }, [skill, form]);
  const submit = async () => {
    const values = await form.validateFields();
    const payload = { ...values, issuedOn: values.issuedOn ? values.issuedOn.format('YYYY-MM-DD') : null, expiresOn: values.expiresOn ? values.expiresOn.format('YYYY-MM-DD') : null };
    setBusy(true);
    try {
      const res = skill.id ? await empApi.updateSkill(employee.id, skill.id, payload) : await empApi.addSkill(employee.id, payload);
      onSaved(res.data);
    } catch (err) {
      message.error(empError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={Boolean(skill)} onCancel={onClose} onOk={submit} confirmLoading={busy} title={skill?.id ? t('emp.skills.edit') : t('emp.skills.add')} okText={t('common.save')} cancelText={t('common.cancel')} destroyOnClose>
      <Form form={form} layout="vertical">
        <Form.Item name="kind" label={t('emp.skills.kind')}>
          <Segmented options={[{ value: 'clearance', label: t('emp.skills.clearance') }, { value: 'skill', label: t('emp.skills.skill') }]} />
        </Form.Item>
        <Form.Item name="name" label={t('emp.skills.name')} rules={[{ required: true, whitespace: true, message: t('emp.errors.NAME_REQUIRED') }]}>
          <Input maxLength={160} placeholder={kind === 'clearance' ? t('emp.skills.clearancePlaceholder') : t('emp.skills.skillPlaceholder')} />
        </Form.Item>
        <div className="emp-form__grid2">
          <Form.Item name="number" label={t('emp.skills.number')}>
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="level" label={t('emp.skills.level')}>
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item name="issuedOn" label={t('emp.skills.issuedOn')}>
            <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expiresOn" label={t('emp.skills.expiresOn')} extra={kind === 'clearance' ? t('emp.skills.expiresHint') : null}>
            <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <Form.Item name="note" label={t('emp.skills.note')}>
          <Input maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
