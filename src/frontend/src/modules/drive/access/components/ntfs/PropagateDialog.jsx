import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Modal, Progress, Radio, Table, Tag } from 'antd';
import { useLocale } from '../../../../../context/LocaleContext';
import { faApi, faError } from '../../api';
import { useAccess } from '../../AccessContext';

const POLL_MS = 1000;
const STATE_COLOR = { running: 'processing', cancelling: 'warning', done: 'success', cancelled: 'default', failed: 'error' };

function Counters({ progress }) {
  const { t } = useLocale();
  const items = ['done', 'changed', 'unchanged', 'failed', 'protected', 'explicitRemoved'];
  return (
    <div className="fa-ntfs-counters">
      {items.map((key) => (
        <div key={key}>
          <strong>{progress?.[key] ?? 0}</strong>
          <span className="fa-muted">{t(`folderAccess.ntfs.propagate.count.${key}`)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * "Replace all child object permission entries with inheritable permission
 * entries from this folder" as a background job: choose the mode (keep or
 * remove the children's own entries — counted first with a dry run), watch
 * the progress, cancel, resume, retry the objects that failed.
 * `job`: an already started job to watch (after Apply).
 */
export default function PropagateDialog({ open, folder, job: initialJob, onClose }) {
  const { t } = useLocale();
  const { change } = useAccess();
  const [mode, setMode] = useState('inherit');
  const [count, setCount] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  // The count the person confirmed for "replace": sent with the job (and its resume / retry).
  const [confirmedCount, setConfirmedCount] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!open) return;
    setMode('inherit');
    setCount(null);
    setConfirmed(false);
    setConfirmedCount(null);
    setJob(initialJob || null);
    setError(null);
  }, [open, initialJob]);

  const poll = useCallback((id, onDone) => {
    clearTimeout(timer.current);
    const tick = async () => {
      try {
        const { data } = await faApi.ntfsJob(id);
        onDone(data.job);
        if (data.job.state === 'running' || data.job.state === 'cancelling') timer.current = setTimeout(tick, POLL_MS);
      } catch (err) {
        setError(err);
      }
    };
    tick();
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (open && initialJob?.id) poll(initialJob.id, setJob);
  }, [open, initialJob, poll]);

  const start = async (body, onJob) => {
    setBusy(true);
    setError(null);
    try {
      const data = await change(() => faApi.ntfsPropagate({ shareId: folder.shareId, path: folder.path, ...body }), { quiet: true, rethrow: true });
      if (data?.job) {
        onJob(data.job);
        poll(data.job.id, onJob);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  // "Replace" removes the children's own entries: count them first (a dry run writes nothing).
  const countExplicit = () => start({ mode: 'replace', dryRun: true }, (next) => setCount(next));
  const replaceBody = (count) => ({ confirm: true, confirmCount: count ?? 0 });
  const run = (extra = {}) => {
    if (mode !== 'replace') return start({ mode, ...extra }, setJob);
    const shown = count?.progress?.withExplicit ?? 0;
    setConfirmedCount(shown);
    return start({ mode, ...replaceBody(shown), ...extra }, setJob);
  };
  const again = (extra) => start({ mode: job.mode, ...(job.mode === 'replace' ? replaceBody(confirmedCount) : {}), ...extra }, setJob);
  const cancel = async () => {
    if (!job) return;
    try {
      const { data } = await faApi.ntfsCancelJob(job.id);
      setJob(data.job);
    } catch (err) {
      setError(err);
    }
  };
  if (!open) return null;
  const running = job && (job.state === 'running' || job.state === 'cancelling');
  const counting = count && (count.state === 'running' || count.state === 'cancelling');
  // "Replace" only after a dry run that finished: a failed or stopped count tells nothing.
  const counted = Boolean(count && !counting && count.state === 'done');

  let body;
  if (job) {
    body = (
      <div className="fa-form">
        <div>
          <Tag color={STATE_COLOR[job.state]}>{t(`folderAccess.ntfs.propagate.state.${job.state}`)}</Tag>
          <span className="fa-muted">{t(`folderAccess.ntfs.propagate.mode.${job.mode}`)}</span>
        </div>
        {running && <Progress percent={100} status="active" showInfo={false} />}
        <Counters progress={job.progress} />
        {job.current && running && <div className="fa-muted fa-code">{job.current}</div>}
        {job.error && <Alert type="error" showIcon message={faError({ response: { data: { code: job.error.code, error: job.error.message } } }, t)} />}
        {(job.protectedList || []).length > 0 && <Alert type="info" showIcon message={t('folderAccess.ntfs.propagate.protected', { n: job.protectedList.length })} />}
        {(job.failedList || []).length > 0 && (
          <Table
            size="small"
            rowKey="path"
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
            dataSource={job.failedList}
            columns={[
              { title: t('folderAccess.ntfs.propagate.failedPath'), dataIndex: 'path', render: (value) => <code className="fa-code">{value}</code> },
              { title: t('folderAccess.ntfs.propagate.failedCode'), dataIndex: 'code', width: 160, render: (value) => <Tag color="red">{value}</Tag> },
            ]}
          />
        )}
      </div>
    );
  } else {
    body = (
      <div className="fa-form">
        <p>{t('folderAccess.ntfs.propagate.lead', { folder: folder.display })}</p>
        <Radio.Group value={mode} onChange={(event) => setMode(event.target.value)} className="fa-ntfs-choices">
          <Radio value="inherit">{t('folderAccess.ntfs.propagate.inherit')}</Radio>
          <Radio value="replace">{t('folderAccess.ntfs.propagate.replace')}</Radio>
        </Radio.Group>
        {mode === 'replace' && (
          <Alert
            type="warning"
            showIcon
            message={t('folderAccess.ntfs.propagate.replaceWarn')}
            description={
              <div className="fa-form">
                {!count && (
                  <Button onClick={countExplicit} loading={busy}>
                    {t('folderAccess.ntfs.propagate.count.button')}
                  </Button>
                )}
                {counting && <span>{t('folderAccess.ntfs.propagate.counting', { n: count.progress?.done ?? 0 })}</span>}
                {count && !counting && count.state === 'done' && <strong>{t('folderAccess.ntfs.propagate.withExplicit', { n: count.progress?.withExplicit ?? 0, total: count.progress?.done ?? 0 })}</strong>}
                {count && !counting && count.state !== 'done' && (
                  <span className="fa-danger">
                    {t('folderAccess.ntfs.propagate.countFailed')}{' '}
                    <Button size="small" onClick={countExplicit} loading={busy}>
                      {t('folderAccess.ntfs.propagate.count.again')}
                    </Button>
                  </span>
                )}
                <Checkbox checked={confirmed && counted} onChange={(event) => setConfirmed(event.target.checked)} disabled={!counted}>
                  {t('folderAccess.ntfs.propagate.confirm')}
                </Checkbox>
              </div>
            }
          />
        )}
      </div>
    );
  }

  const footer = [];
  if (!job) {
    footer.push(
      <Button key="close" onClick={onClose}>
        {t('folderAccess.ntfs.cancel')}
      </Button>,
      <Button key="start" type="primary" danger={mode === 'replace'} loading={busy} disabled={mode === 'replace' && (!confirmed || !counted)} onClick={() => run()}>
        {t('folderAccess.ntfs.propagate.start')}
      </Button>
    );
  } else if (running) {
    footer.push(
      <Button key="cancel" danger onClick={cancel} disabled={job.state === 'cancelling'}>
        {t('folderAccess.ntfs.propagate.stop')}
      </Button>,
      <Button key="hide" onClick={onClose}>
        {t('folderAccess.ntfs.propagate.hide')}
      </Button>
    );
  } else {
    if (job.state === 'cancelled' && job.marker) {
      footer.push(
        <Button key="resume" onClick={() => again({ marker: job.marker })}>
          {t('folderAccess.ntfs.propagate.resume')}
        </Button>
      );
    }
    if ((job.failedList || []).length > 0) {
      footer.push(
        <Button key="retry" onClick={() => again({ retry: job.failedList.map((item) => item.path) })}>
          {t('folderAccess.ntfs.propagate.retry', { n: job.failedList.length })}
        </Button>
      );
    }
    footer.push(
      <Button key="close" type="primary" onClick={onClose}>
        {t('folderAccess.ntfs.close')}
      </Button>
    );
  }

  return (
    <Modal open width={640} title={t('folderAccess.ntfs.propagate.title')} onCancel={onClose} maskClosable={false} footer={footer}>
      {error && <Alert type="error" showIcon className="fa-notice" message={faError(error, t)} style={{ marginBottom: 12 }} />}
      {body}
    </Modal>
  );
}
