import { useSearchParams } from 'react-router-dom';
import { Tabs } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { useApprovalsMeta } from '../lib';
import RouteBuilder from './RouteBuilder';
import UrgencyEditor from './UrgencyEditor';
import SubstitutesPanel from './SubstitutesPanel';
import '../approvals.css';

/**
 * Approvals administration: routes (approvals.admin or a module's admin for
 * its own types), urgency levels and SLA, everyone's substitutes
 * (approvals.admin). Shown in the app (/app/approvals/settings) and in
 * Settings → Modules → Approvals.
 */
export default function ApprovalsAdmin({ embedded = false }) {
  const { t } = useLocale();
  const meta = useApprovalsMeta();
  const [params, setParams] = useSearchParams();
  const tab = params.get('section') || 'routes';
  const items = [
    { key: 'routes', label: t('approvals.settings.routes'), children: <RouteBuilder /> },
    ...(meta?.canAdmin
      ? [
          { key: 'urgency', label: t('approvals.settings.urgency'), children: <UrgencyEditor /> },
          { key: 'substitutes', label: t('approvals.settings.substitutes'), children: <SubstitutesPanel all /> },
        ]
      : []),
  ];
  return (
    <div className={`apr-admin${embedded ? ' is-embedded' : ''}`}>
      {embedded && (
        <header className="apr-hero is-small">
          <div>
            <div className="apr-hero__eyebrow">{t('apps.approvals.name')}</div>
            <h1>{t('approvals.settings.title')}</h1>
            <p>{t('approvals.settings.lead')}</p>
          </div>
        </header>
      )}
      <Tabs
        activeKey={items.some((item) => item.key === tab) ? tab : 'routes'}
        onChange={(key) => {
          const next = new URLSearchParams(params);
          next.set('section', key);
          setParams(next, { replace: true });
        }}
        items={items}
      />
    </div>
  );
}
