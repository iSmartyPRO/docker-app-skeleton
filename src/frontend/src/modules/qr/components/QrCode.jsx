import { useEffect, useId, useMemo } from 'react';
import { useLocale } from '../../../context/LocaleContext';
import { drawCode } from '../engine/matrix';
import { useBrand, useLogoFill } from '../engine/runtime';

const GHOST = 'https://example.com/qr';

/**
 * A QR code drawn from a payload and a design. The markup comes from our own
 * renderer (texts escaped, pictures as data: URLs), so it is set as HTML.
 * Without a payload it shows a faint sample so the layout never jumps.
 */
export default function QrCode({ payload, design, className = '', onResult, label }) {
  const { t } = useLocale();
  const brand = useBrand();
  const fill = useLogoFill(design?.logo, brand);
  const id = `q${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const caption = t('qr.scanMe');
  const result = useMemo(
    () => drawCode(payload || GHOST, { design, brand, ...fill, caption, id }),
    [payload, design, brand, fill, caption, id]
  );
  const empty = !payload;

  useEffect(() => {
    onResult?.(empty ? { error: 'EMPTY' } : result);
  }, [result, empty, onResult]);

  if (result.error) {
    return (
      <div className={`qr-code is-error ${className}`} role="img" aria-label={t('qr.preview.tooLong')}>
        <span>{t('qr.preview.tooLong')}</span>
      </div>
    );
  }
  return (
    <div
      className={`qr-code${empty ? ' is-ghost' : ''} ${className}`}
      role="img"
      aria-label={label || t('qr.preview.alt')}
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
}
