import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Drawer } from 'antd';
import { useLocale } from '../context/LocaleContext';
import { useThemeMode } from '../context/ThemeContext';
import { MenuIcon } from '../components/icons/menuIcons';
import { HelpTitle, loadHelp, tr } from './registry';
import Rich from './Rich';
import { hasTour } from '../tour/engine';
import { startTour } from '../tour/TourContext';
import { TourIcon } from '../tour/TourButton';
import './help.css';

/** The short guide of a module in a side panel; links lead to the full article. */
export default function HelpDrawer({ id, section, onClose, onOpen }) {
  const { t, locale } = useLocale();
  const { appearance } = useThemeMode();
  const navigate = useNavigate();
  const [content, setContent] = useState(undefined);
  const [open, setOpen] = useState(section || null);
  const body = useRef(null);

  useEffect(() => {
    setContent(undefined);
    loadHelp(id, locale).then((data) => setContent(data || null));
  }, [id, locale]);
  useEffect(() => setOpen(section || null), [section, id]);
  useEffect(() => {
    if (!content || !section) return;
    setTimeout(() => body.current?.querySelector(`[data-sec="${section}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120);
  }, [content, section]);

  // «Тур»: the section's own tour, or the portal tour from the general articles.
  const tourId = hasTour(id) ? id : ['start', 'account', 'notifications'].includes(id) && hasTour('portal') ? 'portal' : null;

  const full = (target) => {
    onClose();
    navigate(`/help/${id}${target ? `#${target}` : ''}`);
  };

  return (
    <Drawer open onClose={onClose} width={520} className="hp-drawer" title={null} closable={false} styles={{ body: { padding: 0 } }}>
      <div className="hp-drawer__body" ref={body}>
        <div className="hp-drawer__top">
          <span className="hp-drawer__kicker">{t('help.title')}</span>
          <button type="button" className="hp-drawer__x" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        {content === undefined ? (
          <div className="hp-skeleton" />
        ) : content === null ? (
          <div className="hp-empty">
            <p>{t('help.notWritten')}</p>
            <Button onClick={() => full()}>{t('help.center')}</Button>
          </div>
        ) : (
          <>
            <header className="hp-hero is-compact">
              <span className="hp-hero__icon">
                <MenuIcon name={content.icon} appearance={appearance} />
              </span>
              <div>
                <h2>{tr(content.title, locale)}</h2>
                <p>{tr(content.tagline, locale)}</p>
              </div>
            </header>
            <Rich text={tr(content.summary, locale)} className="hp-summary" />

            <div className="hp-highlights is-compact">
              {(content.highlights || []).map((item, index) => (
                <div key={index} className="hp-highlight">
                  <span className="hp-highlight__icon">{item.icon}</span>
                  <div>
                    <strong>{tr(item.title, locale)}</strong>
                    <Rich text={tr(item.text, locale)} />
                  </div>
                </div>
              ))}
            </div>

            {content.tips?.length > 0 && (
              <div className="hp-tips">
                <h4>💡 {t('help.tips')}</h4>
                <ul>
                  {content.tips.map((tip, index) => (
                    <li key={index}>
                      <Rich text={tr(tip, locale)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <h4 className="hp-drawer__h">{t('help.howTo')}</h4>
            <div className="hp-acc">
              {(content.sections || []).map((item) => {
                const expanded = open === item.id;
                return (
                  <div key={item.id} data-sec={item.id} className={`hp-acc__item${expanded ? ' is-open' : ''}`}>
                    <button type="button" className="hp-acc__head" onClick={() => setOpen(expanded ? null : item.id)} aria-expanded={expanded}>
                      <span>{tr(item.title, locale)}</span>
                      <i aria-hidden="true">{expanded ? '−' : '+'}</i>
                    </button>
                    {expanded && (
                      <div className="hp-acc__body">
                        <Rich text={tr(item.body, locale)} />
                        {item.steps?.length > 0 && (
                          <ol className="hp-steps is-small">
                            {item.steps.map((step, index) => (
                              <li key={index}>
                                <Rich text={tr(step, locale)} />
                              </li>
                            ))}
                          </ol>
                        )}
                        <button type="button" className="hp-link" onClick={() => full(item.id)}>
                          {t('help.readFull')} →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {content.related?.length > 0 && (
              <div className="hp-related is-compact">
                {content.related.map((other) => (
                  <button key={other} type="button" onClick={() => onOpen(other)}>
                    {t('help.see')} · <HelpTitle id={other} />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="hp-drawer__foot">
        <Button type="primary" size="large" onClick={() => full(open)} disabled={!content}>
          {t('help.fullGuide')}
        </Button>
        <Button
          size="large"
          onClick={() => {
            onClose();
            navigate('/help');
          }}
        >
          {t('help.center')}
        </Button>
        {tourId && (
          <Button size="large" icon={<TourIcon />} onClick={() => startTour(tourId)}>
            {tourId === 'portal' ? t('tour.ui.startPortal') : t('tour.ui.startModule')}
          </Button>
        )}
        <span className="hp-drawer__kbd">
          <kbd>?</kbd> {t('help.shortcut')}
        </span>
      </div>
    </Drawer>
  );
}
