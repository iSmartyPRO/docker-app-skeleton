import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { fmtTime } from '../lib/datetime';
import { BUILD, checkNow, clientSessionId, outageDetails, useOutage } from '../lib/outage';

/*
 * The "technical works" screen: shown over the app while the server restarts,
 * the database is unavailable or the connection is lost. It checks the server
 * every few seconds and disappears by itself; what is on the page underneath
 * stays as it was. The ids below are what support needs to find the incident.
 */

/*
 * The robot drawing (~80 kB) stays out of the main bundle. It is fetched once
 * the page is idle, so it is already in memory when the server goes away;
 * if it could not be fetched the screen simply shows no robot.
 */
let robotModule = null;
let robotPromise = null;
function loadRobot() {
  if (!robotPromise) {
    robotPromise = import('../modules/assistant/robots')
      .then((module) => {
        robotModule = module;
        return module;
      })
      .catch(() => {
        robotPromise = null;
        return null;
      });
  }
  return robotPromise;
}
if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 4000));
  window.addEventListener('load', () => idle(() => loadRobot(), { timeout: 10000 }), { once: true });
}

function MaintenanceRobot(props) {
  const [module, setModule] = useState(robotModule);
  useEffect(() => {
    if (module) return undefined;
    let alive = true;
    loadRobot().then((loaded) => alive && loaded && setModule(loaded));
    return () => {
      alive = false;
    };
  }, [module]);
  if (!module) return <span style={{ display: 'inline-block', width: props.size, height: props.size }} />;
  const { Robot } = module;
  return <Robot {...props} />;
}

const KIND = { MAINTENANCE: 'update', HTTP_502: 'update', HTTP_504: 'update', DB_UNAVAILABLE: 'works', HTTP_503: 'works', NETWORK: 'network', TIMEOUT: 'network', OFFLINE: 'offline' };

export default function Maintenance() {
  const { t } = useLocale();
  const outage = useOutage();
  // Before settings ever loaded there is nothing real underneath: cover it fully.
  const { settings } = useSettings();
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!outage.active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [outage.active]);

  if (!outage.active) return null;
  const kind = KIND[outage.code] || 'works';
  const seconds = outage.nextCheck ? Math.max(0, Math.ceil((outage.nextCheck - now) / 1000)) : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(outageDetails(outage));
    } catch {
      /* clipboard blocked: the details stay on screen to copy by hand */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return createPortal(
    <div className={`mnt${settings ? '' : ' is-solid'}`} role="alertdialog" aria-live="assertive" aria-label={t(`outage.${kind}.title`)}>
      <div className="mnt__card">
        <div className="mnt__robot" aria-hidden="true">
          <MaintenanceRobot kind="builder" mood={outage.checking ? 'think' : 'idle'} size={112} />
        </div>
        <h1>{t(`outage.${kind}.title`)}</h1>
        <p>{t(`outage.${kind}.text`)}</p>

        <div className="mnt__status">
          <span className={`mnt__pulse${outage.checking ? ' is-checking' : ''}`} />
          {outage.checking ? t('outage.checking') : seconds !== null ? t('outage.nextCheck', { s: seconds }) : t('outage.waiting')}
        </div>

        <dl className="mnt__ids">
          <div>
            <dt>{t('outage.code')}</dt>
            <dd>{outage.code}</dd>
          </div>
          {outage.requestId && (
            <div>
              <dt>{t('outage.request')}</dt>
              <dd>{outage.requestId}</dd>
            </div>
          )}
          <div>
            <dt>{t('outage.session')}</dt>
            <dd>{clientSessionId()}</dd>
          </div>
          <div>
            <dt>{t('outage.since')}</dt>
            <dd>{fmtTime(outage.since || new Date())}</dd>
          </div>
        </dl>

        <div className="mnt__actions">
          <button type="button" className="mnt__primary" onClick={checkNow} disabled={outage.checking}>
            {t('outage.retry')}
          </button>
          <button type="button" className="mnt__secondary" onClick={copy}>
            {copied ? `✓ ${t('outage.copied')}` : t('outage.copy')}
          </button>
        </div>
        <small className="mnt__note">
          {t('outage.note')} · {BUILD}
        </small>
      </div>
    </div>,
    document.body
  );
}
