import { Navigate, Route, Routes } from 'react-router-dom';
import Chrome from '../../components/Chrome';
import AppFooter from '../../components/AppFooter';
import PageTransition from '../../components/ui/PageTransition';
import ResourceBoard from './components/ResourceBoard';
import Manage from './pages/Manage';
import '../../components/documents/documents.css';
import './resources.css';

/** /app/resources (the board) and /app/resources/manage (catalogue, admins). */
export default function ResourcesApp() {
  return (
    <div className="shell">
      <Chrome />
      <main className="shell__main rs-shell">
        <PageTransition>
          <Routes>
            <Route index element={<ResourceBoard />} />
            <Route path="manage" element={<Manage />} />
            <Route path="*" element={<Navigate to="/app/resources" replace />} />
          </Routes>
        </PageTransition>
      </main>
      <AppFooter />
    </div>
  );
}
