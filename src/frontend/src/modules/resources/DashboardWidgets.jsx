/* Dashboard widget of Online resources (registered in register.js): the link tiles. */

import { Link } from 'react-router-dom';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import ResourceIcon from './components/ResourceIcon';
import { itemText } from './api';
import { MODULE_REGISTRY } from '../registry';
import { useWidgetData } from '../../platform/widgets/api';
import { WidgetState } from '../../platform/widgets/common';
import './resources.css';

// ── Online resources ────────────────────────────────────────────────────────

export function Links({ widget, size }) {
  const { t, locale } = useLocale();
  const { settings } = useSettings();
  const state = useWidgetData('links', widget.settings);
  const items = state.data?.items || [];
  const list = widget.settings.style === 'list';
  return (
    <WidgetState state={state} empty={state.data && !items.length ? t('dashboard.links.empty') : null} emptyIcon="compass">
      <div className={`dw-links${list ? ' is-list' : ''}`} style={{ '--tile': size.w >= 6 ? '92px' : '80px' }}>
        {items.map((item) => {
          const text = itemText(item, { locale, t, settings, registry: MODULE_REGISTRY });
          const href = item.kind === 'module' ? `/app/${item.module}` : item.url;
          const inner = (
            <>
              <ResourceIcon icon={item.icon} title={text.title} size={list ? 32 : 44} />
              <span className="dw-links__text">
                <strong>{text.title}</strong>
                {list && text.description && <em>{text.description}</em>}
              </span>
            </>
          );
          return item.kind === 'module' ? (
            <Link key={item.id} to={href} className="dw-links__item" title={text.description || text.title}>
              {inner}
            </Link>
          ) : (
            <a key={item.id} href={href} className="dw-links__item" title={text.description || text.title} target={item.target === 'blank' ? '_blank' : undefined} rel="noopener noreferrer">
              {inner}
            </a>
          );
        })}
      </div>
    </WidgetState>
  );
}
