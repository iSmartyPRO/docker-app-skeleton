import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Dropdown } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useLocale } from '../../context/LocaleContext';
import { useHelp } from '../../help/HelpContext';
import { helpForPath, loadHelp, tr } from '../../help/registry';
import Rich from '../../help/Rich';
import { nowInZone } from '../../lib/datetime';
import { ROBOTS, Robot } from './robots';
import Cast from './Cast';
import { livePrefs, readPosition, savePrefs, searchHelp, useAssistantPrefs, writePosition } from './store';
import './assistant.css';

/*
 * The robot assistant: a small animated helper floating over every signed-in
 * page. It can be dragged anywhere (the spot is kept per device), offers help
 * once in each section the person opens, and its panel answers from the help
 * content of the section: tips, short guide, full guide, FAQ and a search.
 */

const SIZES = { S: 52, M: 64, L: 80 };
const MARGIN = 12;
const SLEEP_AFTER = 120_000;
// Pages with the portal chrome; public share pages and sign-in stay clean.
const SHOWN_ON = /^\/($|apps|app\/|account|admin|help|developers)/;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isPhone = () => window.matchMedia('(max-width: 640px)').matches;

function useMood() {
  const [mood, setMoodState] = useState('idle');
  const timer = useRef(null);
  const setMood = useCallback((next, ms) => {
    clearTimeout(timer.current);
    setMoodState(next);
    if (ms) timer.current = setTimeout(() => setMoodState('idle'), ms);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [mood, setMood];
}

/** Random blinks, sometimes double, like a living face. */
function useBlink(active) {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    let timer;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlink(true);
        timer = setTimeout(() => {
          setBlink(false);
          if (Math.random() < 0.25) {
            timer = setTimeout(() => {
              setBlink(true);
              timer = setTimeout(() => {
                setBlink(false);
                schedule();
              }, 120);
            }, 160);
          } else schedule();
        }, 130);
      }, 2400 + Math.random() * 3600);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [active]);
  return blink;
}

const greetingKey = () => {
  const hour = nowInZone().hour();
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
};

export default function Assistant() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { pathname } = useLocation();
  const moduleOn = Boolean(settings?.modules?.assistant?.enabled);
  const prefs = useAssistantPrefs(moduleOn && user?.id ? user.id : null);
  const [hiddenNow, setHiddenNow] = useState(() => {
    try {
      return sessionStorage.getItem('da_assistant_hidden') === '1';
    } catch {
      return false;
    }
  });
  if (!user || !moduleOn || !prefs?.enabled || hiddenNow || !SHOWN_ON.test(pathname)) return null;
  // The organisation's robot and offers come from public settings, which refresh
  // as soon as an administrator saves them; a personal choice wins.
  const live = livePrefs(prefs, settings.modules.assistant);
  return <FloatingRobot user={user} prefs={live} pathname={pathname} onHide={() => setHiddenNow(true)} />;
}

function FloatingRobot({ user, prefs, pathname, onHide }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { openHelp } = useHelp();
  const kind = prefs.avatar || prefs.defaultAvatar || 'pixel';
  const robotMeta = ROBOTS.find((robot) => robot.id === kind) || ROBOTS[0];
  // The panel and bubbles wear the character's colour (the person's own, if chosen).
  const accent = prefs.colors?.[kind] || robotMeta.accent;
  const name = t(`assistant.robots.${kind}.name`);
  const [phone, setPhone] = useState(isPhone);
  const size = phone ? Math.min(56, SIZES[prefs.size] || 64) : SIZES[prefs.size] || 64;
  const section = helpForPath(pathname);

  const [mood, setMood] = useMood();
  // A new robot greets with a smile.
  const firstKind = useRef(kind);
  useEffect(() => {
    if (firstKind.current === kind) return;
    firstKind.current = kind;
    setMood('happy', 1600);
  }, [kind, setMood]);
  const [sleeping, setSleeping] = useState(false);
  const blink = useBlink(!sleeping && mood !== 'happy' && mood !== 'wave');
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [panel, setPanel] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);

  // ── Position ────────────────────────────────────────────────────────────
  const place = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const saved = readPosition();
    const maxX = vw - size - MARGIN;
    const maxY = vh - size - MARGIN;
    // Default: right edge, above the bottom where chat composers and toolbars live.
    if (!saved) return { x: maxX - 8, y: clamp(vh - size - (isPhone() ? 132 : 104), MARGIN, maxY) };
    return { x: clamp(saved.x * vw - size / 2, MARGIN, maxX), y: clamp(saved.y * vh - size / 2, MARGIN, maxY) };
  }, [size]);
  const [pos, setPos] = useState(place);
  const posRef = useRef(pos);
  posRef.current = pos;
  useEffect(() => {
    const update = () => {
      setPhone(isPhone());
      setPos(place());
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('assistant:position', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('assistant:position', update);
    };
  }, [place]);

  // ── Dragging (a short move is a click) ──────────────────────────────────
  const drag = useRef(null);
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    drag.current = { startX: event.clientX, startY: event.clientY, x: pos.x, y: pos.y, moved: false, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) < 5) return;
    if (!state.moved) {
      state.moved = true;
      setDragging(true);
      setBubble(null);
      setPanel(false);
      setMood('surprised');
    }
    setPos({
      x: clamp(state.x + dx, MARGIN, window.innerWidth - size - MARGIN),
      y: clamp(state.y + dy, MARGIN, window.innerHeight - size - MARGIN),
    });
  };
  const onPointerUp = (event) => {
    const state = drag.current;
    drag.current = null;
    if (!state || state.id !== event.pointerId) return;
    if (state.moved) {
      setDragging(false);
      setMood('happy', 1400);
      const current = posRef.current;
      writePosition({ x: (current.x + size / 2) / window.innerWidth, y: (current.y + size / 2) / window.innerHeight });
      return;
    }
    wake();
    setBubble(null);
    setPanel((open) => !open);
    setMood('happy', 1200);
  };

  // ── Eyes follow the pointer; sleep after a long pause ───────────────────
  const lastActivity = useRef(Date.now());
  const wake = useCallback(() => {
    lastActivity.current = Date.now();
    setSleeping((was) => {
      if (was) setMood('surprised', 700);
      return false;
    });
  }, [setMood]);
  useEffect(() => {
    let frame = 0;
    const onMove = (event) => {
      lastActivity.current = Date.now();
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = rootRef.current?.getBoundingClientRect();
        if (!box) return;
        const dx = event.clientX - (box.left + box.width / 2);
        const dy = event.clientY - (box.top + box.height / 2);
        const reach = 320;
        setLook({ x: clamp(dx / reach, -1, 1), y: clamp(dy / reach, -1, 1) });
      });
    };
    const onKey = () => {
      lastActivity.current = Date.now();
    };
    const timer = setInterval(() => {
      const idle = Date.now() - lastActivity.current > SLEEP_AFTER;
      setSleeping((was) => (was === idle ? was : idle));
    }, 5000);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  useEffect(() => {
    if (sleeping) {
      setPanel(false);
      setBubble(null);
    }
  }, [sleeping]);

  // ── Offer help once per section ─────────────────────────────────────────
  const greetedRef = useRef(prefs.greeted || []);
  greetedRef.current = prefs.greeted || [];
  useEffect(() => {
    if (!prefs.proactive || greetedRef.current.includes(section)) return undefined;
    let alive = true;
    const first = greetedRef.current.length === 0;
    const timer = setTimeout(async () => {
      const doc = await loadHelp(section, locale);
      if (!alive || !doc) return;
      setBubble({ first, title: tr(doc.title, locale) });
      setMood('wave', 2600);
      savePrefs({ greeted: [...greetedRef.current, section] }).catch(() => {});
    }, first ? 1200 : 1800);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [section, prefs.proactive, locale, setMood]);
  useEffect(() => {
    if (!bubble) return undefined;
    const timer = setTimeout(() => setBubble(null), 14000);
    return () => clearTimeout(timer);
  }, [bubble]);

  // ── Close the panel by Esc or a click elsewhere ─────────────────────────
  useEffect(() => {
    if (!panel) return undefined;
    const onKey = (event) => event.key === 'Escape' && setPanel(false);
    const onDown = (event) => {
      if (panelRef.current?.contains(event.target) || rootRef.current?.contains(event.target)) return;
      if (event.target.closest?.('.ant-dropdown, .ant-dropdown-menu')) return;
      setPanel(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [panel]);
  useEffect(() => setPanel(false), [pathname]);
  // On touch screens the click that follows a tap lands on whatever is under
  // the finger once the panel is open (on phones it covers the robot), so the
  // panel ignores taps for a moment after opening.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!panel) return undefined;
    setArmed(false);
    const timer = setTimeout(() => setArmed(true), 350);
    return () => clearTimeout(timer);
  }, [panel]);

  // Panel and bubble open towards the free side of the screen.
  const anchor = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const right = pos.x + size / 2 > vw / 2;
    const below = pos.y + size / 2 < vh / 2;
    return {
      ...(right ? { right: clamp(vw - pos.x - size, MARGIN, vw) } : { left: clamp(pos.x, MARGIN, vw) }),
      ...(below ? { top: pos.y + size + 10 } : { bottom: vh - pos.y + 10 }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, size, panel, bubble]);

  const displayMood = dragging ? 'surprised' : sleeping ? 'sleepy' : mood;

  // In <body>: a transformed ancestor would turn `position: fixed` into page coordinates.
  return createPortal(
    <>
      <div
        ref={rootRef}
        className={`asst${dragging ? ' is-dragging' : ''}`}
        style={{ left: pos.x, top: pos.y, width: size, height: size, '--asst-accent': accent }}
      >
        <button
          type="button"
          className="asst__bot"
          aria-label={t('assistant.open', { name })}
          aria-expanded={panel}
          title={dragging ? undefined : t('assistant.tooltip', { name })}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onPointerEnter={() => {
            wake();
            if (mood === 'idle') setMood('happy', 900);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setBubble(null);
              setPanel((open) => !open);
            }
          }}
        >
          <span key={kind} className="asst__swap">
            <Robot kind={kind} tint={prefs.colors?.[kind]} mood={displayMood} blink={blink} look={sleeping ? { x: 0, y: 0.3 } : look} size={size} />
          </span>
          {bubble && <span className="asst__dot" />}
        </button>
      </div>

      {bubble && !panel && (
        <div className="asst-bubble" style={{ ...anchor, '--asst-accent': accent }} role="status">
          <div>
            {bubble.first ? t('assistant.helloFirst', { name, first: firstName(user) }) : t('assistant.offer', { section: bubble.title })}
          </div>
          <div className="asst-bubble__actions">
            <Button
              size="small"
              type="primary"
              onClick={() => {
                setBubble(null);
                setPanel(true);
                setMood('happy', 1200);
              }}
            >
              {t('assistant.show')}
            </Button>
            <Button size="small" type="text" onClick={() => setBubble(null)}>
              {t('assistant.later')}
            </Button>
          </div>
        </div>
      )}

      {panel && (
        <div ref={panelRef} className={`asst-panel${armed ? ' is-armed' : ''}`} style={{ ...anchor, '--asst-accent': accent }} role="dialog" aria-label={name}>
          <AssistantPanel
            user={user}
            prefs={prefs}
            kind={kind}
            name={name}
            section={section}
            setMood={setMood}
            onClose={() => setPanel(false)}
            onHide={onHide}
            openHelp={(id, part) => {
              setPanel(false);
              openHelp(id, part);
            }}
            go={(to) => {
              setPanel(false);
              navigate(to);
            }}
          />
        </div>
      )}
    </>,
    document.body
  );
}

const firstName = (user) => String(user?.displayName || user?.username || '').split(/\s+/)[0];

function AssistantPanel({ user, prefs, kind, name, section, setMood, onClose, onHide, openHelp, go }) {
  const { t, locale } = useLocale();
  const [doc, setDoc] = useState(null);
  const [tip, setTip] = useState(0);
  const [faq, setFaq] = useState(false);
  const [open, setOpen] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [view, setView] = useState('main');
  // The administrator may allow one character only and turn colours off.
  const changeable = prefs.canChoose || prefs.allowColors;
  const [hello, setHello] = useState(null);

  // A new robot introduces itself for a moment in the header.
  const pick = (avatar) => {
    if ((avatar || null) === (prefs.avatar || null)) return;
    const next = avatar || prefs.defaultAvatar;
    savePrefs({ avatar }).catch(() => {});
    setMood('wave', 1800);
    setHello(next);
  };
  useEffect(() => {
    if (!hello) return undefined;
    const timer = setTimeout(() => setHello(null), 3200);
    return () => clearTimeout(timer);
  }, [hello]);

  useEffect(() => {
    let alive = true;
    loadHelp(section, locale).then((content) => {
      if (!alive) return;
      setDoc(content);
      setTip(Math.floor(Math.random() * Math.max(1, content?.tips?.length || 1)));
    });
    return () => {
      alive = false;
    };
  }, [section, locale]);

  // Search as the person types; the robot "thinks" meanwhile.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults(null);
      return undefined;
    }
    setMood('think');
    let alive = true;
    const timer = setTimeout(async () => {
      const found = await searchHelp(text, locale, section);
      if (!alive) return;
      setResults(found);
      setMood(found.length ? 'happy' : 'surprised', 1400);
    }, 280);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, locale, section, setMood]);

  const tips = doc?.tips || [];
  const title = doc ? tr(doc.title, locale) : '';
  const menu = {
    items: [
      ...(changeable ? [{ key: 'robot', label: t(prefs.canChoose ? 'assistant.menu.robot' : 'assistant.menu.color') }] : []),
      {
        key: 'size',
        label: t('assistant.menu.size'),
        children: ['S', 'M', 'L'].map((value) => ({ key: `size:${value}`, label: t(`assistant.sizes.${value}`) })),
      },
      { key: 'corner', label: t('assistant.menu.corner') },
      { type: 'divider' },
      { key: 'hide', label: t('assistant.menu.hide') },
      { key: 'off', label: t('assistant.menu.off'), danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'robot') setView('robots');
      else if (key.startsWith('size:')) savePrefs({ size: key.slice(5) });
      else if (key === 'corner') writePosition(null);
      else if (key === 'hide') {
        try {
          sessionStorage.setItem('da_assistant_hidden', '1');
        } catch {
          // storage blocked: hidden until the page reloads
        }
        onHide();
      } else if (key === 'off') savePrefs({ enabled: false });
    },
  };

  const list = results ?? (faq ? (doc?.faq || []).map((item, i) => ({ kind: 'faq', key: `f${i}`, title: tr(item.q, locale), answer: tr(item.a, locale) })) : null);

  return (
    <>
      <div className="asst-panel__head">
        <button
          type="button"
          className={`asst-avatar${view === 'robots' ? ' is-on' : ''}${changeable ? '' : ' is-fixed'}`}
          onClick={() => changeable && setView(view === 'robots' ? 'main' : 'robots')}
          disabled={!changeable}
          aria-label={changeable ? t('assistant.switch.open') : name}
          title={changeable ? t('assistant.switch.open') : undefined}
        >
          <span key={kind} className="asst__swap">
            <Robot kind={kind} tint={prefs.colors?.[kind]} mood={hello ? 'wave' : 'happy'} size={52} />
          </span>
          {changeable && <span className="asst-avatar__badge" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h9l-2.5-2.5M13 10H4l2.5 2.5" />
            </svg>
          </span>}
        </button>
        <div className="asst-panel__who">
          {hello ? (
            <>
              <strong className="asst-hello">{t('assistant.switch.hello', { name: t(`assistant.robots.${hello}.name`) })}</strong>
              <span>{t('assistant.switch.helloText')}</span>
            </>
          ) : view === 'robots' ? (
            <>
              <strong>{t('assistant.switch.title')}</strong>
              <span>{t('assistant.switch.subtitle')}</span>
            </>
          ) : (
            <>
              <strong>{t(`assistant.greeting.${greetingKey()}`, { first: firstName(user) })}</strong>
              <span>{title ? t('assistant.here', { name, section: title }) : t('assistant.intro', { name })}</span>
            </>
          )}
        </div>
        <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
          <button type="button" className="asst-icon-btn" aria-label={t('assistant.menu.title')}>
            ⋯
          </button>
        </Dropdown>
        <button type="button" className="asst-icon-btn" aria-label={t('common.close')} onClick={onClose}>
          ×
        </button>
      </div>

      {view === 'robots' ? (
        <div className="asst-panel__body">
          <Cast
            compact
            only={prefs.allowed}
            value={prefs.avatar || prefs.defaultAvatar}
            colors={prefs.colors}
            onPick={pick}
            onTint={
              prefs.allowColors
                ? (avatar, color) => {
                    savePrefs({ colors: { [avatar]: color } }).catch(() => {});
                    setMood('happy', 1200);
                  }
                : undefined
            }
          />
          {prefs.avatar && prefs.canChoose && (
            <button type="button" className="asst-cast__default" onClick={() => pick(null)}>
              ↺ {t('assistant.switch.useDefault', { name: t(`assistant.robots.${prefs.defaultAvatar}.name`) })}
            </button>
          )}
          <button type="button" className="asst-cast__done" onClick={() => setView('main')}>
            {t('assistant.switch.done')}
          </button>
        </div>
      ) : (
      <div className="asst-panel__body">
        <label className="asst-search">
          <span className="asst-search__icon" aria-hidden="true">
            ⌕
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('assistant.ask')}
            aria-label={t('assistant.ask')}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={!isPhone()}
          />
        </label>

        {list ? (
          <div className="asst-list">
            <div className="asst-list__title">{results ? t('assistant.found', { n: results.length }) : t('assistant.faqTitle')}</div>
            {list.length === 0 && <div className="asst-empty">{t('assistant.nothing')}</div>}
            {list.map((item, i) => {
              const key = item.key || `${item.id}-${item.section || item.kind}-${i}`;
              const isOpen = open === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`asst-result${isOpen ? ' is-open' : ''}`}
                  onClick={() => {
                    if (item.kind === 'faq') setOpen(isOpen ? null : key);
                    else openHelp(item.id, item.section);
                  }}
                >
                  <strong>
                    {item.kind === 'faq' ? '❓ ' : item.kind === 'section' ? '📄 ' : '📘 '}
                    {item.title}
                  </strong>
                  {results && item.article && <small>{item.article}</small>}
                  {isOpen && (
                    <div className="asst-result__answer">
                      <Rich text={item.answer} />
                    </div>
                  )}
                </button>
              );
            })}
            {(results || faq) && (
              <Button
                size="small"
                type="link"
                onClick={() => {
                  setQuery('');
                  setFaq(false);
                  setOpen(null);
                }}
              >
                ← {t('assistant.back')}
              </Button>
            )}
          </div>
        ) : (
          <>
            {tips.length > 0 && (
              <div className="asst-tip">
                <div className="asst-tip__label">
                  <span>💡 {t('assistant.tip')}</span>
                  {tips.length > 1 && (
                    <button type="button" className="asst-tip__next" onClick={() => setTip((tip + 1) % tips.length)}>
                      {t('assistant.nextTip')} →
                    </button>
                  )}
                </div>
                <Rich text={tr(tips[tip % tips.length], locale)} />
              </div>
            )}
            <div className="asst-actions">
              <button type="button" className="asst-action" onClick={() => openHelp(section)}>
                <span className="asst-action__icon">📖</span>
                <strong>{t('assistant.actions.guide')}</strong>
                <span>{t('assistant.actions.guideDesc')}</span>
              </button>
              <button type="button" className="asst-action" onClick={() => go(`/help/${section}`)}>
                <span className="asst-action__icon">🧭</span>
                <strong>{t('assistant.actions.full')}</strong>
                <span>{t('assistant.actions.fullDesc')}</span>
              </button>
              {doc?.faq?.length > 0 && (
                <button type="button" className="asst-action" onClick={() => setFaq(true)}>
                  <span className="asst-action__icon">❓</span>
                  <strong>{t('assistant.actions.faq')}</strong>
                  <span>{t('assistant.actions.faqDesc', { n: doc.faq.length })}</span>
                </button>
              )}
              <button type="button" className="asst-action" onClick={() => go('/help')}>
                <span className="asst-action__icon">🗂</span>
                <strong>{t('assistant.actions.all')}</strong>
                <span>{t('assistant.actions.allDesc')}</span>
              </button>
            </div>
          </>
        )}
      </div>
      )}

      <div className="asst-panel__foot">
        <span>{t('assistant.dragHint')}</span>
        <Link to="/account/appearance#assistant" onClick={onClose}>
          {t('assistant.settings')}
        </Link>
      </div>
    </>
  );
}
