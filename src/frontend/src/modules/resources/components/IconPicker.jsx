import { useEffect, useMemo, useState } from 'react';
import { App, Button, ColorPicker, Input, Spin, Tabs, Tooltip, Upload } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { iconUrl, resourcesApi } from '../api';
import ResourceIcon from './ResourceIcon';
import { ICON_IDS, MenuIcon } from '../../../components/icons/menuIcons';

export const PALETTE = ['#2563EB', '#0EA5E9', '#06B6D4', '#14B8A6', '#10B981', '#22C55E', '#84CC16', '#EAB308', '#F59E0B', '#F97316', '#EF4444', '#E11D48', '#EC4899', '#D946EF', '#A855F7', '#8B5CF6', '#6366F1', '#334155', '#0F172A', '#78716C'];

// Hand-picked starting points; everything else is one search away.
const POPULAR = [
  'mail', 'calendar', 'calendar-check', 'message-circle', 'messages-square', 'video', 'phone', 'users', 'user-plus', 'id-card',
  'briefcase', 'building-2', 'landmark', 'house', 'wallet', 'credit-card', 'receipt', 'banknote', 'chart-column', 'chart-line',
  'chart-pie', 'trending-up', 'file-text', 'files', 'folder', 'folder-open', 'book-open', 'library', 'graduation-cap', 'notebook-pen',
  'life-buoy', 'headset', 'shield-check', 'lock', 'key-round', 'fingerprint', 'server', 'database', 'cloud', 'hard-drive',
  'globe', 'map-pin', 'map', 'truck', 'package', 'shopping-cart', 'store', 'warehouse', 'clipboard-list', 'kanban',
  'list-checks', 'square-check-big', 'clock', 'timer', 'megaphone', 'newspaper', 'rss', 'link', 'bookmark', 'star',
  'heart', 'gift', 'coffee', 'utensils', 'car', 'plane', 'hotel', 'stethoscope', 'hard-hat', 'wrench',
  'settings', 'cpu', 'code', 'git-branch', 'bug', 'terminal', 'printer', 'scan-line', 'camera', 'image',
  'film', 'monitor', 'laptop', 'smartphone', 'wifi', 'bell', 'info', 'circle-help', 'award', 'trophy',
  'target', 'rocket', 'lightbulb', 'palette', 'pen-tool', 'scale', 'gavel', 'handshake', 'bot', 'sparkles',
  'layers', 'layout-grid', 'layout-dashboard', 'workflow', 'calculator', 'boxes', 'factory', 'tractor', 'leaf', 'sun',
];

const POPULAR_BRANDS = [
  'gmail', 'googledrive', 'googlecalendar', 'googlemeet', 'googledocs', 'googlesheets', 'google', 'telegram', 'whatsapp', 'zoom',
  'slack', 'notion', 'jira', 'confluence', 'trello', 'atlassian', 'gitlab', 'github', 'bitbucket', 'figma',
  'miro', 'dropbox', 'nextcloud', 'mattermost', 'yandexcloud', 'vk', 'odoo', 'onlyoffice', 'libreoffice', 'googlemaps',
  'hubspot', 'zendesk', 'wordpress', 'youtube', 'instagram', 'facebook', 'x', 'docker', 'kubernetes', 'grafana',
  'jenkins', 'sentry', 'postman', 'anthropic', 'discord', 'airtable', 'clickup', 'asana', 'wikipedia', 'linear',
];

let lucideCache = null;
async function loadLucide() {
  if (!lucideCache) {
    lucideCache = Promise.all([import('lucide-static/icon-nodes.json'), import('lucide-static/tags.json')]).then(([nodes, tags]) => {
      const n = nodes.default || nodes;
      const tg = tags.default || tags;
      return Object.keys(n).map((name) => ({ name, nodes: n[name], keywords: `${name} ${(tg[name] || []).join(' ')}`.toLowerCase() }));
    });
  }
  return lucideCache;
}

let brandCache = null;
async function loadBrands() {
  if (!brandCache) {
    brandCache = import('simple-icons').then((module) =>
      Object.values(module)
        .filter((icon) => icon && typeof icon === 'object' && icon.path && icon.slug)
        .map((icon) => ({ name: icon.slug, title: icon.title, hex: `#${icon.hex}`, nodes: [['path', { d: icon.path }]], keywords: `${icon.slug} ${icon.title}`.toLowerCase() }))
    );
  }
  return brandCache;
}

function GlyphGrid({ set, value, onPick }) {
  const { t } = useLocale();
  const [all, setAll] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let alive = true;
    (set === 'brand' ? loadBrands() : loadLucide()).then((list) => alive && setAll(list)).catch(() => alive && setAll([]));
    return () => {
      alive = false;
    };
  }, [set]);
  const list = useMemo(() => {
    if (!all) return [];
    const text = q.trim().toLowerCase();
    if (!text) {
      const popular = set === 'brand' ? POPULAR_BRANDS : POPULAR;
      const byName = new Map(all.map((item) => [item.name, item]));
      return popular.map((name) => byName.get(name)).filter(Boolean);
    }
    const words = text.split(/\s+/);
    return all.filter((item) => words.every((word) => item.keywords.includes(word))).slice(0, 240);
  }, [all, q, set]);

  return (
    <div className="rs-glyphs">
      <Input
        allowClear
        autoFocus
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder={set === 'brand' ? t('resources.icon.searchBrands') : t('resources.icon.searchIcons')}
      />
      <div className="rs-glyphs__label">
        {q ? t('resources.icon.found', { n: list.length }) : set === 'brand' ? t('resources.icon.popularBrands') : t('resources.icon.popular')}
        {all && !q && <span> · {t('resources.icon.total', { n: all.length })}</span>}
      </div>
      {!all ? (
        <div className="rs-glyphs__loading"><Spin /></div>
      ) : (
        <div className="rs-glyphs__grid">
          {list.map((item) => (
            <Tooltip key={item.name} title={item.title || item.name} mouseEnterDelay={0.4}>
              <button
                type="button"
                className={`rs-glyphs__item${value?.set === set && value?.name === item.name ? ' is-active' : ''}`}
                onClick={() => onPick(item)}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill={set === 'brand' ? (item.hex || 'currentColor') : 'none'} stroke={set === 'brand' ? 'none' : 'currentColor'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  {item.nodes.map(([tag, attrs], index) => {
                    const Tag = tag;
                    return <Tag key={index} {...attrs} />;
                  })}
                </svg>
              </button>
            </Tooltip>
          ))}
          {!list.length && <div className="rs-glyphs__none">{t('resources.icon.none')}</div>}
        </div>
      )}
    </div>
  );
}

function UploadSlot({ label, hint, file, onChange, dark }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  return (
    <div className={`rs-upload${dark ? ' is-dark' : ''}`}>
      <span className="rs-upload__label">{label}</span>
      <Upload
        accept=".png,.svg,.webp,.jpg,.jpeg,image/png,image/svg+xml,image/webp,image/jpeg"
        showUploadList={false}
        customRequest={async ({ file: picked }) => {
          setBusy(true);
          try {
            const { data } = await resourcesApi.uploadIcon(picked);
            onChange(data.file);
          } catch (err) {
            message.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <button type="button" className="rs-upload__drop">
          {busy ? <Spin size="small" /> : file ? <img src={iconUrl(file)} alt="" /> : <span>⤒</span>}
        </button>
      </Upload>
      <span className="rs-upload__hint">{hint}</span>
      {file && <Button size="small" type="text" danger onClick={() => onChange(null)}>{t('common.delete')}</Button>}
    </div>
  );
}

const STYLES = ['gradient', 'soft', 'solid', 'plain'];

/** Designs a resource icon: library glyph, brand logo, own image or letter; style and colours; light and dark preview. */
export default function IconPicker({ value, onChange, title }) {
  const { t } = useLocale();
  const icon = value || { type: 'letter', style: 'gradient', color: '#6366F1' };
  const set = (patch) => onChange({ ...icon, ...patch });
  const tab = icon.type === 'glyph' ? (icon.set === 'brand' ? 'brand' : 'lucide') : icon.type === 'image' ? 'image' : icon.type === 'menu' ? 'portal' : 'letter';
  const [view, setView] = useState(tab);
  const [darkColor, setDarkColor] = useState(Boolean(icon.colorDark));

  const pickGlyph = (setName) => (item) =>
    onChange({
      ...icon,
      type: 'glyph',
      set: setName,
      name: item.name,
      mode: setName === 'brand' ? 'fill' : 'stroke',
      nodes: item.nodes,
      ...(setName === 'brand' ? { color: item.hex.toUpperCase(), style: icon.type === 'glyph' && icon.set === 'brand' ? icon.style : 'solid', color2: null } : {}),
    });

  return (
    <div className="rs-picker">
      <div className="rs-picker__preview">
        <div className="rs-picker__pane is-light" data-theme-preview="light">
          <ResourceIcon icon={icon} title={title} size={72} forceMode="light" />
          <span>{t('resources.icon.light')}</span>
        </div>
        <div className="rs-picker__pane is-dark" data-theme-preview="dark">
          <ResourceIcon icon={icon} title={title} size={72} forceMode="dark" />
          <span>{t('resources.icon.dark')}</span>
        </div>
      </div>

      <Tabs
        activeKey={view}
        onChange={setView}
        size="small"
        items={[
          { key: 'lucide', label: t('resources.icon.tabIcons'), children: <GlyphGrid set="lucide" value={icon} onPick={pickGlyph('lucide')} /> },
          { key: 'brand', label: t('resources.icon.tabBrands'), children: <GlyphGrid set="brand" value={icon} onPick={pickGlyph('brand')} /> },
          {
            key: 'portal',
            label: t('resources.icon.tabPortal'),
            children: (
              <div className="rs-glyphs">
                <div className="rs-glyphs__label">{t('resources.icon.portalHint')}</div>
                <div className="rs-glyphs__grid">
                  {ICON_IDS.map((name) => (
                    <button key={name} type="button" className={`rs-glyphs__item${icon.type === 'menu' && icon.name === name ? ' is-active' : ''}`} onClick={() => onChange({ ...icon, type: 'menu', name })}>
                      <span className="rs-glyphs__menu"><MenuIcon name={name} variant="mono" /></span>
                    </button>
                  ))}
                </div>
              </div>
            ),
          },
          {
            key: 'image',
            label: t('resources.icon.tabUpload'),
            children: (
              <div className="rs-uploads">
                <UploadSlot
                  label={t('resources.icon.forLight')}
                  hint={t('resources.icon.uploadHint')}
                  file={icon.type === 'image' ? icon.light : null}
                  onChange={(file) => (file ? onChange({ ...icon, type: 'image', light: file, style: icon.type === 'image' ? icon.style : 'plain' }) : onChange({ ...icon, type: 'letter', light: null, dark: null }))}
                />
                <UploadSlot
                  dark
                  label={t('resources.icon.forDark')}
                  hint={t('resources.icon.darkHint')}
                  file={icon.type === 'image' ? icon.dark : null}
                  onChange={(file) => icon.type === 'image' && set({ dark: file })}
                />
              </div>
            ),
          },
          {
            key: 'letter',
            label: t('resources.icon.tabLetter'),
            children: (
              <div className="rs-letter">
                <Input
                  maxLength={2}
                  value={icon.type === 'letter' ? icon.text || '' : ''}
                  placeholder={(title || 'A').slice(0, 1).toUpperCase()}
                  onChange={(event) => onChange({ ...icon, type: 'letter', text: event.target.value })}
                  style={{ width: 120 }}
                />
                <span>{t('resources.icon.letterHint')}</span>
              </div>
            ),
          },
        ]}
      />

      <div className="rs-picker__style">
        <span className="rs-picker__label">{t('resources.icon.style')}</span>
        <Segmented
          value={icon.style || 'gradient'}
          onChange={(style) => set({ style })}
          options={STYLES.filter((style) => icon.type !== 'image' || style !== 'gradient').map((style) => ({
            value: style,
            label: (
              <span className="rs-style-opt">
                <ResourceIcon icon={{ ...icon, style }} title={title} size={22} />
                {t(`resources.icon.style_${style}`)}
              </span>
            ),
          }))}
        />
      </div>

      {(icon.type !== 'image' || icon.style !== 'plain') && (
        <div className="rs-picker__colors">
          <span className="rs-picker__label">{t('resources.icon.color')}</span>
          <div className="rs-swatches">
            {PALETTE.map((color) => (
              <button key={color} type="button" className={icon.color === color ? 'is-active' : ''} style={{ background: color }} onClick={() => set({ color, color2: null })} aria-label={color} />
            ))}
            <ColorPicker value={icon.color} onChangeComplete={(color) => set({ color: color.toHexString().toUpperCase() })} size="small" />
          </div>
          {icon.style === 'gradient' && (
            <div className="rs-picker__row">
              <span>{t('resources.icon.gradientFrom')}</span>
              <ColorPicker allowClear value={icon.color2 || undefined} onChangeComplete={(color) => set({ color2: color.toHexString().toUpperCase() })} onClear={() => set({ color2: null })} size="small" />
            </div>
          )}
          <div className="rs-picker__row">
            <span>{t('resources.icon.darkColor')}</span>
            {darkColor || icon.colorDark ? (
              <>
                <ColorPicker value={icon.colorDark || icon.color} onChangeComplete={(color) => set({ colorDark: color.toHexString().toUpperCase() })} size="small" />
                <Button size="small" type="text" onClick={() => { setDarkColor(false); set({ colorDark: null }); }}>{t('resources.icon.sameColor')}</Button>
              </>
            ) : (
              <Button size="small" onClick={() => setDarkColor(true)}>{t('resources.icon.setDark')}</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
