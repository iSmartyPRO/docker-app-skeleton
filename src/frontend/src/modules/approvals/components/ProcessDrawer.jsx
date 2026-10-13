import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Drawer, Result, Skeleton, Tabs } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { errorMessage } from '../../../lib/errors';
import { approvalsApi } from '../api';
import { MODULE_LOOK, formatMoney, tr } from '../lib';
import ApprovalPath from '../ApprovalPath';
import ApprovalActions from '../ApprovalActions';
import History from './History';
import { Person } from './bits';

/**
 * The side card over the inbox: the document's summary, its path, the
 * decision buttons and the history. The list stays in place; ↑/↓ move to the
 * previous / next document (handled by the page).
 */
export default function ProcessDrawer({ processId, onClose, onChanged, position }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [state, setState] = useState({ process: null, error: null });
  useEffect(() => {
    if (!processId) return undefined;
    let alive = true;
    setState({ process: null, error: null });
    approvalsApi
      .processById(processId)
      .then((res) => alive && setState({ process: res.data.process, error: null }))
      .catch((error) => alive && setState({ process: null, error }));
    return () => {
      alive = false;
    };
  }, [processId]);
  const process = state.process;
  const look = MODULE_LOOK[process?.module] || { color: '#64748B', icon: 'inbox' };
  const width = typeof window !== 'undefined' && window.innerWidth < 720 ? '100%' : 560;
  return (
    <Drawer
      open={Boolean(processId)}
      onClose={onClose}
      width={width}
      destroyOnClose
      className="apr-drawer"
      title={
        process ? (
          <div className="apr-drawer__title">
            <span className="apr-drawer__icon" style={{ '--c': look.color }}>
              <MenuIcon name={look.icon} variant="mono" />
            </span>
            <span>
              <small>
                {tr(process.typeTitle, locale)}
                {process.number ? ` · ${process.number}` : ''}
              </small>
              <strong>{process.title}</strong>
            </span>
          </div>
        ) : (
          t('approvals.drawer.loading')
        )
      }
      extra={
        <div className="apr-drawer__nav">
          {position && <span className="apr-drawer__pos">{position}</span>}
          {process?.url && (
            <Button type="primary" ghost onClick={() => navigate(process.url)}>
              {t('approvals.actions.open')} ↗
            </Button>
          )}
        </div>
      }
    >
      {state.error ? (
        <Result status="warning" title={errorMessage(state.error)} />
      ) : !process ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <div className="apr-drawer__body">
          <dl className="apr-facts">
            {process.amount !== null && (
              <div>
                <dt>{t('approvals.fields.amount')}</dt>
                <dd className="apr-facts__money">{formatMoney(process.amount, process.currency, locale)}</dd>
              </div>
            )}
            <div>
              <dt>{t('approvals.fields.author')}</dt>
              <dd>
                <Person person={process.author} />
              </dd>
            </div>
          </dl>
          <ApprovalPath process={process} />
          <ApprovalActions
            process={process}
            type={process.type}
            docId={process.docId}
            onChange={(next) => {
              setState({ process: next, error: null });
              onChanged?.(next);
            }}
          />
          <Tabs
            size="small"
            items={[
              { key: 'history', label: t('approvals.drawer.history'), children: <History process={process} /> },
            ]}
          />
        </div>
      )}
    </Drawer>
  );
}
