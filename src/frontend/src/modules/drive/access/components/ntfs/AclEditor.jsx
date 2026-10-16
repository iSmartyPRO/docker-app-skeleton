import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Empty, Result, Spin, Table, Tag, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { useLocale } from '../../../../../context/LocaleContext';
import { errorCode, faApi, faError, folderUrl } from '../../api';
import { useAccess } from '../../AccessContext';
import { applyFix, canonical, disableInheritance, explicitOf, presetOf, appliesToOf, isInherited, sameDraft, PRESETS, presetKey } from '../../ntfsModel';
import AceDialog from './AceDialog';
import ApplyDialog from './ApplyDialog';
import { DisableInheritanceDialog, EnableInheritanceDialog } from './InheritanceDialogs';
import PropagateDialog from './PropagateDialog';

const draftOf = (acl) => ({ aces: explicitOf(acl), protected: Boolean(acl?.protected), inherit: 'keep' });

/** A principal: name (sg_ groups link to their folder card), raw SID when unknown. */
function Subject({ subject, sid }) {
  const { t } = useLocale();
  if (!subject && !sid) return <span className="fa-muted">{t('folderAccess.ntfs.special')}</span>;
  const name = subject?.name;
  return (
    <div className="fa-person-cell">
      <span>
        {subject?.group?.folderKey ? <Link to={folderUrl(subject.group.folderKey)}>{name}</Link> : name || <code className="fa-code">{sid}</code>}
        {subject?.unknown && (
          <Tag color="orange" style={{ marginLeft: 6 }}>
            {t('folderAccess.ntfs.unknownSid')}
          </Tag>
        )}
      </span>
      <span className="fa-muted">{[subject?.login, subject?.kind && !subject.unknown ? t(`folderAccess.ntfs.kind.${subject.kind}`) : null, name ? sid : null].filter(Boolean).join(' · ')}</span>
    </div>
  );
}

/**
 * Permissions of one folder: owner, the entries (type, principal, access,
 * inherited from, applies to) and the draft — edits stay in the browser until
 * "Review and apply". `fix` (from the mismatch report) is applied to the draft once.
 */
export default function AclEditor({ shareId, path, fix, onFixUsed }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { info, change } = useAccess();
  const canWrite = Boolean(info?.canWrite);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [via, setVia] = useState('single');
  const [names, setNames] = useState({});
  const [editing, setEditing] = useState(null); // { ace, index } | { ace: null }
  const [applying, setApplying] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [propagating, setPropagating] = useState(null); // { job } | {}
  const fixUsed = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await change(() => faApi.ntfsAcl(shareId, path), { quiet: true, rethrow: true });
      if (!next) {
        setError({ code: 'FA_CREDENTIALS_REQUIRED' });
        return;
      }
      setData(next);
      setDraft(draftOf(next.acl));
      setVia('single');
      const known = {};
      for (const ace of next.acl.aces) if (ace.sid && ace.subject) known[ace.sid] = ace.subject;
      setNames(known);
    } catch (err) {
      setError(err);
      setData(null);
    }
  }, [change, shareId, path]);

  useEffect(() => {
    setData(null);
    setDraft(null);
    load();
  }, [load]);

  // A fix from the mismatch report: applied once to the fresh draft.
  useEffect(() => {
    if (!data || !fix || fixUsed.current === JSON.stringify(fix)) return;
    fixUsed.current = JSON.stringify(fix);
    setDraft((prev) => ({ ...prev, aces: canonical(applyFix(prev.aces, fix)) }));
    if (fix.sid && fix.name) setNames((prev) => ({ ...prev, [fix.sid]: prev[fix.sid] || { sid: fix.sid, name: fix.name } }));
    setVia('fix');
    message.info(t('folderAccess.ntfs.fixPrepared'));
    onFixUsed?.();
  }, [data, fix]); // eslint-disable-line react-hooks/exhaustive-deps

  const initial = useMemo(() => (data ? draftOf(data.acl) : null), [data]);
  const dirty = Boolean(draft && initial && !sameDraft(draft, initial));

  const rows = useMemo(() => {
    if (!data || !draft) return [];
    const explicit = draft.aces.map((ace, index) => ({
      key: `e${index}`,
      index,
      explicit: true,
      ace,
      subject: names[ace.sid] || null,
      preset: ace.type === 'other' ? 'special' : presetOf(ace.mask, ace.flags),
      appliesTo: appliesToOf(ace.flags),
      isNew: !initial.aces.some((item) => sameDraft(item, ace)),
    }));
    const inherited = draft.protected
      ? []
      : data.acl.aces.filter(isInherited).map((ace) => ({ key: `i${ace.index}`, explicit: false, ace, subject: ace.subject, preset: ace.preset, appliesTo: ace.appliesTo, inheritedFrom: ace.inheritedFrom }));
    return [...explicit, ...inherited];
  }, [data, draft, names, initial]);

  if (error) {
    const code = errorCode(error);
    return (
      <section className="panel fa-ntfs-empty">
        <Result
          status={code === 'NOT_FOUND' ? '404' : 'warning'}
          title={faError(error, t)}
          extra={
            <Button icon={<ReloadOutlined />} onClick={load}>
              {t('folderAccess.refresh')}
            </Button>
          }
        />
      </section>
    );
  }
  if (!data || !draft) {
    return (
      <section className="panel fa-loading">
        <Spin />
      </section>
    );
  }

  const { folder, acl } = data;
  const setAces = (aces) => setDraft((prev) => ({ ...prev, aces: canonical(aces) }));
  const saveAce = (entry, subject) => {
    if (subject) setNames((prev) => ({ ...prev, [subject.sid]: subject }));
    if (editing?.ace) setAces(draft.aces.map((ace, index) => (index === editing.index ? entry : ace)));
    else setAces([...draft.aces, entry]);
    setEditing(null);
  };
  const removeAce = (index) => setAces(draft.aces.filter((_, i) => i !== index));
  const addGroup = (group) => {
    const preset = PRESETS[presetKey(group.expected)];
    if (!preset) return;
    setNames((prev) => ({ ...prev, [group.sid]: { sid: group.sid, name: group.name, kind: 'group', group: { folderKey: group.folderKey } } }));
    setAces([...draft.aces, { type: 'allow', sid: group.sid, mask: preset.mask, flags: preset.flags }]);
  };

  const applied = (result, { propagate }) => {
    setApplying(false);
    message.success(t('folderAccess.ntfs.applied'));
    if (result?.journalWarning) message.warning(t('folderAccess.ntfs.journalWarning'));
    load();
    if (propagate) setPropagating({ autostart: true });
  };

  const columns = [
    {
      title: t('folderAccess.ntfs.col.type'),
      width: 90,
      render: (_, row) => <Tag color={row.ace.type === 'deny' ? 'red' : row.ace.type === 'allow' ? 'green' : 'default'}>{t(`folderAccess.ntfs.${row.ace.type === 'deny' ? 'deny' : row.ace.type === 'allow' ? 'allow' : 'other'}`)}</Tag>,
    },
    { title: t('folderAccess.ntfs.col.subject'), render: (_, row) => <Subject subject={row.subject} sid={row.ace.sid} /> },
    { title: t('folderAccess.ntfs.col.access'), render: (_, row) => t(`folderAccess.ntfs.preset.${row.preset || 'special'}`) },
    {
      title: t('folderAccess.ntfs.col.inheritedFrom'),
      responsive: ['md'],
      render: (_, row) => (row.explicit ? <span className="fa-muted">{t('folderAccess.ntfs.notInherited')}</span> : row.inheritedFrom?.display || t('folderAccess.ntfs.parentObject')),
    },
    { title: t('folderAccess.ntfs.col.appliesTo'), responsive: ['lg'], render: (_, row) => t(`folderAccess.ntfs.applies.${row.appliesTo || 'this'}`) },
    {
      title: '',
      width: 90,
      render: (_, row) =>
        row.explicit && canWrite ? (
          <span className="fa-row-actions">
            {row.ace.type !== 'other' && (
              <Tooltip title={t('folderAccess.ntfs.edit')}>
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing({ ace: row.ace, index: row.index })} />
              </Tooltip>
            )}
            <Tooltip title={t('folderAccess.remove')}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeAce(row.index)} />
            </Tooltip>
          </span>
        ) : row.explicit ? null : (
          <Tooltip title={t('folderAccess.ntfs.inheritedHint')}>
            <span className="fa-muted">—</span>
          </Tooltip>
        ),
    },
  ];

  return (
    <section className="panel fa-ntfs-editor">
      <header className="fa-ntfs-editor__head">
        <div>
          <div className="fa-col__title">
            <strong className="fa-code">{folder.display}</strong>
            {draft.protected ? <Tag color="gold">{t('folderAccess.ntfs.inheritanceOff')}</Tag> : <Tag>{t('folderAccess.ntfs.inheritanceOn')}</Tag>}
            {!acl.canonical && (
              <Tooltip title={t('folderAccess.ntfs.notCanonicalHint')}>
                <Tag color="orange">{t('folderAccess.ntfs.notCanonical')}</Tag>
              </Tooltip>
            )}
          </div>
          <div className="fa-muted">
            {t('folderAccess.ntfs.owner')}: <strong>{acl.ownerSubject?.name || acl.owner || '—'}</strong>
            {acl.ownerSubject?.name && acl.owner ? ` · ${acl.owner}` : ''}
          </div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} aria-label={t('folderAccess.refresh')} />
      </header>

      {data.namesUnavailable && <Alert type="warning" showIcon className="fa-notice" message={t('folderAccess.ntfs.namesUnavailable')} />}

      {(data.groups || []).length > 0 && (
        <div className="fa-ntfs-groups">
          <span className="fa-muted">{t('folderAccess.ntfs.folderGroups')}</span>
          {data.groups.map((group) => {
            const present = draft.aces.some((ace) => ace.sid === group.sid && ace.type === 'allow') || (!draft.protected && acl.aces.some((ace) => ace.inherited && ace.sid === group.sid));
            return (
              <span key={group.sid} className="fa-tags">
                <Link to={folderUrl(group.folderKey)}>
                  <code>{group.name}</code>
                </Link>
                <span className="fa-muted">{t(`folderAccess.ntfs.preset.${presetKey(group.expected || 'special')}`)}</span>
                {present ? (
                  <Tag color="green">{t('folderAccess.ntfs.groupPresent')}</Tag>
                ) : canWrite ? (
                  <Button size="small" icon={<PlusOutlined />} onClick={() => addGroup(group)}>
                    {t('folderAccess.ntfs.groupAdd')}
                  </Button>
                ) : (
                  <Tag color="orange">{t('folderAccess.ntfs.groupMissing')}</Tag>
                )}
              </span>
            );
          })}
        </div>
      )}

      {canWrite && (
        <div className="fa-add">
          <Button icon={<PlusOutlined />} onClick={() => setEditing({ ace: null })}>
            {t('folderAccess.ntfs.addEntry')}
          </Button>
          {draft.protected ? (
            <Button onClick={() => setEnabling(true)} disabled={!folder.path}>
              {t('folderAccess.ntfs.inherit.enable')}
            </Button>
          ) : (
            <Button onClick={() => setDisabling(true)}>{t('folderAccess.ntfs.inherit.disable')}</Button>
          )}
          <Button onClick={() => setPropagating({})} disabled={dirty}>
            {t('folderAccess.ntfs.propagate.button')}
          </Button>
        </div>
      )}

      <Table
        size="small"
        rowKey="key"
        dataSource={rows}
        pagination={false}
        rowClassName={(row) => (row.isNew ? 'fa-ntfs-new' : '')}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('folderAccess.ntfs.noEntries')} /> }}
        columns={columns}
      />

      {dirty && (
        <div className="fa-ntfs-draftbar">
          <span>{t('folderAccess.ntfs.draft')}</span>
          <Button icon={<UndoOutlined />} onClick={() => { setDraft(initial); setVia('single'); }}>
            {t('folderAccess.ntfs.discard')}
          </Button>
          <Button type="primary" onClick={() => setApplying(true)}>
            {t('folderAccess.ntfs.review')}
          </Button>
        </div>
      )}

      <AceDialog open={Boolean(editing)} ace={editing?.ace || null} subjectName={editing?.ace ? names[editing.ace.sid]?.name : null} onClose={() => setEditing(null)} onSave={saveAce} />
      <ApplyDialog
        open={applying}
        folder={folder}
        revision={acl.revision}
        draft={draft}
        via={via}
        onClose={() => setApplying(false)}
        onApplied={applied}
        onReload={() => {
          setApplying(false);
          load();
        }}
      />
      <DisableInheritanceDialog
        open={disabling}
        folder={folder}
        revision={acl.revision}
        removeDraft={disableInheritance(acl, draft.aces, 'remove')}
        onClose={() => setDisabling(false)}
        onChoose={(mode) => {
          setDraft(disableInheritance(acl, draft.aces, mode));
          setDisabling(false);
        }}
      />
      <EnableInheritanceDialog
        open={enabling}
        onClose={() => setEnabling(false)}
        onConfirm={() => {
          setDraft((prev) => ({ ...prev, protected: false, inherit: 'parent' }));
          setEnabling(false);
        }}
      />
      <PropagateAfterApply folder={folder} state={propagating} onClose={() => setPropagating(null)} />
    </section>
  );
}

/** The propagation dialog; after Apply it starts an "inherit" job by itself. */
function PropagateAfterApply({ folder, state, onClose }) {
  const { t } = useLocale();
  const { change } = useAccess();
  const [job, setJob] = useState(null);
  const [failed, setFailed] = useState(null);
  useEffect(() => {
    setJob(null);
    setFailed(null);
    if (!state?.autostart) return;
    (async () => {
      try {
        const data = await change(() => faApi.ntfsPropagate({ shareId: folder.shareId, path: folder.path, mode: 'inherit' }), { quiet: true, rethrow: true });
        if (data?.job) setJob(data.job);
      } catch (err) {
        setFailed(err);
      }
    })();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null;
  if (state.autostart && failed) {
    return <Alert type="error" showIcon closable onClose={onClose} className="fa-notice" message={t('folderAccess.ntfs.propagate.autoFailed')} description={faError(failed, t)} />;
  }
  if (state.autostart && !job) return null;
  return <PropagateDialog open folder={folder} job={job} onClose={onClose} />;
}
