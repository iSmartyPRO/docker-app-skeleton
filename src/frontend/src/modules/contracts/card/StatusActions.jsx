import { useState } from 'react';
import { App, Button, Input, Modal, Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { todayISO } from '../../../lib/datetime';
import { DateField } from '../../../components/ui/DateTimeField';
import { contractsApi } from '../api';

const LOOK = {
  signed: { type: 'primary', icon: '✍' },
  active: { type: 'default', icon: '▶' },
  completed: { type: 'default', icon: '■' },
  terminated: { type: 'default', danger: true, icon: '⊘' },
  draft: { type: 'default', icon: '✎' },
};

/**
 * The manual steps the server allows this person now (data.can.transitions):
 * sign (with the signed version and date), put in force, complete, terminate
 * (with a reason), back to draft.
 */
export default function StatusActions({ data, onDone }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { contract, versions, can } = data;
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [versionId, setVersionId] = useState(null);
  const [signedOn, setSignedOn] = useState(null);
  const transitions = can.transitions || [];
  if (!transitions.length) return null;

  const run = async (to, extra = {}) => {
    setBusy(true);
    try {
      const res = await contractsApi.status(contract.id, { to, ...extra });
      message.success(t('contracts.statusDone', { status: t(`contracts.status.${res.data.contract.status}`) }));
      setDialog(null);
      onDone(res.data);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const open = (to) => {
    setComment('');
    setVersionId(contract.currentVersionId || versions[0]?.id || null);
    setSignedOn(todayISO());
    if (to === 'signed' || to === 'terminated' || to === 'completed' || to === 'draft') setDialog(to);
    else run(to);
  };

  return (
    <div className="ctr-steps">
      {transitions.map((to) => (
        <Button key={to} type={LOOK[to]?.type} danger={LOOK[to]?.danger} onClick={() => open(to)}>
          {LOOK[to]?.icon} {t(`contracts.action.${to}`)}
        </Button>
      ))}
      <Modal
        open={Boolean(dialog)}
        title={dialog ? t(`contracts.action.${dialog}Title`) : ''}
        onCancel={() => setDialog(null)}
        okText={dialog ? t(`contracts.action.${dialog}`) : ''}
        okButtonProps={{ loading: busy, danger: dialog === 'terminated', disabled: dialog === 'terminated' && !comment.trim() }}
        onOk={() => run(dialog, dialog === 'signed' ? { signedVersionId: versionId, signedOn } : { comment: comment.trim() })}
        destroyOnClose
      >
        {dialog === 'signed' && (
          <div className="ctr-dialog">
            <p className="ctr-muted">{t('contracts.action.signedText')}</p>
            <label>{t('contracts.action.signedVersion')}</label>
            <Select
              value={versionId}
              onChange={setVersionId}
              allowClear
              placeholder={t('contracts.action.noFile')}
              options={versions.map((version) => ({ value: version.id, label: `v${version.no} · ${version.name}` }))}
              style={{ width: '100%' }}
            />
            <label>{t('contracts.action.signedOn')}</label>
            <DateField value={signedOn} onChange={setSignedOn} style={{ width: '100%' }} />
          </div>
        )}
        {dialog && dialog !== 'signed' && (
          <div className="ctr-dialog">
            <p className="ctr-muted">{t(`contracts.action.${dialog}Text`)}</p>
            <label>{dialog === 'terminated' ? t('contracts.action.reasonRequired') : t('contracts.action.comment')}</label>
            <Input.TextArea value={comment} onChange={(e) => setComment(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} maxLength={1000} autoFocus />
          </div>
        )}
      </Modal>
    </div>
  );
}
