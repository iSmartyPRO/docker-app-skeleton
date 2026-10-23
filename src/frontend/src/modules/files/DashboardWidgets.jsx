/* Dashboard widget of Files (registered in register.js): recent files and the storage used. */

import { Link } from 'react-router-dom';
import { useLocale } from '../../context/LocaleContext';
import { formatBytes } from '../../lib/format';
import { FileIcon } from '../../components/documents/Icons';
import { useWidgetData } from '../../platform/widgets/api';
import { Meter } from '../../platform/widgets/charts';
import { WidgetState, When } from '../../platform/widgets/common';

// ── Files ───────────────────────────────────────────────────────────────────

export function RecentFiles({ widget }) {
  const { t } = useLocale();
  const state = useWidgetData('recentFiles', widget.settings);
  const data = state.data;
  return (
    <div className="dw-files">
      {data && widget.settings.showUsage !== false && (
        <div className="dw-usage">
          <div className="dw-usage__text">
            <span>{t('dashboard.files.usage')}</span>
            <b>
              {formatBytes(data.usage.used)}
              {data.usage.quota ? ` / ${formatBytes(data.usage.quota)}` : ''}
            </b>
          </div>
          {data.usage.quota > 0 && <Meter value={data.usage.used} max={data.usage.quota} />}
        </div>
      )}
      <WidgetState state={state} empty={data && !data.items.length ? t('dashboard.files.empty') : null} emptyIcon="folder">
        <ul className="dw-list">
          {(data?.items || []).map((node) => (
            <li key={node.id}>
              <Link to={`/app/files/v/${node.id}`} className="dw-row">
                <FileIcon item={{ kind: 'file', file: { ext: node.ext } }} size={30} />
                <span className="dw-row__text">
                  <strong>{node.name}</strong>
                  <em>{formatBytes(node.size)}</em>
                </span>
                <span className="dw-row__meta">
                  <When value={node.updatedAt} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </WidgetState>
    </div>
  );
}
