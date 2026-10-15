import { useMemo, useState } from 'react';
import { Input, InputNumber, Switch, Tooltip } from 'antd';
import {
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FolderAddOutlined,
  InboxOutlined,
  SlidersOutlined,
  SwapOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { FILE_KEYS, PERMISSION_KEYS, WRITE_KEYS, normalizePermissions } from '../../lib/linkPermissions';
import './linkPermissions.css';

// The rule itself lives in lib/linkPermissions.js (the same as the server's).
export { PERMISSION_KEYS, WRITE_KEYS, normalizePermissions };

/*
 * Permission picker for public share links, shared by Files and Drive.
 *
 * A link's permissions are a set of keys:
 *   view     — list the folder and preview files
 *   download — download files (needs view)
 *   upload   — add new files (folders only; without view it is an "upload-only" drop box)
 *   mkdir    — create folders (folders only, needs view)
 *   rename   — rename and move inside the link (folders only, needs view)
 *   replace  — overwrite a file with a new version (needs view)
 *   delete   — move to the trash (folders only, needs view); `noTrash` labels it as permanent (file servers)
 *
 * The component is presentational: the server is the authority and enforces
 * every key on every route.
 */


export const PERMISSION_ICONS = {
  view: <EyeOutlined />,
  download: <DownloadOutlined />,
  upload: <CloudUploadOutlined />,
  mkdir: <FolderAddOutlined />,
  rename: <EditOutlined />,
  replace: <SwapOutlined />,
  delete: <DeleteOutlined />,
};

/** Presets in display order. `keys` are filtered by what the node (file/folder) supports. */
export const PERMISSION_PRESETS = [
  { id: 'view', icon: <EyeOutlined />, keys: ['view'] },
  { id: 'viewDownload', icon: <DownloadOutlined />, keys: ['view', 'download'], isDefault: true },
  { id: 'uploadOnly', icon: <InboxOutlined />, keys: ['upload'], folderOnly: true },
  { id: 'viewUpload', icon: <CloudUploadOutlined />, keys: ['view', 'download', 'upload'], folderOnly: true },
  { id: 'full', icon: <UnlockOutlined />, keys: PERMISSION_KEYS },
  { id: 'custom', icon: <SlidersOutlined />, keys: null },
];

/** The preset id matching a permission list, or 'custom'. */
export function presetOf(perms, isFolder = true) {
  const current = normalizePermissions(perms, isFolder).join(',');
  const match = PERMISSION_PRESETS.find((preset) => preset.keys && (!preset.folderOnly || isFolder) && normalizePermissions(preset.keys, isFolder).join(',') === current);
  return match ? match.id : 'custom';
}

/** True when the list allows anything beyond viewing and downloading. */
export function isWriteLink(perms) {
  return (Array.isArray(perms) ? perms : []).some((key) => WRITE_KEYS.includes(key));
}

/**
 * Chips describing a link's permissions, for lists. Each chip is
 * { key, labelKey, icon, write }; translate labelKey with t(). An upload-only
 * link is one chip ("Upload only").
 */
export function permissionChips(perms) {
  const list = Array.isArray(perms) ? perms : [];
  if (list.includes('upload') && !list.includes('view')) {
    return [{ key: 'uploadOnly', labelKey: 'linkPerms.chip.uploadOnly', icon: <InboxOutlined />, write: true }];
  }
  return PERMISSION_KEYS.filter((key) => list.includes(key)).map((key) => ({
    key,
    labelKey: `linkPerms.chip.${key}`,
    icon: PERMISSION_ICONS[key],
    write: WRITE_KEYS.includes(key),
  }));
}

/** Renders permissionChips() as small pills. */
export function PermissionChips({ perms, compact = false }) {
  const { t } = useLocale();
  return (
    <span className={`lp-chips${compact ? ' is-compact' : ''}`}>
      {permissionChips(perms).map((chip) =>
        compact ? (
          <Tooltip key={chip.key} title={t(chip.labelKey)}>
            <span className={`lp-chip${chip.write ? ' is-write' : ''}`} aria-label={t(chip.labelKey)}>
              {chip.icon}
            </span>
          </Tooltip>
        ) : (
          <span key={chip.key} className={`lp-chip${chip.write ? ' is-write' : ''}`}>
            {chip.icon}
            <span>{t(chip.labelKey)}</span>
          </span>
        )
      )}
    </span>
  );
}

/** "view, download, upload" as a sentence fragment for visitors. */
export function permissionSentence(perms, t) {
  const list = Array.isArray(perms) ? perms : [];
  if (list.includes('upload') && !list.includes('view')) return t('linkPerms.can.uploadOnly');
  return PERMISSION_KEYS.filter((key) => list.includes(key))
    .map((key) => t(`linkPerms.can.${key}`))
    .join(', ');
}

/**
 * The picker.
 *   value     — permission keys
 *   onChange  — (keys) => void
 *   allowed   — keys the current person may grant (others are shown locked)
 *   isFolder  — folder links support every key; file links view/download/replace
 *   extras    — current values of the per-link options to show; only the keys
 *               present are rendered: { maxSize (MB), extensions (".pdf, .jpg"),
 *               quota (MB), requireName, requireEmail, notify }
 *   onExtrasChange — (extras) => void
 *   maxUploadMb — the module's upload cap, shown as a hint
 */
export function LinkPermissionsPicker({ value, onChange, allowed = PERMISSION_KEYS, isFolder = true, extras, onExtrasChange, maxUploadMb, disabled = false, noTrash = false }) {
  const { t } = useLocale();
  const perms = useMemo(() => normalizePermissions(value, isFolder), [value, isFolder]);
  const allowedSet = useMemo(() => new Set(allowed || PERMISSION_KEYS), [allowed]);
  const current = presetOf(perms, isFolder);
  const [customMode, setCustomMode] = useState(false);
  const presets = PERMISSION_PRESETS.filter((preset) => !preset.folderOnly || isFolder);
  const presetAllowed = (preset) => !preset.keys || normalizePermissions(preset.keys, isFolder).every((key) => allowedSet.has(key));
  const keysHere = PERMISSION_KEYS.filter((key) => isFolder || FILE_KEYS.includes(key));
  const customOpen = current === 'custom' || customMode;
  const writes = perms.some((key) => key === 'upload' || key === 'replace');

  const pick = (preset) => {
    if (disabled || !presetAllowed(preset)) return;
    if (!preset.keys) {
      // "Custom" opens the toggles on the current set.
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    onChange?.(normalizePermissions(preset.keys.filter((key) => allowedSet.has(key)), isFolder));
  };

  const toggle = (key, on) => {
    const next = new Set(perms);
    if (on) next.add(key);
    else next.delete(key);
    if (on && key !== 'upload' && key !== 'view') next.add('view');
    if (!on && key === 'view') ['download', 'mkdir', 'rename', 'replace', 'delete'].forEach((item) => next.delete(item));
    if (!next.size) next.add('view');
    onChange?.(normalizePermissions([...next], isFolder));
  };

  const setExtra = (key, val) => onExtrasChange?.({ ...(extras || {}), [key]: val });
  const has = (key) => extras && extras[key] !== undefined;

  return (
    <div className={`lp${disabled ? ' is-disabled' : ''}`}>
      <div className="lp-presets" role="radiogroup" aria-label={t('linkPerms.title')}>
        {presets.map((preset) => {
          const locked = !presetAllowed(preset);
          const active = preset.id === 'custom' ? customOpen : !customOpen && preset.id === current;
          const card = (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled || locked}
              className={`lp-preset${active ? ' is-active' : ''}${locked ? ' is-locked' : ''}`}
              onClick={() => pick(preset)}
            >
              <span className={`lp-preset__icon is-${preset.id}`}>{preset.icon}</span>
              <span className="lp-preset__text">
                <span className="lp-preset__title">
                  {t(`linkPerms.preset.${preset.id}`)}
                  {preset.isDefault && <span className="lp-preset__badge">{t('linkPerms.default')}</span>}
                </span>
                <span className="lp-preset__desc">{t(`linkPerms.presetDesc.${preset.id}`)}</span>
              </span>
            </button>
          );
          return locked ? (
            <Tooltip key={preset.id} title={t('linkPerms.lockedHint')}>
              {card}
            </Tooltip>
          ) : (
            card
          );
        })}
      </div>

      {customOpen && (
        <div className="lp-toggles">
          {keysHere.map((key) => {
            const locked = !allowedSet.has(key);
            const needsView = key !== 'view' && key !== 'upload' && !perms.includes('view');
            return (
              <label key={key} className={`lp-toggle${locked ? ' is-locked' : ''}`}>
                <span className={`lp-toggle__icon${WRITE_KEYS.includes(key) ? ' is-write' : ''}`}>{PERMISSION_ICONS[key]}</span>
                <span className="lp-toggle__text">
                  <span className="lp-toggle__title">{t(noTrash && key === 'delete' ? 'linkPerms.perm.deleteForever' : `linkPerms.perm.${key}`)}</span>
                  <span className="lp-toggle__desc">{locked ? t('linkPerms.lockedHint') : needsView ? t('linkPerms.needsView') : t(noTrash && key === 'delete' ? 'linkPerms.permDesc.deleteForever' : `linkPerms.permDesc.${key}`)}</span>
                </span>
                <Switch size="small" checked={perms.includes(key)} disabled={disabled || locked} onChange={(on) => toggle(key, on)} />
              </label>
            );
          })}
        </div>
      )}

      {extras && writes && (has('maxSize') || has('extensions') || has('quota') || has('requireName') || has('notify')) && (
        <div className="lp-extras">
          <div className="lp-extras__title">{t('linkPerms.extrasTitle')}</div>
          {has('maxSize') && (
            <div className="lp-extra">
              <span className="lp-extra__label">
                {t('linkPerms.maxSize')}
                <span className="lp-extra__hint">{maxUploadMb ? t('linkPerms.maxSizeHint', { n: maxUploadMb }) : t('linkPerms.emptyNoLimit')}</span>
              </span>
              <InputNumber
                min={1}
                max={maxUploadMb || 1024 * 1024}
                value={extras.maxSize || null}
                onChange={(val) => setExtra('maxSize', val || null)}
                addonAfter={t('linkPerms.mb')}
                placeholder={maxUploadMb ? String(maxUploadMb) : '∞'}
                disabled={disabled}
                style={{ width: 150 }}
              />
            </div>
          )}
          {has('extensions') && (
            <div className="lp-extra">
              <span className="lp-extra__label">
                {t('linkPerms.extensions')}
                <span className="lp-extra__hint">{t('linkPerms.extensionsHint')}</span>
              </span>
              <Input value={extras.extensions || ''} onChange={(event) => setExtra('extensions', event.target.value)} placeholder=".pdf, .jpg, .docx" disabled={disabled} maxLength={300} style={{ width: 220 }} />
            </div>
          )}
          {has('quota') && (
            <div className="lp-extra">
              <span className="lp-extra__label">
                {t('linkPerms.quota')}
                <span className="lp-extra__hint">{t('linkPerms.quotaHint')}</span>
              </span>
              <InputNumber min={1} max={1024 * 1024} value={extras.quota || null} onChange={(val) => setExtra('quota', val || null)} addonAfter={t('linkPerms.mb')} placeholder="∞" disabled={disabled} style={{ width: 150 }} />
            </div>
          )}
          {has('requireName') && (
            <div className="lp-extra">
              <span className="lp-extra__label">
                {t('linkPerms.requireName')}
                <span className="lp-extra__hint">{t('linkPerms.requireNameHint')}</span>
              </span>
              <Switch checked={Boolean(extras.requireName)} onChange={(on) => onExtrasChange?.({ ...extras, requireName: on, ...(on ? {} : { requireEmail: extras.requireEmail === undefined ? undefined : false }) })} disabled={disabled} />
            </div>
          )}
          {has('requireEmail') && extras.requireName && (
            <div className="lp-extra is-nested">
              <span className="lp-extra__label">{t('linkPerms.requireEmail')}</span>
              <Switch size="small" checked={Boolean(extras.requireEmail)} onChange={(on) => setExtra('requireEmail', on)} disabled={disabled} />
            </div>
          )}
          {has('notify') && (
            <div className="lp-extra">
              <span className="lp-extra__label">
                {t('linkPerms.notify')}
                <span className="lp-extra__hint">{t('linkPerms.notifyHint')}</span>
              </span>
              <Switch checked={Boolean(extras.notify)} onChange={(on) => setExtra('notify', on)} disabled={disabled} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LinkPermissionsPicker;
