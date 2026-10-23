import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Descriptions, Input, Modal, Progress, Space, Spin, Tag, Tooltip, Upload } from 'antd';
import { CloudUploadOutlined, DeleteOutlined, InboxOutlined, SafetyCertificateOutlined, SaveOutlined, SyncOutlined, WarningOutlined } from '@ant-design/icons';
import api from '../../../services/api';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { pickText } from '../../../modules/platformUi';

/*
 * Settings → Modules: module packages (docs/module-packages.md «Settings → Modules»).
 *   - «Установить из файла»: upload → checks (spec §5, server messages) → the
 *     module card → «Установить» / «Обновить» → restart screen;
 *   - on a package's card: its state (failed with the error), «Обновить»,
 *     «Резервная копия», «Удалить» (code removed, data kept);
 *   - removed modules: «Удалить данные» (a fresh backup is made first).
 * Superadministrators only; the server checks again.
 */

/** GET /api/admin/modules/packages: { packages, canManage, devMode, maxUploadMb, bootId }. */
export function usePackages() {
  const [state, setState] = useState({ data: null, error: null });
  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/modules/packages');
      setState({ data: res.data, error: null });
    } catch (error) {
      setState((prev) => ({ ...prev, error }));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const byId = new Map((state.data?.packages || []).map((item) => [item.id, item]));
  return { ...state, byId, reload: load };
}

/** The server's refusal messages in the UI language (problems: [{ message: { ru, en } }]). */
export function problemTexts(err, locale) {
  const problems = err?.response?.data?.problems;
  if (Array.isArray(problems) && problems.length) return problems.map((item) => pickText(item.message, locale) || item.message?.en);
  return [errorMessage(err)];
}

// ── Restart screen ──────────────────────────────────────────────────────────

/** Covers the page while the portal restarts; reloads it once the server answers with a new boot id. */
export function RestartOverlay({ bootId, onDone }) {
  const { t } = useLocale();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      if (stop) return;
      if (Date.now() - started > 20000) setSlow(true);
      try {
        const res = await fetch('/api/modules/installed', { cache: 'no-store', credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json();
          if (data.bootId && data.bootId !== bootId && !data.restarting) {
            onDone?.();
            window.location.reload();
            return;
          }
        }
      } catch {
        /* still restarting */
      }
      setTimeout(tick, 1500);
    };
    const timer = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [bootId, onDone]);
  return (
    <div className="pf-restart" role="alertdialog" aria-live="assertive" aria-label={t('packages.restart.title')}>
      <div className="pf-restart__box">
        <Spin size="large" />
        <h3>{t('packages.restart.title')}</h3>
        <p>{slow ? t('packages.restart.slow') : t('packages.restart.text')}</p>
      </div>
    </div>
  );
}

// ── Install / update ────────────────────────────────────────────────────────

function ModuleCardPreview({ preview, t, locale }) {
  const list = (items, render) => (items?.length ? items.map(render) : <span className="pf-muted">{t('packages.card.none')}</span>);
  // A module's name in the interface language (apps.<id>.name), else its id.
  const appName = (id) => {
    const text = t(`apps.${id}.name`);
    return text && text !== `apps.${id}.name` ? text : id;
  };
  const changes = preview.changelog?.[0]?.changes;
  const changeLines = changes ? changes[locale] || changes.en || [] : [];
  return (
    <div className="pf-package-card">
      <div className="pf-package-card__head">
        <strong>{pickText(preview.name, locale)}</strong>
        <Tag bordered={false} color={preview.action === 'update' ? 'blue' : 'green'}>
          {preview.action === 'update' ? t('packages.updateFrom', { from: preview.currentVersion, to: preview.version }) : t('packages.newModule', { version: preview.version })}
        </Tag>
        {preview.signed ? (
          <Tag bordered={false} icon={<SafetyCertificateOutlined />} color="green">
            {t('packages.signed', { key: preview.keyId })}
          </Tag>
        ) : (
          <Tag bordered={false} icon={<WarningOutlined />} color="orange">
            {t('packages.unsigned')}
          </Tag>
        )}
      </div>
      {preview.description && <p className="pf-package-card__desc">{pickText(preview.description, locale)}</p>}
      <Descriptions size="small" column={1} colon={false}>
        <Descriptions.Item label={t('packages.card.version')}>{preview.version}</Descriptions.Item>
        <Descriptions.Item label={t('packages.card.core')}>{preview.core}</Descriptions.Item>
        <Descriptions.Item label={t('packages.card.category')}>{t(`platform.categories.${preview.category}`)}</Descriptions.Item>
        <Descriptions.Item label={t('packages.card.permissions')}>{list(preview.permissions, (item) => <Tag key={item}>{item}</Tag>)}</Descriptions.Item>
        <Descriptions.Item label={t('packages.card.requires')}>
          {list(preview.requires, (link) => (
            <Tooltip key={link.id || link.integration} title={pickText(link.reason, locale)}>
              <Tag>{link.id ? `${pickText(link.name, locale) || appName(link.id)}${link.version ? ` ≥ ${link.version}` : ''}` : link.integration}</Tag>
            </Tooltip>
          ))}
        </Descriptions.Item>
        <Descriptions.Item label={t('packages.card.enhances')}>
          {list(preview.enhances, (link) => (
            <Tooltip key={link.id || link.integration} title={pickText(link.what, locale)}>
              <Tag>{link.id ? appName(link.id) : link.integration}</Tag>
            </Tooltip>
          ))}
        </Descriptions.Item>
        {preview.migrations?.length > 0 && <Descriptions.Item label={t('packages.card.migrations')}>{preview.migrations.join(', ')}</Descriptions.Item>}
      </Descriptions>
      {changeLines.length > 0 && (
        <div className="pf-package-card__changes">
          <span className="pf-card__label">{t('packages.card.changelog')}</span>
          <ul>
            {changeLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="pf-muted">{preview.action === 'update' ? t('packages.card.afterUpdate') : t('packages.card.afterInstall')}</p>
    </div>
  );
}

/** «Установить из файла» dialog: upload, checks, module card, install. */
export function InstallDialog({ open, onClose, devMode, maxUploadMb, onRestart }) {
  const { t, locale } = useLocale();
  const [phase, setPhase] = useState('pick'); // pick | uploading | card | installing
  const [progress, setProgress] = useState(0);
  const [staged, setStaged] = useState(null);
  const [problems, setProblems] = useState([]);

  useEffect(() => {
    if (open) {
      setPhase('pick');
      setProgress(0);
      setStaged(null);
      setProblems([]);
    }
  }, [open]);

  const upload = async (file) => {
    setPhase('uploading');
    setProblems([]);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await api.post('/admin/modules/packages/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => setProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0),
      });
      setStaged(res.data);
      setProblems((res.data.problems || []).map((item) => pickText(item.message, locale) || item.message?.en));
      setPhase('card');
    } catch (err) {
      setProblems(problemTexts(err, locale));
      setPhase('pick');
    }
    return false;
  };

  const install = async () => {
    setPhase('installing');
    try {
      const res = await api.post('/admin/modules/packages/install', { token: staged.token });
      onRestart(res.data.bootId);
    } catch (err) {
      setProblems(problemTexts(err, locale));
      setPhase('card');
    }
  };

  const preview = staged?.preview;
  const blocked = problems.length > 0;
  return (
    <Modal
      open={open}
      title={t('packages.installTitle')}
      onCancel={phase === 'installing' ? undefined : onClose}
      closable={phase !== 'installing'}
      maskClosable={false}
      width={620}
      footer={
        phase === 'card' && preview ? (
          <Space>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="primary" disabled={blocked} onClick={install} icon={<CloudUploadOutlined />}>
              {preview.action === 'update' ? t('packages.actionUpdate') : t('packages.actionInstall')}
            </Button>
          </Space>
        ) : phase === 'installing' ? (
          <Button type="primary" loading>
            {t('packages.installing')}
          </Button>
        ) : null
      }
    >
      {devMode && <Alert type="warning" showIcon message={t('packages.devMode')} className="pf-package-alert" />}
      {blocked && (
        <Alert
          type="error"
          showIcon
          className="pf-package-alert"
          message={t('packages.cannotInstall')}
          description={
            <ul className="pf-package-problems">
              {problems.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          }
        />
      )}
      {(phase === 'pick' || phase === 'uploading') && (
        <Upload.Dragger accept=".zip,application/zip" multiple={false} showUploadList={false} beforeUpload={upload} disabled={phase === 'uploading'}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{phase === 'uploading' ? t('packages.uploading') : t('packages.dropHint')}</p>
          <p className="ant-upload-hint">{t('packages.dropLimit', { mb: maxUploadMb || 100 })}</p>
          {phase === 'uploading' && <Progress percent={progress} size="small" status="active" />}
        </Upload.Dragger>
      )}
      {(phase === 'card' || phase === 'installing') && preview && <ModuleCardPreview preview={preview} t={t} locale={locale} />}
    </Modal>
  );
}

// ── On a module card ────────────────────────────────────────────────────────

/** State tag of a package on its card (failed: with the error as a tooltip). */
export function PackageTags({ pkg }) {
  const { t } = useLocale();
  if (!pkg || pkg.source !== 'package') return null;
  return (
    <>
      <Tag bordered={false} color="purple">
        {t('packages.source.package')}
      </Tag>
      {pkg.state === 'failed' && (
        <Tooltip title={pkg.error}>
          <Tag bordered={false} color="red" icon={<WarningOutlined />}>
            {t('packages.state.failed')}
          </Tag>
        </Tooltip>
      )}
    </>
  );
}

/** Above the module cards: packages this core cannot run (they need an update). */
export function PackageWarnings({ packages, coreVersion }) {
  const { t, locale } = useLocale();
  const behind = (packages || []).filter((item) => item.source === 'package' && item.incompatible);
  if (!behind.length) return null;
  return (
    <Alert
      type="warning"
      showIcon
      className="pf-package-alert"
      message={t('packages.needUpdate.title', { core: coreVersion || '' })}
      description={
        <ul className="pf-package-problems">
          {behind.map((item) => (
            <li key={item.id}>
              <strong>{pickText(item.name, locale) || item.id}</strong> {item.version}: {pickText(item.incompatible.message, locale) || item.incompatible.message?.en}
            </li>
          ))}
        </ul>
      }
    />
  );
}

/** The outcome of the last automatic rollback of a package (kept until the next install). */
function RollbackNote({ rollback }) {
  const { t, locale } = useLocale();
  if (!rollback) return null;
  const at = rollback.at ? new Date(rollback.at).toLocaleString(locale) : '';
  return (
    <Alert
      type={rollback.ok ? 'warning' : 'error'}
      showIcon
      className="pf-package-error"
      message={t(rollback.ok ? 'packages.rollback.title' : 'packages.rollback.titleFailed', { from: rollback.from, to: rollback.to, at })}
      description={
        <>
          <div>{t('packages.rollback.reason', { reason: rollback.reason || '' })}</div>
          <div>{t('packages.rollback.tables', { tables: rollback.tables || '' })}</div>
          {!rollback.ok && <div>{t('packages.rollback.restoreByHand', { to: rollback.to })}</div>}
        </>
      }
    />
  );
}

/** «Обновить», «Резервная копия», «Удалить» of an installed package. */
export function PackageActions({ module, pkg, canManage, onUpdate, onRestart, name }) {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const [busy, setBusy] = useState(null);
  if (!pkg || pkg.source !== 'package' || !canManage) return null;

  const backup = async () => {
    setBusy('backup');
    try {
      const res = await api.post(`/admin/modules/packages/${module.id}/backup`);
      message.success(t('packages.backupDone', { file: res.data.backup.file }));
    } catch (err) {
      message.error(problemTexts(err, locale).join(' '));
    } finally {
      setBusy(null);
    }
  };
  const remove = () =>
    modal.confirm({
      title: t('packages.removeTitle', { module: name }),
      content: t('packages.removeText'),
      okText: t('packages.removeOk'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await api.delete(`/admin/modules/packages/${module.id}`);
          onRestart(res.data.bootId);
        } catch (err) {
          modal.error({ title: t('packages.error'), content: problemTexts(err, locale).join('\n') });
        }
      },
    });

  return (
    <>
      {pkg.state === 'failed' && (pkg.incompatible || pkg.error) && (
        <Alert type="error" showIcon className="pf-package-error" message={pkg.incompatible ? pickText(pkg.incompatible.message, locale) || pkg.incompatible.message?.en : pkg.error} description={pkg.blocked ? t('packages.blocked') : undefined} />
      )}
      <RollbackNote rollback={pkg.lastRollback} />
      <button type="button" className="pf-action" onClick={onUpdate}>
        <SyncOutlined /> {t('packages.update')}
      </button>
      <button type="button" className="pf-action" onClick={backup} disabled={busy === 'backup'}>
        <SaveOutlined /> {t('packages.backup')}
      </button>
      <button type="button" className="pf-action pf-action--danger" onClick={remove}>
        <DeleteOutlined /> {t('packages.remove')}
      </button>
    </>
  );
}

/** Removed modules (data kept) with «Удалить данные». */
export function RemovedPackages({ packages, canManage, onChanged }) {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const confirmRef = useRef('');
  const removed = (packages || []).filter((item) => item.source === 'package' && item.state === 'removed');
  if (!removed.length) return null;
  // The name from the last installed manifest, else the interface's app name, else the id.
  const nameOf = (pkg) => pickText(pkg.name, locale) || (t(`apps.${pkg.id}.name`) !== `apps.${pkg.id}.name` ? t(`apps.${pkg.id}.name`) : pkg.id);

  const purge = (pkg) => {
    confirmRef.current = '';
    modal.confirm({
      title: t('packages.purgeTitle', { module: nameOf(pkg) }),
      content: (
        <div className="pf-dialog">
          <p>{t('packages.purgeText')}</p>
          <Input placeholder={t('packages.purgeConfirm', { id: pkg.id })} onChange={(event) => (confirmRef.current = event.target.value.trim())} />
        </div>
      ),
      okText: t('packages.purgeOk'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await api.post(`/admin/modules/packages/${pkg.id}/purge`, { confirm: confirmRef.current });
          message.success(t('packages.purged', { file: res.data.backup.file }));
          onChanged?.();
        } catch (err) {
          message.error(problemTexts(err, locale).join(' '));
          throw err;
        }
      },
    });
  };

  return (
    <section className="pf-group">
      <h3 className="pf-group__title">
        {t('packages.removed.title')}
        <span className="pf-group__lead">{t('packages.removed.lead')}</span>
      </h3>
      <div className="pf-grid">
        {removed.map((pkg) => (
          <article key={pkg.id} className="pf-card">
            <header className="pf-card__head">
              <div className="pf-card__title">
                <div className="pf-card__name">
                  <strong>{nameOf(pkg)}</strong>
                  <span className="pf-version">{t('packages.removed.version', { version: pkg.version })}</span>
                </div>
                <Tag bordered={false}>{t('packages.state.removed')}</Tag>
              </div>
            </header>
            {canManage && (
              <footer className="pf-card__actions">
                <button type="button" className="pf-action pf-action--danger" onClick={() => purge(pkg)}>
                  <DeleteOutlined /> {t('packages.removed.deleteData')}
                </button>
              </footer>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
