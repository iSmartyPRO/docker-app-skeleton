import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { App, Button, DatePicker, Drawer, Input, InputNumber, Modal, Select, Switch, Tooltip } from 'antd';
import { useLocale } from '../context/LocaleContext';
import { useThemeMode } from '../context/ThemeContext';
import { MenuIcon } from '../components/icons/menuIcons';
import { errorMessage } from '../lib/errors';
import { areaKey, decide, effective } from './policy';
import { rawCall } from './client';
import './developer.css';

/* Building blocks shared by the API console, personal tokens and the developer portal. */

export const AREA_ICONS = {
  account: 'user',
  notifications: 'bell',
  files: 'folder',
  kb: 'book',
  chat: 'chat',
  tasks: 'tasks',
  calendar: 'calendar',
  drive: 'server',
  resources: 'compass',
  companies: 'building',
  dashboard: 'dashboard',
  'admin.users': 'people',
  'admin.security': 'shield',
  'admin.settings': 'cog',
};

export function AreaIcon({ area }) {
  const { appearance } = useThemeMode();
  return (
    <span className="ax-icon">
      <MenuIcon name={AREA_ICONS[area] || 'code'} appearance={appearance} />
    </span>
  );
}

export function GlyphIcon({ name }) {
  const { appearance } = useThemeMode();
  return (
    <span className="ax-icon">
      <MenuIcon name={name} appearance={appearance} />
    </span>
  );
}

export const areaTitle = (t, key) => t(`api.areas.${areaKey(key)}.title`);
export const areaDesc = (t, key) => t(`api.areas.${areaKey(key)}.desc`);
export const templateName = (t, template) => (template?.key ? t(`api.templates.sys.${template.key}.name`) : template?.name || '');
export const templateDesc = (t, template) => (template?.key ? t(`api.templates.sys.${template.key}.desc`) : template?.description || '');
export const eventLabel = (t, type) => t(`api.events.${areaKey(type)}`);

// ── Copy ────────────────────────────────────────────────────────────────────

export function useCopy() {
  const { message } = App.useApp();
  const { t } = useLocale();
  return async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    message.success(t('api.copied'));
  };
}

export function CopyField({ value, secret = false, large = false, label }) {
  const copy = useCopy();
  const { t } = useLocale();
  return (
    <div className={`ax-copy${secret ? ' is-secret' : ''}${large ? ' is-large' : ''}`}>
      {label && <span className="ax-copy__label">{label}</span>}
      <code>{value}</code>
      <button type="button" onClick={() => copy(value)} aria-label={t('api.copy')}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="5" y="5" width="9" height="9" rx="2" />
          <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
        </svg>
        <span>{t('api.copy')}</span>
      </button>
    </div>
  );
}

export function MethodBadge({ method, small }) {
  const m = String(method || '').toUpperCase();
  return <span className={`ax-method ax-method--${m.toLowerCase()}${small ? ' is-small' : ''}`}>{m === 'DELETE' ? 'DEL' : m}</span>;
}

/** A path with :params highlighted. */
export function PathText({ path }) {
  const parts = String(path).split(/(:\w+(?:\([^)]*\))?)/g);
  return (
    <span className="ax-path">
      {parts.map((part, index) =>
        part.startsWith(':') ? (
          <em key={index}>{`{${part.slice(1).replace(/\(.*\)$/, '')}}`}</em>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </span>
  );
}

// ── Code ────────────────────────────────────────────────────────────────────

function highlightJson(code) {
  return String(code)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g, (match, str, colon, lit, num) => {
      if (str) return colon ? `<span class="tk-key">${str}</span>${colon}` : `<span class="tk-str">${str}</span>`;
      if (lit) return `<span class="tk-lit">${lit}</span>`;
      if (num) return `<span class="tk-num">${num}</span>`;
      return match;
    });
}

export function CodeBlock({ code, lang = 'json', maxHeight }) {
  const copy = useCopy();
  const { t } = useLocale();
  const html = lang === 'json' ? highlightJson(code) : String(code).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return (
    <div className="ax-code" style={maxHeight ? { '--ax-code-max': `${maxHeight}px` } : undefined}>
      <button type="button" className="ax-code__copy" onClick={() => copy(code)}>
        {t('api.copy')}
      </button>
      {/* eslint-disable-next-line react/no-danger */}
      <pre dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

const LANG_KEY = 'ax_code_lang';
export function CodeTabs({ samples }) {
  const [active, setActive] = useState(() => {
    try {
      return localStorage.getItem(LANG_KEY) || samples[0]?.key;
    } catch {
      return samples[0]?.key;
    }
  });
  const current = samples.find((sample) => sample.key === active) || samples[0];
  const pick = (key) => {
    setActive(key);
    try {
      localStorage.setItem(LANG_KEY, key);
    } catch {
      /* ignore */
    }
  };
  if (!current) return null;
  return (
    <div className="ax-codetabs">
      <div className="ax-codetabs__bar" role="tablist">
        {samples.map((sample) => (
          <button key={sample.key} type="button" role="tab" aria-selected={sample.key === current.key} className={sample.key === current.key ? 'is-active' : ''} onClick={() => pick(sample.key)}>
            {sample.label}
          </button>
        ))}
      </div>
      <CodeBlock code={current.code} lang={current.lang || 'text'} />
    </div>
  );
}

const json = (value, indent = 2) => JSON.stringify(value, null, indent);

/** Request samples in several languages. */
export function requestSamples({ method, url, token = '$PORTAL_TOKEN', body, multipart }) {
  const m = String(method).toUpperCase();
  const hasBody = body !== undefined && body !== null && m !== 'GET';
  const curl = [
    `curl -X ${m} "${url}"`,
    `  -H "Authorization: Bearer ${token}"`,
    ...(multipart ? ['  -F "files=@./report.pdf"'] : hasBody ? ['  -H "Content-Type: application/json"', `  -d '${JSON.stringify(body)}'`] : []),
  ].join(' \\\n');
  const js = [
    `const res = await fetch("${url}", {`,
    `  method: "${m}",`,
    `  headers: {`,
    `    Authorization: \`Bearer \${process.env.PORTAL_TOKEN}\`,`,
    ...(hasBody ? [`    "Content-Type": "application/json",`] : []),
    `  },`,
    ...(hasBody ? [`  body: JSON.stringify(${json(body).replace(/\n/g, '\n  ')}),`] : []),
    `});`,
    `const data = await res.json();`,
  ].join('\n');
  const py = [
    'import os, requests',
    '',
    `res = requests.${m.toLowerCase()}(`,
    `    "${url}",`,
    `    headers={"Authorization": f"Bearer {os.environ['PORTAL_TOKEN']}"},`,
    ...(hasBody ? [`    json=${json(body, 4).replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None').replace(/\n/g, '\n    ')},`] : []),
    ')',
    'data = res.json()',
  ].join('\n');
  const php = [
    `$ch = curl_init("${url}");`,
    'curl_setopt_array($ch, [',
    `    CURLOPT_CUSTOMREQUEST => "${m}",`,
    '    CURLOPT_RETURNTRANSFER => true,',
    `    CURLOPT_HTTPHEADER => ["Authorization: Bearer " . getenv("PORTAL_TOKEN")${hasBody ? ', "Content-Type: application/json"' : ''}],`,
    ...(hasBody ? [`    CURLOPT_POSTFIELDS => json_encode(${phpArray(body)}),`] : []),
    ']);',
    '$data = json_decode(curl_exec($ch), true);',
  ].join('\n');
  return [
    { key: 'curl', label: 'cURL', code: curl, lang: 'text' },
    { key: 'js', label: 'JavaScript', code: js, lang: 'text' },
    { key: 'python', label: 'Python', code: py, lang: 'text' },
    { key: 'php', label: 'PHP', code: php, lang: 'text' },
  ];
}

function phpArray(value, depth = 1) {
  const pad = '    '.repeat(depth + 1);
  const end = '    '.repeat(depth);
  if (Array.isArray(value)) return `[${value.map((item) => phpArray(item, depth + 1)).join(', ')}]`;
  if (value && typeof value === 'object') return `[\n${Object.entries(value).map(([k, v]) => `${pad}"${k}" => ${phpArray(v, depth + 1)}`).join(',\n')}\n${end}]`;
  if (typeof value === 'string') return JSON.stringify(value);
  return value === null ? 'null' : String(value);
}

// ── Levels and scopes ──────────────────────────────────────────────────────

const LEVELS = ['none', 'read', 'write'];

export function LevelPicker({ value = 'none', onChange, disabled }) {
  const { t } = useLocale();
  return (
    <div className={`ax-level is-${value}`} role="radiogroup">
      {LEVELS.map((level) => (
        <button key={level} type="button" role="radio" aria-checked={value === level} disabled={disabled} className={value === level ? 'is-on' : ''} onClick={() => onChange?.(level)}>
          {t(`api.levels.${level}`)}
        </button>
      ))}
    </div>
  );
}

/**
 * Area × level grid. `value` is the effective level per area, `base` the
 * template's (for "changed" marks and reset).
 */
export function ScopeMatrix({ areas, value, base, onChange, readOnly }) {
  const { t } = useLocale();
  const groups = ['personal', 'modules', 'admin'];
  return (
    <div className="ax-matrix">
      {groups.map((group) => {
        const rows = areas.filter((area) => area.group === group);
        if (!rows.length) return null;
        return (
          <div key={group} className="ax-matrix__group">
            <div className="ax-matrix__head">
              <span>{t(`api.groups.${group}`)}</span>
              {!readOnly && (
                <div className="ax-matrix__bulk">
                  {LEVELS.map((level) => (
                    <button key={level} type="button" onClick={() => rows.forEach((area) => onChange(area.key, level))}>
                      {t(`api.levelShort.${level}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {rows.map((area) => {
              const level = value[area.key] || 'none';
              const changed = base && (base[area.key] || 'none') !== level;
              return (
                <div key={area.key} className={`ax-matrix__row${area.enabled === false ? ' is-off' : ''}${changed ? ' is-changed' : ''}`}>
                  <AreaIcon area={area.key} />
                  <div className="ax-matrix__text">
                    <strong>
                      {areaTitle(t, area.key)}
                      {changed && (
                        <Tooltip title={t('api.editor.resetToTemplate')}>
                          <button type="button" className="ax-changed" onClick={() => onChange(area.key, base[area.key] || 'none')}>
                            {t('api.editor.changed')} ↺
                          </button>
                        </Tooltip>
                      )}
                    </strong>
                    <span>{areaDesc(t, area.key)}</span>
                  </div>
                  {readOnly ? <span className={`ax-levelpill is-${level}`}>{t(`api.levels.${level}`)}</span> : <LevelPicker value={level} onChange={(next) => onChange(area.key, next)} />}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Compact chips of the areas a policy opens. */
export function ScopeChips({ scopes, max = 6 }) {
  const { t } = useLocale();
  const open = Object.entries(scopes || {}).filter(([, level]) => level && level !== 'none');
  if (!open.length) return <span className="ax-muted">{t('api.levels.none')}</span>;
  return (
    <span className="ax-chips">
      {open.slice(0, max).map(([key, level]) => (
        <span key={key} className={`ax-chip is-${level}`}>
          {areaTitle(t, key)}
          <b>{t(`api.levelShort.${level}`)}</b>
        </span>
      ))}
      {open.length > max && <span className="ax-chip is-more">+{open.length - max}</span>}
    </span>
  );
}

// ── Templates ──────────────────────────────────────────────────────────────

export function TemplatePicker({ templates, value, onChange }) {
  const { t } = useLocale();
  return (
    <div className="ax-tplpick">
      {templates.map((template) => (
        <button key={template.id} type="button" className={`ax-tplpick__item${value === template.id ? ' is-on' : ''}`} style={{ '--tpl': template.color }} onClick={() => onChange(template.id)}>
          <span className="ax-tplpick__icon">
            <GlyphIcon name={template.icon} />
          </span>
          <strong>{templateName(t, template)}</strong>
          <span>{templateDesc(t, template)}</span>
        </button>
      ))}
      <button type="button" className={`ax-tplpick__item is-custom${value === null ? ' is-on' : ''}`} onClick={() => onChange(null)}>
        <span className="ax-tplpick__icon">
          <GlyphIcon name="sliders" />
        </span>
        <strong>{t('api.noTemplate')}</strong>
        <span>{t('api.editor.scopesHint')}</span>
      </button>
    </div>
  );
}

// ── Rules ──────────────────────────────────────────────────────────────────

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function RulesEditor({ value = [], onChange }) {
  const { t } = useLocale();
  const set = (index, patch) => onChange(value.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  return (
    <div className="ax-rules">
      {value.length === 0 && <div className="ax-rules__empty">{t('api.rules.empty')}</div>}
      {value.map((rule, index) => (
        <div key={index} className={`ax-rule is-${rule.effect}`}>
          <Select
            value={rule.effect}
            onChange={(effect) => set(index, { effect })}
            options={[
              { value: 'deny', label: t('api.rules.deny') },
              { value: 'allow', label: t('api.rules.allow') },
            ]}
            className="ax-rule__effect"
            popupMatchSelectWidth={false}
          />
          <Select
            mode="multiple"
            value={rule.methods || []}
            onChange={(methods) => set(index, { methods })}
            options={METHODS.map((method) => ({ value: method, label: method }))}
            placeholder={t('api.rules.anyMethod')}
            className="ax-rule__methods"
            maxTagCount="responsive"
          />
          <Input value={rule.path} onChange={(event) => set(index, { path: event.target.value })} placeholder={t('api.rules.path')} className="ax-rule__path" spellCheck={false} />
          <Input value={rule.note || ''} onChange={(event) => set(index, { note: event.target.value })} placeholder={t('api.rules.note')} className="ax-rule__note" />
          <button type="button" className="ax-x" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={t('common.delete')}>
            ✕
          </button>
        </div>
      ))}
      <div className="ax-rules__foot">
        <Button size="small" onClick={() => onChange([...value, { effect: 'deny', methods: [], path: '', note: '' }])}>
          ＋ {t('api.rules.add')}
        </Button>
        <span className="ax-muted">{t('api.rules.syntax')}</span>
      </div>
    </div>
  );
}

// ── Resource limits ────────────────────────────────────────────────────────

export function LimitsPicker({ kinds, options, value = {}, onChange, areas }) {
  const { t } = useLocale();
  const enabledModules = new Set((areas || []).filter((area) => area.enabled !== false).map((area) => area.module).filter(Boolean));
  return (
    <div className="ax-limits">
      {kinds
        .filter((kind) => !areas || enabledModules.has(kind.module))
        .map((kind) => {
          const on = Array.isArray(value[kind.key]);
          const list = options?.[kind.key] || [];
          return (
            <div key={kind.key} className={`ax-limit${on ? ' is-on' : ''}`}>
              <div className="ax-limit__head">
                <AreaIcon area={kind.module} />
                <strong>{t(`api.resources.${areaKey(kind.key)}`)}</strong>
                <span className="ax-muted">{on ? t('api.editor.onlySelected') : t('api.editor.allOf')}</span>
                <Switch
                  size="small"
                  checked={on}
                  onChange={(checked) => {
                    const next = { ...value };
                    if (checked) next[kind.key] = [];
                    else delete next[kind.key];
                    onChange(next);
                  }}
                />
              </div>
              {on && (
                <Select
                  mode="multiple"
                  value={value[kind.key]}
                  onChange={(ids) => onChange({ ...value, [kind.key]: ids })}
                  placeholder={t('api.editor.pick')}
                  optionFilterProp="search"
                  style={{ width: '100%' }}
                  options={list.map((item) => ({
                    value: item.id,
                    search: `${item.name} ${item.code || ''} ${item.owner || ''}`.toLowerCase(),
                    label: (
                      <span className="ax-opt">
                        <i style={{ background: item.color || 'var(--da-primary)' }} />
                        {item.personal && kind.key === 'tasks.projects' ? t('api.editor.personalProject') : item.name}
                        {item.code && !item.personal && <em>{item.code}</em>}
                        {item.owner && item.personal && <em>{item.owner}</em>}
                      </span>
                    ),
                  }))}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

// ── Tester ─────────────────────────────────────────────────────────────────

const SAMPLES = [
  ['GET', '/app/tasks/tasks'],
  ['POST', '/app/tasks/tasks'],
  ['DELETE', '/app/tasks/tasks/WEB-1'],
  ['POST', '/app/chat/rooms/1/messages'],
  ['GET', '/admin/users'],
  ['PUT', '/account/password'],
];

export function PolicyTester({ policy, moduleIds }) {
  const { t } = useLocale();
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/app/tasks/tasks');
  const verdict = useMemo(() => decide(policy, method, path || '/', moduleIds), [policy, method, path, moduleIds]);
  const reason =
    verdict.reason === 'blocked'
      ? t('api.editor.verdictBlocked')
      : verdict.reason === 'rule'
        ? t('api.editor.byRule', { path: verdict.rule })
        : verdict.reason === 'free'
          ? t('api.editor.free')
          : verdict.ok
            ? t('api.editor.byArea', { scope: verdict.scope })
            : t('api.editor.byScope', { scope: verdict.scope });
  return (
    <div className="ax-tester">
      <div className="ax-tester__title">{t('api.editor.tester')}</div>
      <div className="ax-tester__row">
        <Select value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: m }))} popupMatchSelectWidth={false} className="ax-tester__method" />
        <Input value={path} onChange={(event) => setPath(event.target.value)} spellCheck={false} className="ax-tester__path" />
      </div>
      <div className={`ax-verdict ${verdict.ok ? 'is-ok' : 'is-no'}`}>
        <span className="ax-verdict__dot" />
        <strong>{verdict.ok ? t('api.editor.verdictAllow') : t('api.editor.verdictDeny')}</strong>
        <span>{reason}</span>
      </div>
      <div className="ax-tester__samples">
        {SAMPLES.map(([m, p]) => (
          <button
            key={`${m}${p}`}
            type="button"
            onClick={() => {
              setMethod(m);
              setPath(p);
            }}
          >
            <MethodBadge method={m} small /> {p}
          </button>
        ))}
      </div>
      {verdict.ok && <p className="ax-muted ax-tester__note">{t('api.editor.ownerRights')}</p>}
    </div>
  );
}

// ── Token editor ───────────────────────────────────────────────────────────

const PRESETS = [
  ['d30', 30],
  ['d90', 90],
  ['d365', 365],
  ['never', 0],
];

function initialDraft(token, templates) {
  if (token) {
    return {
      name: token.name,
      description: token.description,
      userId: token.user?.id,
      templateId: token.template?.id ?? null,
      scopes: { ...token.scopes },
      rules: token.rules.map((rule) => ({ ...rule })),
      limits: { ...token.limits },
      ipAllow: [...token.ipAllow],
      rateLimit: token.rateLimit,
      expiresAt: token.expiresAt,
    };
  }
  const fallback = templates.find((template) => template.key === 'read_only') || templates[0];
  return { name: '', description: '', userId: null, templateId: fallback?.id ?? null, scopes: {}, rules: [], limits: {}, ipAllow: [], rateLimit: null, expiresAt: dayjs().add(90, 'day').endOf('day').toISOString() };
}

/**
 * Create or edit a token. `client` has createToken / updateToken; `people`
 * enables choosing the owner (console only).
 */
export function TokenEditor({ open, token, templates, areas, resources, resourceKinds, people, config, client, onClose, onSaved, onSecret }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [draft, setDraft] = useState(() => initialDraft(token, templates));
  const [saving, setSaving] = useState(false);
  const [customDate, setCustomDate] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initialDraft(token, templates));
      setCustomDate(false);
    }
  }, [open, token, templates]);

  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const template = templates.find((item) => item.id === draft.templateId) || null;
  const base = useMemo(() => Object.fromEntries(areas.map((area) => [area.key, template?.scopes?.[area.key] || 'none'])), [areas, template]);
  const levels = useMemo(() => ({ ...base, ...draft.scopes }), [base, draft.scopes]);
  const policy = useMemo(() => effective({ scopes: base, rules: template?.rules }, draft.scopes, draft.rules), [base, template, draft.scopes, draft.rules]);
  const moduleIds = areas.filter((area) => area.module).map((area) => area.module);

  const setLevel = (key, level) =>
    setDraft((prev) => {
      const scopes = { ...prev.scopes };
      if ((base[key] || 'none') === level) delete scopes[key];
      else scopes[key] = level;
      return { ...prev, scopes };
    });

  const preset = (() => {
    if (customDate) return 'custom';
    if (!draft.expiresAt) return 'never';
    const days = Math.round(dayjs(draft.expiresAt).endOf('day').diff(dayjs().endOf('day'), 'day'));
    return PRESETS.find(([, n]) => n === days)?.[0] || 'custom';
  })();

  const save = async () => {
    if (!draft.name.trim()) {
      message.warning(t('api.editor.name'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: draft.name,
        description: draft.description,
        templateId: draft.templateId,
        scopes: draft.scopes,
        rules: draft.rules.filter((rule) => rule.path.trim()),
        limits: draft.limits,
        ipAllow: draft.ipAllow,
        rateLimit: draft.rateLimit || null,
        expiresAt: draft.expiresAt,
        ...(people && draft.userId ? { userId: draft.userId } : {}),
      };
      if (token) {
        const res = await client.updateToken(token.id, body);
        message.success(t('api.saved'));
        onSaved?.(res.data.token);
      } else {
        const res = await client.createToken(body);
        onSaved?.(res.data.token);
        onSecret?.(res.data.secret, res.data.token);
      }
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const owner = people?.find((person) => person.id === draft.userId);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={1040}
      className="ax-drawer"
      title={token ? t('api.editor.editTitle') : t('api.editor.createTitle')}
      destroyOnHidden
      footer={
        <div className="ax-drawer__foot">
          <Button type="primary" size="large" loading={saving} onClick={save}>
            {token ? t('api.editor.save') : t('api.editor.create')}
          </Button>
          <Button size="large" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      }
    >
      <div className="ax-editor">
        <div className="ax-editor__main">
          <section className="ax-sec">
            <h3>{t('api.editor.basics')}</h3>
            <div className="ax-grid2">
              <label className="ax-field">
                <span>{t('api.editor.name')}</span>
                <Input size="large" value={draft.name} onChange={(event) => set({ name: event.target.value })} placeholder={t('api.editor.namePlaceholder')} maxLength={120} autoFocus />
              </label>
              {people ? (
                <label className="ax-field">
                  <span>{t('api.editor.ownerLabel')}</span>
                  <Select
                    size="large"
                    showSearch
                    value={draft.userId ?? undefined}
                    onChange={(userId) => set({ userId })}
                    placeholder={t('api.editor.pick')}
                    optionFilterProp="search"
                    disabled={Boolean(token)}
                    options={people.map((person) => ({ value: person.id, search: `${person.name} ${person.username}`.toLowerCase(), label: `${person.name} · @${person.username}` }))}
                  />
                </label>
              ) : (
                <label className="ax-field">
                  <span>{t('api.editor.rateLimit')}</span>
                  <InputNumber size="large" min={1} max={100000} value={draft.rateLimit} onChange={(rateLimit) => set({ rateLimit })} placeholder={String(config?.defaultRateLimit || 120)} addonAfter={t('api.editor.perMinute')} style={{ width: '100%' }} />
                </label>
              )}
            </div>
            {people && <p className="ax-hint">{t('api.editor.ownerHint')}</p>}
            <label className="ax-field">
              <span>{t('api.editor.description')}</span>
              <Input.TextArea value={draft.description} onChange={(event) => set({ description: event.target.value })} placeholder={t('api.editor.descriptionPlaceholder')} autoSize={{ minRows: 1, maxRows: 4 }} />
            </label>
            <div className="ax-grid2">
              <div className="ax-field">
                <span>{t('api.editor.expiry')}</span>
                <div className="ax-presets">
                  {PRESETS.map(([key, days]) => (
                    <button
                      key={key}
                      type="button"
                      className={preset === key ? 'is-on' : ''}
                      disabled={key === 'never' && config?.maxLifetimeDays > 0}
                      onClick={() => {
                        setCustomDate(false);
                        set({ expiresAt: days ? dayjs().add(days, 'day').endOf('day').toISOString() : null });
                      }}
                    >
                      {t(`api.editor.expiryPresets.${key}`)}
                    </button>
                  ))}
                  <DatePicker
                    value={draft.expiresAt ? dayjs(draft.expiresAt) : null}
                    onChange={(date) => {
                      setCustomDate(true);
                      set({ expiresAt: date ? date.endOf('day').toISOString() : null });
                    }}
                    disabledDate={(date) => date.isBefore(dayjs(), 'day') || (config?.maxLifetimeDays > 0 && date.isAfter(dayjs().add(config.maxLifetimeDays, 'day')))}
                    format={locale === 'ru' ? 'D MMM YYYY' : 'MMM D, YYYY'}
                    allowClear={false}
                    className={preset === 'custom' ? 'is-on' : ''}
                  />
                </div>
              </div>
              {people && (
                <label className="ax-field">
                  <span>{t('api.editor.rateLimit')}</span>
                  <InputNumber min={1} max={100000} value={draft.rateLimit} onChange={(rateLimit) => set({ rateLimit })} placeholder={String(config?.defaultRateLimit || 120)} addonAfter={t('api.editor.perMinute')} style={{ width: '100%' }} />
                  <em className="ax-hint">{t('api.editor.rateLimitHint', { n: config?.defaultRateLimit || 120 })}</em>
                </label>
              )}
            </div>
          </section>

          <section className="ax-sec">
            <h3>{t('api.editor.templateTitle')}</h3>
            <p className="ax-hint">{t('api.editor.templateHint')}</p>
            <TemplatePicker templates={templates} value={draft.templateId} onChange={(templateId) => set({ templateId })} />
          </section>

          <section className="ax-sec">
            <h3>{t('api.editor.scopesTitle')}</h3>
            <p className="ax-hint">{t('api.editor.scopesHint')}</p>
            <ScopeMatrix areas={areas} value={levels} base={base} onChange={setLevel} />
          </section>

          <section className="ax-sec">
            <h3>{t('api.editor.resourcesTitle')}</h3>
            <p className="ax-hint">{t('api.editor.resourcesHint')}</p>
            <LimitsPicker kinds={resourceKinds} options={resources} value={draft.limits} onChange={(limits) => set({ limits })} areas={areas} />
          </section>

          <section className="ax-sec">
            <h3>{t('api.editor.rulesTitle')}</h3>
            <p className="ax-hint">{t('api.editor.rulesHint')}</p>
            <RulesEditor value={draft.rules} onChange={(rules) => set({ rules })} />
          </section>

          <section className="ax-sec">
            <h3>{t('api.editor.networkTitle')}</h3>
            <label className="ax-field">
              <span>{t('api.editor.ipAllow')}</span>
              <Select mode="tags" value={draft.ipAllow} onChange={(ipAllow) => set({ ipAllow })} tokenSeparators={[',', ' ', ';']} placeholder={t('api.editor.ipPlaceholder')} open={false} suffixIcon={null} />
              <em className="ax-hint">{t('api.editor.ipAllowHint')}</em>
            </label>
          </section>
        </div>

        <aside className="ax-editor__side">
          <div className="ax-summary">
            <div className="ax-summary__title">{t('api.editor.summary')}</div>
            {owner && (
              <div className="ax-summary__owner">
                <span className="ax-avatar">{owner.name.slice(0, 1)}</span>
                <div>
                  <strong>{owner.name}</strong>
                  <span>@{owner.username}</span>
                </div>
              </div>
            )}
            {template && (
              <div className="ax-summary__tpl" style={{ '--tpl': template.color }}>
                <GlyphIcon name={template.icon} />
                <span>{templateName(t, template)}</span>
                {Object.keys(draft.scopes).length > 0 && <em>+{Object.keys(draft.scopes).length}</em>}
              </div>
            )}
            <ul className="ax-summary__areas">
              {areas
                .filter((area) => (levels[area.key] || 'none') !== 'none')
                .map((area) => (
                  <li key={area.key}>
                    <span>{areaTitle(t, area.key)}</span>
                    <b className={`is-${levels[area.key]}`}>{t(`api.levels.${levels[area.key]}`)}</b>
                  </li>
                ))}
              {areas.every((area) => (levels[area.key] || 'none') === 'none') && <li className="ax-muted">{t('api.levels.none')}</li>}
            </ul>
            <div className="ax-summary__badges">
              {Object.entries(draft.limits).map(([key, ids]) => (
                <span key={key} className="ax-badge">
                  {t(`api.resources.${areaKey(key)}`)}: {ids.length}
                </span>
              ))}
              {draft.rules.filter((rule) => rule.path).length > 0 && <span className="ax-badge">{t('api.editor.rulesTitle')}: {draft.rules.filter((rule) => rule.path).length}</span>}
              {draft.ipAllow.length > 0 && <span className="ax-badge">{t('api.ipLocked', { n: draft.ipAllow.length })}</span>}
            </div>
            <PolicyTester policy={policy} moduleIds={moduleIds} />
          </div>
        </aside>
      </div>
    </Drawer>
  );
}

// ── Secret ─────────────────────────────────────────────────────────────────

export const VERIFY_SAMPLES = () => [
  {
    key: 'node',
    label: 'Node.js',
    code: `import crypto from 'node:crypto';

// rawBody: the request body exactly as received (string)
function verify(rawBody, header, secret = process.env.PORTAL_WEBHOOK_SECRET) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  return fresh && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}`,
  },
  {
    key: 'python',
    label: 'Python',
    code: `import hmac, hashlib, os, time

def verify(raw_body: bytes, header: str, secret=os.environ["PORTAL_WEBHOOK_SECRET"]):
    parts = dict(p.split("=", 1) for p in header.split(","))
    signed = f"{parts['t']}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    fresh = abs(time.time() - int(parts["t"])) < 300
    return fresh and hmac.compare_digest(parts["v1"], expected)`,
  },
  {
    key: 'php',
    label: 'PHP',
    code: `function verify(string $rawBody, string $header, string $secret): bool {
    parse_str(str_replace(',', '&', $header), $p);
    $expected = hash_hmac('sha256', $p['t'] . '.' . $rawBody, $secret);
    return abs(time() - (int) $p['t']) < 300 && hash_equals($expected, $p['v1']);
}`,
  },
].map((sample) => ({ ...sample, lang: 'text' }));

export function SecretModal({ open, secret, kind = 'token', origin, onClose }) {
  const { t } = useLocale();
  const [check, setCheck] = useState(null);
  useEffect(() => setCheck(null), [secret]);
  const tryIt = async () => {
    setCheck({ loading: true });
    try {
      const res = await rawCall({ method: 'GET', path: '/auth/me', token: secret });
      setCheck(res.ok ? { ok: true, name: res.json?.user?.displayName || res.json?.user?.username } : { ok: false, error: res.json?.code || res.status });
    } catch (err) {
      setCheck({ ok: false, error: err.message });
    }
  };
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={720} className="ax-secret" maskClosable={false} destroyOnHidden>
      <div className="ax-secret__hero">
        <div className="ax-secret__icon">
          <GlyphIcon name={kind === 'token' ? 'key' : 'shield'} />
        </div>
        <h2>{kind === 'token' ? t('api.secret.title') : t('api.secret.webhookTitle')}</h2>
        <p>{kind === 'token' ? t('api.secret.warning') : t('api.secret.webhookWarning')}</p>
      </div>
      <CopyField value={secret || ''} secret large />
      {kind === 'token' ? (
        <>
          <div className="ax-secret__try">
            <Button onClick={tryIt} loading={check?.loading}>
              {t('api.secret.tryIt')}
            </Button>
            {check && !check.loading && <span className={check.ok ? 'is-ok' : 'is-no'}>{check.ok ? t('api.secret.tryOk', { name: check.name }) : t('api.secret.tryFail', { error: check.error })}</span>}
          </div>
          <h4>{t('api.secret.useIt')}</h4>
          <CodeTabs samples={requestSamples({ method: 'GET', url: `${origin}/api/v1/auth/me` })} />
        </>
      ) : (
        <>
          <h4>{t('api.webhooks.verifyTitle')}</h4>
          <CodeTabs samples={VERIFY_SAMPLES()} />
        </>
      )}
      <div className="ax-secret__foot">
        <Button type="primary" size="large" onClick={onClose}>
          {t('api.secret.done')}
        </Button>
      </div>
    </Modal>
  );
}

// ── Misc ───────────────────────────────────────────────────────────────────

export function EmptyState({ icon = 'code', title, text, action }) {
  return (
    <div className="ax-empty">
      <div className="ax-empty__art">
        <GlyphIcon name={icon} />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function StatePill({ state }) {
  const { t } = useLocale();
  return <span className={`ax-state is-${state}`}>{t(`api.state.${state}`)}</span>;
}

export function statusClass(status) {
  if (status >= 500) return 'is-5xx';
  if (status >= 400) return 'is-4xx';
  if (status >= 300) return 'is-3xx';
  return 'is-2xx';
}
