import { DatePicker, Input, Switch } from 'antd';
import {
  CalendarOutlined,
  EnvironmentOutlined,
  FontSizeOutlined,
  GlobalOutlined,
  IdcardOutlined,
  MailOutlined,
  MessageOutlined,
  PhoneOutlined,
  SendOutlined,
  WhatsAppOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import Segmented from '../../../components/ui/Segmented';
import { useLocale } from '../../../context/LocaleContext';

/** Types in the order of the picker, with their icons. */
export const TYPE_META = [
  { id: 'url', icon: <GlobalOutlined /> },
  { id: 'vcard', icon: <IdcardOutlined /> },
  { id: 'wifi', icon: <WifiOutlined /> },
  { id: 'text', icon: <FontSizeOutlined /> },
  { id: 'email', icon: <MailOutlined /> },
  { id: 'phone', icon: <PhoneOutlined /> },
  { id: 'sms', icon: <MessageOutlined /> },
  { id: 'whatsapp', icon: <WhatsAppOutlined /> },
  { id: 'telegram', icon: <SendOutlined /> },
  { id: 'geo', icon: <EnvironmentOutlined /> },
  { id: 'event', icon: <CalendarOutlined /> },
];

export const typeIcon = (type) => TYPE_META.find((meta) => meta.id === type)?.icon || <GlobalOutlined />;

/**
 * Coordinates from what people paste: "42.87, 74.59", a Google / Yandex /
 * 2GIS / OpenStreetMap link (…@42.87,74.59…, ?q=, ?ll= lng,lat, #map=z/lat/lng).
 */
export function parseCoordinates(value) {
  const text = decodeURIComponent(String(value || '').trim());
  const pair = (a, b, swap = false) => {
    const lat = Number(swap ? b : a);
    const lng = Number(swap ? a : b);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat: String(lat), lng: String(lng) } : null;
  };
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)';
  let match = new RegExp(`[?&]ll=${num},${num}`).exec(text);
  if (match) return pair(match[1], match[2], true);
  match = new RegExp(`#map=\\d+/${num}/${num}`).exec(text) || new RegExp(`@${num},${num}`).exec(text) || new RegExp(`[?&](?:q|query|daddr)=${num},\\s*${num}`).exec(text);
  if (match) return pair(match[1], match[2]);
  match = new RegExp(`^${num}\\s*[,;\\s]\\s*${num}$`).exec(text.replace(/[°]/g, ''));
  return match ? pair(match[1], match[2]) : null;
}

function Field({ label, hint, children, wide }) {
  return (
    <label className={`qr-field${wide ? ' is-wide' : ''}`}>
      <span className="qr-field__label">{label}</span>
      {children}
      {hint && <span className="qr-field__hint">{hint}</span>}
    </label>
  );
}

const asDay = (value) => (value ? dayjs(value) : null);

/** The fields of a type; `onChange(patch)` merges into the content. */
export default function ContentForm({ type, content = {}, onChange }) {
  const { t } = useLocale();
  const L = (key) => t(`qr.fields.${key}`);
  const text = (key, props = {}) => (
    <Input value={content[key] ?? ''} onChange={(event) => onChange({ [key]: event.target.value })} placeholder={t(`qr.placeholders.${key}`)} allowClear {...props} />
  );
  const area = (key, rows = 3, max = 600) => (
    <Input.TextArea value={content[key] ?? ''} onChange={(event) => onChange({ [key]: event.target.value })} placeholder={t(`qr.placeholders.${key}`)} autoSize={{ minRows: rows, maxRows: 10 }} maxLength={max} showCount />
  );

  switch (type) {
    case 'url':
      return (
        <div className="qr-form">
          <Field label={L('url')} wide>{text('url', { size: 'large', inputMode: 'url', autoFocus: true, prefix: <GlobalOutlined className="qr-muted" /> })}</Field>
        </div>
      );
    case 'text':
      return (
        <div className="qr-form">
          <Field label={L('text')} wide>{area('text', 4, 1500)}</Field>
        </div>
      );
    case 'vcard':
      return (
        <div className="qr-form">
          <Field label={L('firstName')}>{text('firstName', { autoFocus: true })}</Field>
          <Field label={L('lastName')}>{text('lastName')}</Field>
          <Field label={L('org')}>{text('org')}</Field>
          <Field label={L('title')}>{text('title')}</Field>
          <Field label={L('mobile')}>{text('mobile', { inputMode: 'tel' })}</Field>
          <Field label={L('phone')}>{text('phone', { inputMode: 'tel' })}</Field>
          <Field label={L('email')}>{text('email', { inputMode: 'email' })}</Field>
          <Field label={L('website')}>{text('website', { inputMode: 'url' })}</Field>
          <Field label={L('address')} wide>{text('address')}</Field>
          <Field label={L('note')} wide>{area('note', 2, 400)}</Field>
        </div>
      );
    case 'wifi': {
      const security = content.security || 'WPA';
      return (
        <div className="qr-form">
          <Field label={L('ssid')} wide>{text('ssid', { autoFocus: true, prefix: <WifiOutlined className="qr-muted" /> })}</Field>
          <Field label={L('security')} wide>
            <Segmented
              block
              value={security}
              onChange={(value) => onChange({ security: value })}
              options={[
                { value: 'WPA', label: 'WPA/WPA2' },
                { value: 'WEP', label: 'WEP' },
                { value: 'nopass', label: t('qr.fields.noPassword') },
              ]}
            />
          </Field>
          {security !== 'nopass' && (
            <Field label={L('password')} wide>
              <Input.Password value={content.password ?? ''} onChange={(event) => onChange({ password: event.target.value })} placeholder={t('qr.placeholders.password')} />
            </Field>
          )}
          <div className="qr-form__switch is-wide">
            <Switch size="small" checked={Boolean(content.hidden)} onChange={(hidden) => onChange({ hidden })} />
            <span>{L('hidden')}</span>
          </div>
        </div>
      );
    }
    case 'email':
      return (
        <div className="qr-form">
          <Field label={L('to')} wide>{text('to', { autoFocus: true, inputMode: 'email' })}</Field>
          <Field label={L('subject')} wide>{text('subject')}</Field>
          <Field label={L('body')} wide>{area('body', 3, 1000)}</Field>
        </div>
      );
    case 'phone':
      return (
        <div className="qr-form">
          <Field label={L('phoneNumber')} wide hint={t('qr.hints.phone')}>{text('phone', { autoFocus: true, size: 'large', inputMode: 'tel' })}</Field>
        </div>
      );
    case 'sms':
    case 'whatsapp':
      return (
        <div className="qr-form">
          <Field label={L('phoneNumber')} wide hint={type === 'whatsapp' ? t('qr.hints.whatsapp') : t('qr.hints.phone')}>{text('phone', { autoFocus: true, inputMode: 'tel' })}</Field>
          <Field label={L('message')} wide>{area('message', 3, 600)}</Field>
        </div>
      );
    case 'telegram':
      return (
        <div className="qr-form">
          <Field label={L('username')} wide hint={t('qr.hints.telegram')}>{text('username', { autoFocus: true, prefix: '@' })}</Field>
        </div>
      );
    case 'geo':
      return (
        <div className="qr-form">
          <Field label={L('mapLink')} wide hint={t('qr.hints.mapLink')}>
            <Input
              placeholder={t('qr.placeholders.mapLink')}
              allowClear
              onChange={(event) => {
                const found = parseCoordinates(event.target.value);
                if (found) onChange(found);
              }}
              prefix={<EnvironmentOutlined className="qr-muted" />}
            />
          </Field>
          <Field label={L('lat')}>{text('lat', { inputMode: 'decimal' })}</Field>
          <Field label={L('lng')}>{text('lng', { inputMode: 'decimal' })}</Field>
          <Field label={L('label')} wide>{text('label')}</Field>
        </div>
      );
    case 'event': {
      const allDay = Boolean(content.allDay);
      const format = allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm';
      const picker = (key) => (
        <DatePicker
          value={asDay(content[key])}
          onChange={(value) => onChange({ [key]: value ? value.format(format) : '' })}
          showTime={allDay ? false : { format: 'HH:mm', minuteStep: 5 }}
          format={allDay ? 'DD.MM.YYYY' : 'DD.MM.YYYY HH:mm'}
          style={{ width: '100%' }}
        />
      );
      return (
        <div className="qr-form">
          <Field label={L('eventTitle')} wide>{text('title', { autoFocus: true, placeholder: t('qr.placeholders.eventTitle') })}</Field>
          <div className="qr-form__switch is-wide">
            <Switch size="small" checked={allDay} onChange={(value) => onChange({ allDay: value, start: content.start?.slice(0, 10) || '', end: content.end?.slice(0, 10) || '' })} />
            <span>{L('allDay')}</span>
          </div>
          <Field label={L('start')}>{picker('start')}</Field>
          <Field label={L('end')}>{picker('end')}</Field>
          <Field label={L('location')} wide>{text('location')}</Field>
          <Field label={L('description')} wide>{area('description', 2, 600)}</Field>
        </div>
      );
    }
    default:
      return null;
  }
}
