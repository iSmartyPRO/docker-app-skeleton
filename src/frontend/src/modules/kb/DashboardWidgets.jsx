/* Dashboard widget of the knowledge base (registered in register.js): recent materials. */

import { Link } from 'react-router-dom';
import { useLocale } from '../../context/LocaleContext';
import { FileIcon } from '../../components/documents/Icons';
import { useWidgetData } from '../../platform/widgets/api';
import { WidgetState, When } from '../../platform/widgets/common';

// ── Knowledge base ──────────────────────────────────────────────────────────

export function KbRecent({ widget }) {
  const { t } = useLocale();
  const state = useWidgetData('kbRecent', widget.settings);
  const data = state.data;
  return (
    <WidgetState state={state} empty={data && !data.items.length ? t('dashboard.kb.empty') : null} emptyIcon="graduation">
      <ul className="dw-list">
        {(data?.items || []).map((item) => (
          <li key={item.id}>
            <Link to={`/app/kb/d/${item.id}`} className="dw-row">
              <FileIcon item={item} size={30} />
              <span className="dw-row__text">
                <strong>{item.title}</strong>
                {item.author && <em>{item.author}</em>}
              </span>
              <span className="dw-row__meta">
                <When value={item.updatedAt} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetState>
  );
}
