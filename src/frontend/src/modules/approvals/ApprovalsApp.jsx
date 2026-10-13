import { Suspense, lazy } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Result, Spin } from 'antd';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { useLocale } from '../../context/LocaleContext';
import { useApprovalsMeta } from './lib';
import InboxPage from './InboxPage';
import './approvals.css';

const ApprovalsAdmin = lazy(() => import('./settings/ApprovalsAdmin'));

function SettingsRoute() {
  const { t } = useLocale();
  const meta = useApprovalsMeta();
  if (!meta) return <div className="page-fallback"><Spin /></div>;
  if (!meta.canManageRoutes && !meta.canAdmin) return <Result status="403" title={t('approvals.settings.forbidden')} extra={<Link to="/app/approvals">{t('approvals.inbox.title')}</Link>} />;
  return (
    <div className="apr-page">
      <Link to="/app/approvals" className="apr-back">← {t('approvals.inbox.title')}</Link>
      <ApprovalsAdmin embedded />
    </div>
  );
}

/** Approvals: /app/approvals (the «Ждёт меня» inbox) and /app/approvals/settings (routes, urgency, substitutes). */
export default function ApprovalsApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <main className="apr-shell">
        <Suspense fallback={<div className="page-fallback"><Spin /></div>}>
          <PageTransition>
            <Routes>
              <Route index element={<InboxPage />} />
              <Route path="settings" element={<SettingsRoute />} />
              <Route path="*" element={<Navigate to="/app/approvals" replace />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </main>
    </div>
  );
}
