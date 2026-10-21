import { useMemo, useRef, useState } from 'react';
import { App, Button, ColorPicker, Input, Slider, Switch, Tooltip } from 'antd';
import { CheckOutlined, DeleteOutlined, LockOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons';
import Segmented from '../../../components/ui/Segmented';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { qrApi } from '../api';
import { ICON_IDS, LOGO_ICONS, TYPE_ICON } from '../engine/icons';
import { dotSample, eyeSample, resolveColor } from '../engine/render';
import { assetUrl, useBrand } from '../engine/runtime';

export const DOT_STYLES = ['rounded', 'fluid', 'square', 'dots', 'classy', 'diamond'];
export const EYE_FRAMES = ['rounded', 'square', 'circle', 'leaf', 'soft'];
export const EYE_BALLS = ['rounded', 'square', 'circle', 'leaf', 'diamond'];
const FRAMES = ['none', 'caption', 'card', 'ticket', 'badge'];
const LOGO_SOURCES = ['none', 'brand', 'brandDark', 'upload', 'icon'];

/** Colour sets applied in one click (dots, eyes, background). */
const PALETTES = [
  { key: 'ink', dots: '#0F172A', eye: null, bg: '#FFFFFF' },
  { key: 'brand', dots: '@brand', eye: null, bg: '#FFFFFF' },
  { key: 'navy', dots: '#1E3A8A', eye: '#2563EB', bg: '#FFFFFF' },
  { key: 'forest', dots: '#14532D', eye: '#15803D', bg: '#F7FBF4' },
  { key: 'wine', dots: '#7F1D1D', eye: '#B91C1C', bg: '#FFF8F6' },
  { key: 'plum', dots: '#4C1D95', eye: '#7C3AED', bg: '#FFFFFF' },
  { key: 'gold', dots: '#1C1917', eye: '#A16207', bg: '#FEFCE8' },
  { key: 'ocean', dots: '#0C4A6E', eye: '#0284C7', bg: '#F0F9FF', gradient: { type: 'linear', from: '#0C4A6E', to: '#0E7490', angle: 135 } },
  { key: 'sunset', dots: '#9D174D', eye: '#C2410C', bg: '#FFFFFF', gradient: { type: 'radial', from: '#BE185D', to: '#C2410C', angle: 0 } },
];

const SWATCHES = ['#0F172A', '#1E293B', '#1E3A8A', '#1D4ED8', '#0E7490', '#047857', '#15803D', '#A16207', '#C2410C', '#B91C1C', '#BE185D', '#7C3AED', '#4C1D95', '#000000'];

function Lock({ locked, children }) {
  const { t } = useLocale();
  if (!locked) return children;
  return (
    <div className="qr-locked">
      <div className="qr-locked__note">
        <LockOutlined /> {t('qr.designer.locked')}
      </div>
      <div className="qr-locked__body" aria-disabled="true" inert="">
        {children}
      </div>
    </div>
  );
}

function Row({ label, hint, children, stacked }) {
  return (
    <div className={`qr-row${stacked ? ' is-stacked' : ''}`}>
      <div className="qr-row__label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="qr-row__control">{children}</div>
    </div>
  );
}

/** A colour: picker with the portal swatches and a «brand colour» chip ("@brand"). */
export function ColorField({ value, onChange, allowBrand = true, allowEmpty = false, emptyLabel }) {
  const { t } = useLocale();
  const brand = useBrand();
  const isBrand = value === '@brand';
  const shown = value ? resolveColor(value, brand) : null;
  return (
    <div className="qr-color">
      {allowEmpty && (
        <button type="button" className={`qr-chip${!value ? ' is-on' : ''}`} onClick={() => onChange(null)}>
          {emptyLabel}
        </button>
      )}
      {allowBrand && (
        <Tooltip title={t('qr.designer.brandColorHint')}>
          <button type="button" className={`qr-chip is-brand${isBrand ? ' is-on' : ''}`} onClick={() => onChange('@brand')}>
            <span className="qr-chip__dot" style={{ background: brand.color }} /> {t('qr.designer.brandColor')}
          </button>
        </Tooltip>
      )}
      <ColorPicker
        value={shown || '#0F172A'}
        disabledAlpha
        showText
        presets={[{ label: t('qr.designer.swatches'), colors: SWATCHES }]}
        onChangeComplete={(color) => onChange(color.toHexString().toUpperCase())}
        className={!value || isBrand ? 'qr-color__picker is-idle' : 'qr-color__picker'}
      />
    </div>
  );
}

function Tiles({ items, value, onChange, render, label, className = '' }) {
  return (
    <div className={`qr-tiles ${className}`} role="radiogroup">
      {items.map((item) => (
        <Tooltip key={item} title={label(item)} mouseEnterDelay={0.4}>
          <button type="button" role="radio" aria-checked={value === item} aria-label={label(item)} className={`qr-tile${value === item ? ' is-on' : ''}`} onClick={() => onChange(item)}>
            {render(item)}
            {value === item && <CheckOutlined className="qr-tile__check" />}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

const svg = (markup) => <span className="qr-tile__svg" dangerouslySetInnerHTML={{ __html: markup }} />;

function FrameGlyph({ style }) {
  const box = <rect x="14" y="10" width="36" height="36" rx="5" fill="currentColor" opacity=".9" />;
  switch (style) {
    case 'caption':
      return <svg viewBox="0 0 64 64">{box}<rect x="18" y="51" width="28" height="4" rx="2" fill="currentColor" opacity=".55" /></svg>;
    case 'card':
      return <svg viewBox="0 0 64 64"><rect x="9" y="5" width="46" height="55" rx="8" fill="currentColor" opacity=".3" /><rect x="13" y="9" width="38" height="38" rx="4" fill="#fff" /><rect x="17" y="13" width="30" height="30" rx="3" fill="currentColor" opacity=".9" /><rect x="20" y="51" width="24" height="4" rx="2" fill="#fff" /></svg>;
    case 'ticket':
      return <svg viewBox="0 0 64 64"><rect x="9" y="4" width="46" height="56" rx="8" fill="currentColor" opacity=".3" /><circle cx="9" cy="18" r="3.5" fill="var(--qr-tile-bg)" /><circle cx="55" cy="18" r="3.5" fill="var(--qr-tile-bg)" /><rect x="20" y="9" width="24" height="4" rx="2" fill="#fff" /><rect x="13" y="20" width="38" height="36" rx="4" fill="#fff" /><rect x="17" y="24" width="30" height="28" rx="3" fill="currentColor" opacity=".9" /></svg>;
    case 'badge':
      return <svg viewBox="0 0 64 64"><rect x="9" y="6" width="46" height="46" rx="8" fill="none" stroke="currentColor" strokeWidth="2.5" opacity=".6" /><rect x="15" y="12" width="34" height="34" rx="4" fill="currentColor" opacity=".9" /><rect x="18" y="47" width="28" height="10" rx="5" fill="currentColor" /></svg>;
    default:
      return <svg viewBox="0 0 64 64">{box}</svg>;
  }
}

function LogoGlyph({ source, brand, file }) {
  const { t } = useLocale();
  if (source === 'none') return <StopOutlined className="qr-tile__icon" />;
  if (source === 'brand' || source === 'brandDark') {
    const image = source === 'brand' ? brand.logo : brand.logoDark;
    return image ? <img src={image.href} alt="" className={`qr-tile__img${source === 'brandDark' ? ' is-dark' : ''}`} /> : <span className="qr-tile__none">{t('qr.designer.noBrandLogoShort')}</span>;
  }
  if (source === 'upload') return file ? <img src={assetUrl(file)} alt="" className="qr-tile__img" /> : <UploadOutlined className="qr-tile__icon" />;
  return <span className="qr-tile__svg" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LOGO_ICONS.star.markup}</svg>` }} />;
}

/**
 * Every option of the look, in tabs. `locks` (from the template) and
 * `lockAll` (module setting «templates only») turn groups read-only; the
 * server enforces the same rule.
 */
export default function Designer({ design, onChange, locks = {}, lockAll = false, allowUploads = true, type = 'url', admin = false }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const brand = useBrand();
  const [tab, setTab] = useState('style');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
  const locked = (key) => !admin && (lockAll || Boolean(locks[key]));
  const set = (group, patch) => onChange({ ...design, [group]: { ...design[group], ...patch } });
  const icons = useMemo(() => {
    const first = TYPE_ICON[type];
    return [first, ...ICON_IDS.filter((id) => id !== first)].filter(Boolean);
  }, [type]);

  const dotSamples = useMemo(() => Object.fromEntries(DOT_STYLES.map((style) => [style, dotSample(style)])), []);
  const frameSamples = useMemo(() => Object.fromEntries(EYE_FRAMES.map((frame) => [frame, eyeSample(frame, frame === 'soft' ? 'rounded' : frame === 'leaf' ? 'leaf' : frame)])), []);
  const ballSamples = useMemo(() => Object.fromEntries(EYE_BALLS.map((ball) => [ball, eyeSample('square', ball)])), []);

  const gradient = design.dots.gradient;
  const gradientMode = gradient ? gradient.type : 'solid';

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await qrApi.upload(file);
      onChange({ ...design, logo: { ...design.logo, source: 'upload', file: res.data.file } });
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const tabs = [
    { value: 'style', label: t('qr.designer.tabs.style'), lock: 'shape' },
    { value: 'colors', label: t('qr.designer.tabs.colors'), lock: 'colors' },
    { value: 'logo', label: t('qr.designer.tabs.logo'), lock: 'logo' },
    { value: 'frame', label: t('qr.designer.tabs.frame'), lock: 'frame' },
  ];

  return (
    <div className="qr-designer" data-tour="qr.designer">
      <Segmented
        block
        className="qr-designer__tabs"
        value={tab}
        onChange={setTab}
        options={tabs.map((item) => ({
          value: item.value,
          label: (
            <span className="qr-designer__tab">
              {locked(item.lock) && <LockOutlined />} {item.label}
            </span>
          ),
        }))}
      />

      {tab === 'style' && (
        <Lock locked={locked('shape')}>
          <Row label={t('qr.designer.dots')} stacked>
            <Tiles items={DOT_STYLES} value={design.dots.style} onChange={(style) => set('dots', { style })} label={(item) => t(`qr.designer.dotStyles.${item}`)} render={(item) => svg(dotSamples[item])} />
          </Row>
          <Row label={t('qr.designer.eyeFrame')} stacked>
            <Tiles items={EYE_FRAMES} value={design.eyes.frame} onChange={(frame) => set('eyes', { frame })} label={(item) => t(`qr.designer.eyeFrames.${item}`)} render={(item) => svg(frameSamples[item])} />
          </Row>
          <Row label={t('qr.designer.eyeBall')} stacked>
            <Tiles items={EYE_BALLS} value={design.eyes.ball} onChange={(ball) => set('eyes', { ball })} label={(item) => t(`qr.designer.eyeBalls.${item}`)} render={(item) => svg(ballSamples[item])} />
          </Row>
          <Row label={t('qr.designer.margin')} hint={t('qr.designer.marginHint')}>
            <Slider min={0} max={8} value={design.margin} onChange={(margin) => onChange({ ...design, margin })} tooltip={{ formatter: (value) => t('qr.designer.modulesN', { count: value }) }} />
          </Row>
          <Row label={t('qr.designer.ecl')} hint={t('qr.designer.eclHint')} stacked>
            <Segmented
              block
              value={design.ecl}
              onChange={(ecl) => onChange({ ...design, ecl })}
              options={['auto', 'L', 'M', 'Q', 'H'].map((value) => ({ value, label: value === 'auto' ? t('qr.designer.eclAuto') : `${value} · ${{ L: 7, M: 15, Q: 25, H: 30 }[value]}%` }))}
            />
          </Row>
        </Lock>
      )}

      {tab === 'colors' && (
        <Lock locked={locked('colors')}>
          <Row label={t('qr.designer.palettes')} stacked>
            <div className="qr-palettes">
              {PALETTES.map((palette) => {
                const dots = resolveColor(palette.dots, brand);
                const eye = palette.eye ? resolveColor(palette.eye, brand) : dots;
                return (
                  <Tooltip key={palette.key} title={t(`qr.designer.paletteNames.${palette.key}`)}>
                    <button
                      type="button"
                      className="qr-palette"
                      aria-label={t(`qr.designer.paletteNames.${palette.key}`)}
                      style={{ background: palette.bg }}
                      onClick={() =>
                        onChange({
                          ...design,
                          dots: { ...design.dots, color: palette.dots, gradient: palette.gradient || null },
                          eyes: { ...design.eyes, frameColor: palette.eye, ballColor: palette.eye },
                          background: { ...design.background, color: palette.bg, transparent: false },
                        })
                      }
                    >
                      <span style={{ background: palette.gradient ? `linear-gradient(135deg, ${palette.gradient.from}, ${palette.gradient.to})` : dots }} />
                      <span style={{ background: eye }} />
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </Row>
          <Row label={t('qr.designer.fill')} stacked>
            <Segmented
              block
              value={gradientMode}
              onChange={(mode) =>
                set('dots', {
                  gradient: mode === 'solid' ? null : { type: mode, from: gradient?.from || design.dots.color, to: gradient?.to || '#0E7490', angle: gradient?.angle ?? 135 },
                })
              }
              options={[
                { value: 'solid', label: t('qr.designer.solid') },
                { value: 'linear', label: t('qr.designer.linear') },
                { value: 'radial', label: t('qr.designer.radial') },
              ]}
            />
          </Row>
          {!gradient && (
            <Row label={t('qr.designer.dotsColor')}>
              <ColorField value={design.dots.color} onChange={(color) => set('dots', { color })} />
            </Row>
          )}
          {gradient && (
            <>
              <Row label={t('qr.designer.gradientFrom')}>
                <ColorField value={gradient.from} onChange={(from) => set('dots', { color: from, gradient: { ...gradient, from } })} />
              </Row>
              <Row label={t('qr.designer.gradientTo')}>
                <ColorField value={gradient.to} onChange={(to) => set('dots', { gradient: { ...gradient, to } })} />
              </Row>
              {gradient.type === 'linear' && (
                <Row label={t('qr.designer.angle')}>
                  <Slider min={0} max={360} step={15} value={gradient.angle} onChange={(angle) => set('dots', { gradient: { ...gradient, angle } })} tooltip={{ formatter: (value) => `${value}°` }} />
                </Row>
              )}
            </>
          )}
          <Row label={t('qr.designer.eyeFrameColor')}>
            <ColorField value={design.eyes.frameColor} allowEmpty emptyLabel={t('qr.designer.sameAsDots')} onChange={(frameColor) => set('eyes', { frameColor })} />
          </Row>
          <Row label={t('qr.designer.eyeBallColor')}>
            <ColorField value={design.eyes.ballColor} allowEmpty emptyLabel={t('qr.designer.sameAsDots')} onChange={(ballColor) => set('eyes', { ballColor })} />
          </Row>
          <Row label={t('qr.designer.background')}>
            <div className="qr-inline">
              {!design.background.transparent && <ColorField value={design.background.color} allowBrand={false} onChange={(color) => set('background', { color })} />}
              <label className="qr-inline__switch">
                <Switch size="small" checked={design.background.transparent} onChange={(transparent) => set('background', { transparent })} /> {t('qr.designer.transparent')}
              </label>
            </div>
          </Row>
          <Row label={t('qr.designer.radius')}>
            <Slider min={0} max={30} value={design.background.radius} onChange={(radius) => set('background', { radius })} tooltip={{ formatter: (value) => `${value}%` }} disabled={design.background.transparent && design.frame.style === 'none'} />
          </Row>
        </Lock>
      )}

      {tab === 'logo' && (
        <Lock locked={locked('logo')}>
          <Row label={t('qr.designer.logoSource')} stacked>
            <Tiles
              className="is-logo"
              items={LOGO_SOURCES.filter((source) => source !== 'upload' || allowUploads || admin || design.logo.source === 'upload')}
              value={design.logo.source}
              onChange={(source) => {
                if (source === 'upload' && !design.logo.file) {
                  fileInput.current?.click();
                  return;
                }
                set('logo', { source, icon: source === 'icon' ? design.logo.icon || TYPE_ICON[type] || 'link' : design.logo.icon });
              }}
              label={(item) => t(`qr.designer.logoSources.${item}`)}
              render={(item) => (
                <span className="qr-tile__stack">
                  <LogoGlyph source={item} brand={brand} file={design.logo.file} />
                  <small>{t(`qr.designer.logoSources.${item}`)}</small>
                </span>
              )}
            />
            <input ref={fileInput} type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" hidden onChange={(event) => upload(event.target.files?.[0])} />
          </Row>
          {(design.logo.source === 'brand' || design.logo.source === 'brandDark') && !brand.hasLogo && (
            <p className="qr-note">{t('qr.designer.noBrandLogo')}</p>
          )}
          {design.logo.source === 'upload' && (
            <Row label={t('qr.designer.logoFile')}>
              <div className="qr-inline">
                <Button icon={<UploadOutlined />} loading={uploading} onClick={() => fileInput.current?.click()}>
                  {design.logo.file ? t('qr.designer.replace') : t('qr.designer.upload')}
                </Button>
                {design.logo.file && <Button type="text" icon={<DeleteOutlined />} aria-label={t('common.delete')} onClick={() => set('logo', { source: 'none', file: null })} />}
              </div>
            </Row>
          )}
          {design.logo.source === 'icon' && (
            <Row label={t('qr.designer.icon')} stacked>
              <div className="qr-icons">
                {icons.map((id) => {
                  const icon = LOGO_ICONS[id];
                  const paint = icon.mode === 'stroke' ? 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' : `fill="${icon.color || 'currentColor'}"`;
                  return (
                    <button key={id} type="button" aria-label={id} className={`qr-icon${design.logo.icon === id ? ' is-on' : ''}`} onClick={() => set('logo', { icon: id })}>
                      <span dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" ${paint}>${icon.markup}</svg>` }} />
                    </button>
                  );
                })}
              </div>
            </Row>
          )}
          {design.logo.source !== 'none' && (
            <>
              <Row label={t('qr.designer.logoSize')} hint={t('qr.designer.logoSizeHint')}>
                <Slider min={10} max={30} value={design.logo.size} onChange={(size) => set('logo', { size })} tooltip={{ formatter: (value) => `${value}%` }} />
              </Row>
              <Row label={t('qr.designer.plate')} stacked>
                <Segmented
                  block
                  value={design.logo.plate}
                  onChange={(plate) => set('logo', { plate })}
                  options={['none', 'square', 'rounded', 'circle'].map((value) => ({ value, label: t(`qr.designer.plates.${value}`) }))}
                />
              </Row>
              {design.logo.plate !== 'none' && (
                <Row label={t('qr.designer.plateColor')}>
                  <ColorField value={design.logo.plateColor} onChange={(plateColor) => set('logo', { plateColor })} />
                </Row>
              )}
              <Row label={t('qr.designer.padding')}>
                <Slider min={0} max={30} value={design.logo.padding} onChange={(padding) => set('logo', { padding })} tooltip={{ formatter: (value) => `${value}%` }} />
              </Row>
            </>
          )}
        </Lock>
      )}

      {tab === 'frame' && (
        <Lock locked={locked('frame')}>
          <Row label={t('qr.designer.frameStyle')} stacked>
            <Tiles
              className="is-frame"
              items={FRAMES}
              value={design.frame.style}
              onChange={(style) => set('frame', { style })}
              label={(item) => t(`qr.designer.frames.${item}`)}
              render={(item) => (
                <span className="qr-tile__stack">
                  <FrameGlyph style={item} />
                  <small>{t(`qr.designer.frames.${item}`)}</small>
                </span>
              )}
            />
          </Row>
          {design.frame.style !== 'none' && (
            <>
              <Row label={t('qr.designer.caption')} hint={t('qr.designer.captionHint')} stacked>
                <Input value={design.frame.text} maxLength={40} showCount placeholder={t('qr.scanMe')} onChange={(event) => set('frame', { text: event.target.value })} />
                <div className="qr-suggest">
                  {['scanMe', 'scanMenu', 'scanWifi', 'scanContact', 'scanSite'].map((key) => (
                    <button key={key} type="button" className="qr-chip" onClick={() => set('frame', { text: t(`qr.captions.${key}`) })}>
                      {t(`qr.captions.${key}`)}
                    </button>
                  ))}
                </div>
              </Row>
              {design.frame.style !== 'caption' && (
                <Row label={t('qr.designer.frameColor')}>
                  <Lock locked={locked('colors')}>
                    <ColorField value={design.frame.color} onChange={(color) => set('frame', { color })} />
                  </Lock>
                </Row>
              )}
              <Row label={t('qr.designer.textColor')}>
                <Lock locked={locked('colors')}>
                  <ColorField value={design.frame.textColor} onChange={(textColor) => set('frame', { textColor })} />
                </Lock>
              </Row>
            </>
          )}
        </Lock>
      )}
    </div>
  );
}
