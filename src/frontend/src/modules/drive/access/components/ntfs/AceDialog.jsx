import { useEffect, useRef, useState } from 'react';
import { Checkbox, Modal, Radio, Select, Spin, Tag } from 'antd';
import { useLocale } from '../../../../../context/LocaleContext';
import { faApi } from '../../api';
import { APPLIES_ORDER, PRESET_ORDER, aceFromDialog, appliesToOf, presetOf, FLAGS } from '../../ntfsModel';

/** A principal for an NTFS entry: users, groups (incl. Builtin), computers, well-known. Value: SID. */
export function SubjectSelect({ value, onChange, autoFocus }) {
  const { t } = useLocale();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const seq = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (text) => {
    clearTimeout(timer.current);
    if (String(text).trim().length < 2) return;
    timer.current = setTimeout(async () => {
      const mine = ++seq.current;
      setLoading(true);
      try {
        const { data } = await faApi.ntfsSubjects(text);
        if (mine !== seq.current) return;
        setOptions(
          (data.subjects || []).map((subject) => ({
            value: subject.sid,
            subject,
            label: (
              <span className="fa-option">
                <strong>{subject.name}</strong>
                <span className="fa-muted">{[subject.login, subject.sid].filter(Boolean).join(' · ')}</span>
                <Tag>{t(`folderAccess.ntfs.kind.${subject.kind}`)}</Tag>
              </span>
            ),
          }))
        );
      } catch {
        if (mine === seq.current) setOptions([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
  };

  return (
    <Select
      showSearch
      autoFocus={autoFocus}
      value={value}
      onChange={(next, option) => onChange?.(next, option?.subject)}
      filterOption={false}
      onSearch={search}
      notFoundContent={loading ? <Spin size="small" /> : t('folderAccess.people.typeToSearch')}
      placeholder={t('folderAccess.ntfs.ace.subjectPlaceholder')}
      options={options}
      labelRender={({ value: sid }) => options.find((item) => item.value === sid)?.subject?.name || sid}
      style={{ width: '100%' }}
    />
  );
}

/**
 * Add or edit an explicit entry, like the Windows "Permission Entry" dialog:
 * principal, type, applies to, basic permissions, "only apply within this container".
 * `ace` = the entry being edited (null = new); `subjectName` its principal's name.
 */
export default function AceDialog({ open, ace, subjectName, onClose, onSave }) {
  const { t } = useLocale();
  const [form, setForm] = useState(null);
  const [subject, setSubject] = useState(null);
  useEffect(() => {
    if (!open) return;
    setSubject(null);
    if (ace) {
      setForm({ sid: ace.sid, type: ace.type, preset: presetOf(ace.mask, ace.flags), appliesTo: appliesToOf(ace.flags), noPropagate: Boolean(ace.flags & FLAGS.NP), mask: ace.mask });
    } else {
      setForm({ sid: null, type: 'allow', preset: 'readExecute', appliesTo: 'thisSubfoldersFiles', noPropagate: false, mask: null });
    }
  }, [open, ace]);
  if (!open || !form) return null;
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const presets = [...PRESET_ORDER, ...(form.preset === 'special' || ace?.mask && presetOf(ace.mask, ace.flags) === 'special' ? ['special'] : [])];
  // "List folder contents" is folders only (no files); inherit-only and "only within this container" stay.
  const save = () => onSave(aceFromDialog(form), subject);
  return (
    <Modal
      open
      title={ace ? t('folderAccess.ntfs.ace.editTitle') : t('folderAccess.ntfs.ace.addTitle')}
      onCancel={onClose}
      onOk={save}
      okText={t('folderAccess.ntfs.ace.toDraft')}
      okButtonProps={{ disabled: !form.sid }}
      destroyOnHidden
    >
      <div className="fa-form">
        <label>
          <span>{t('folderAccess.ntfs.ace.subject')}</span>
          {ace ? (
            <div>
              <strong>{subjectName || ace.sid}</strong> <span className="fa-muted">{ace.sid}</span>
            </div>
          ) : (
            <SubjectSelect autoFocus value={form.sid} onChange={(sid, found) => { set({ sid }); setSubject(found || null); }} />
          )}
        </label>
        <label>
          <span>{t('folderAccess.ntfs.ace.type')}</span>
          <Radio.Group value={form.type} onChange={(event) => set({ type: event.target.value })} optionType="button">
            <Radio.Button value="allow">{t('folderAccess.ntfs.allow')}</Radio.Button>
            <Radio.Button value="deny">{t('folderAccess.ntfs.deny')}</Radio.Button>
          </Radio.Group>
        </label>
        <label>
          <span>{t('folderAccess.ntfs.ace.appliesTo')}</span>
          <Select value={form.appliesTo} disabled={form.preset === 'listFolder'} onChange={(appliesTo) => set({ appliesTo })} options={APPLIES_ORDER.map((value) => ({ value, label: t(`folderAccess.ntfs.applies.${value}`) }))} />
        </label>
        <label>
          <span>{t('folderAccess.ntfs.ace.rights')}</span>
          <Select value={form.preset} onChange={(preset) => set({ preset })} options={presets.map((value) => ({ value, label: t(`folderAccess.ntfs.preset.${value}`), disabled: value === 'special' }))} />
        </label>
        <Checkbox checked={form.noPropagate} disabled={form.appliesTo === 'this'} onChange={(event) => set({ noPropagate: event.target.checked })}>
          {t('folderAccess.ntfs.ace.noPropagate')}
        </Checkbox>
        {form.type === 'deny' && <div className="fa-danger">{t('folderAccess.ntfs.ace.denyHint')}</div>}
      </div>
    </Modal>
  );
}
