import { Tooltip } from 'antd';
import { BgColorsOutlined, CheckOutlined, LockOutlined, StarFilled } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { templateText } from '../api';
import { TYPE_META } from './ContentForm';
import QrCode from './QrCode';

/** The kinds of code as a grid of pills. */
export function TypePicker({ value, onChange }) {
  const { t } = useLocale();
  return (
    <div className="qr-types" role="radiogroup" aria-label={t('qr.studio.type')} data-tour="qr.types">
      {TYPE_META.map((meta) => (
        <button
          key={meta.id}
          type="button"
          role="radio"
          aria-checked={value === meta.id}
          className={`qr-type${value === meta.id ? ' is-on' : ''}`}
          onClick={() => onChange(meta.id)}
        >
          <span className={`qr-type__icon is-${meta.id}`}>{meta.icon}</span>
          <span className="qr-type__text">
            <strong>{t(`qr.types.${meta.id}.name`)}</strong>
            <small>{t(`qr.types.${meta.id}.desc`)}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

const lockedGroups = (locks = {}) => Object.keys(locks).filter((key) => locks[key]);

/**
 * Templates drawn with the person's own content, so the choice is made by
 * looking at the real code. `custom` adds «Свой дизайн» (no template).
 */
export function TemplateGallery({ templates, value, onPick, payload, custom = false, onCustom }) {
  const { t, locale } = useLocale();
  return (
    <div className="qr-gallery" role="radiogroup" aria-label={t('qr.studio.template')} data-tour="qr.templates">
      {templates.map((template) => {
        const text = templateText(template, locale);
        const locks = lockedGroups(template.locks);
        const on = value === template.id;
        return (
          <button key={template.id} type="button" role="radio" aria-checked={on} className={`qr-gallery__item${on ? ' is-on' : ''}`} onClick={() => onPick(template)}>
            <span className="qr-gallery__thumb">
              <QrCode payload={payload || 'https://example.com'} design={template.design} />
              {on && <CheckOutlined className="qr-gallery__check" />}
            </span>
            <span className="qr-gallery__name">
              {template.isDefault && (
                <Tooltip title={t('qr.templates.default')}>
                  <StarFilled className="qr-star" />
                </Tooltip>
              )}
              {text.name}
              {locks.length > 0 && (
                <Tooltip title={t('qr.templates.lockedList', { list: locks.map((key) => t(`qr.locks.${key}`)).join(', ') })}>
                  <LockOutlined className="qr-muted" />
                </Tooltip>
              )}
            </span>
          </button>
        );
      })}
      {custom && (
        <button type="button" role="radio" aria-checked={value == null} className={`qr-gallery__item is-custom${value == null ? ' is-on' : ''}`} onClick={onCustom}>
          <span className="qr-gallery__thumb">
            <BgColorsOutlined />
            {value == null && <CheckOutlined className="qr-gallery__check" />}
          </span>
          <span className="qr-gallery__name">{t('qr.studio.customDesign')}</span>
        </button>
      )}
    </div>
  );
}
