import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Modal } from 'antd';
import { visibleAdminPages, visibleSettingsItems } from '../admin/navigation';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useThemeMode } from '../context/ThemeContext';
import { MenuIcon } from './icons/menuIcons';
import { matchesQuery } from '../lib/search';
import { FEATURE_MODULES, MODULE_REGISTRY } from '../modules/registry';
import { hasAdminDocs } from '../modules/manifest';

function matches(entry, query) {
  return matchesQuery(`${entry.title} ${entry.subtitle || ''} ${entry.keywords || ''}`, query);
}

export function useCommandPaletteHotkey(setOpen) {
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}

/**
 * ⌘K / Ctrl+K launcher for every admin page, every settings screen and a few
 * actions. Entries come from the navigation registry, so it never goes stale.
 */
export default function CommandPalette({ open, onClose }) {
  const { t } = useLocale();
  const { appearance, mode, setMode } = useThemeMode();
  const navigate = useNavigate();
  const { can, canAny } = useAuth();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const entries = useMemo(() => {
    const pages = visibleAdminPages(canAny).map((page) => ({
      id: page.key,
      section: t('palette.pages'),
      title: t(page.labelKey),
      subtitle: t(page.descKey),
      keywords: page.keywords,
      icon: <MenuIcon slot={page.key} appearance={appearance} />,
      run: () => navigate(page.key),
    }));
    const settings = visibleSettingsItems(can).map((item) => ({
      id: item.key,
      section: t('palette.settings'),
      title: t(item.labelKey),
      subtitle: `${t(item.groupLabelKey)} · ${t(item.descKey)}`,
      keywords: item.keywords,
      icon: <MenuIcon slot={item.key} appearance={appearance} />,
      run: () => navigate(item.path),
    }));
    // «About the module» pages (admin docs), for people who can open settings.
    const docs = visibleSettingsItems(can).some((item) => item.id === 'modules')
      ? [...MODULE_REGISTRY, ...FEATURE_MODULES]
          .filter((module) => hasAdminDocs(module.id))
          .map((module) => ({
            id: `docs:${module.id}`,
            section: t('platform.docs.title'),
            title: `${t(module.labelKey)} · ${t('platform.docs.title')}`,
            subtitle: t(module.descKey),
            keywords: `${module.id} docs documentation guide about документация справка о модуле`,
            icon: <MenuIcon name={module.icon} appearance={appearance} />,
            run: () => navigate(`/admin/modules/${module.id}/docs`),
          }))
      : [];
    const actions = [
      {
        id: 'action:theme',
        section: t('palette.actions'),
        title: t('palette.toggleTheme'),
        keywords: 'theme dark light тема тёмная светлая',
        icon: <MenuIcon name="palette" appearance={appearance} />,
        run: () => setMode(mode === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'action:profile',
        section: t('palette.actions'),
        title: t('palette.profile'),
        keywords: 'profile account cabinet профиль кабинет',
        icon: <MenuIcon name="user" appearance={appearance} />,
        run: () => navigate('/account'),
      },
    ];
    return [...pages, ...settings, ...docs, ...actions];
  }, [t, appearance, navigate, mode, setMode, can, canAny]);

  const visible = useMemo(() => entries.filter((entry) => matches(entry, query)), [entries, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (entry) => {
    if (!entry) return;
    onClose();
    entry.run();
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, visible.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(visible[active]);
    }
  };

  let lastSection = null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={620}
      className="palette"
      destroyOnHidden
      afterOpenChange={(visible) => visible && inputRef.current?.focus()}
      styles={{ content: { padding: 0 } }}
    >
      <Input
        ref={inputRef}
        autoFocus
        size="large"
        variant="borderless"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('palette.placeholder')}
        className="palette__input"
        prefix={<span className="palette__glyph">⌘K</span>}
      />
      <div className="palette__list" ref={listRef} role="listbox">
        {visible.length === 0 && <div className="palette__empty">{t('palette.empty')}</div>}
        {visible.map((entry, index) => {
          const header = entry.section !== lastSection ? entry.section : null;
          lastSection = entry.section;
          return (
            <div key={entry.id}>
              {header && <div className="palette__section">{header}</div>}
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={`palette__item${index === active ? ' is-active' : ''}`}
                onMouseMove={() => setActive(index)}
                onClick={() => run(entry)}
              >
                <span className="palette__icon">{entry.icon}</span>
                <span className="palette__text">
                  <span className="palette__title">{entry.title}</span>
                  {entry.subtitle && <span className="palette__subtitle">{entry.subtitle}</span>}
                </span>
                <span className="palette__enter" aria-hidden="true">
                  ↵
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="palette__hint">{t('palette.hint')}</div>
    </Modal>
  );
}
