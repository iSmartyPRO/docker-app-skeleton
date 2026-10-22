import { Navigate, Route, Routes } from 'react-router-dom';
import Chrome from '../../components/Chrome';
import AppFooter from '../../components/AppFooter';
import PageTransition from '../../components/ui/PageTransition';
import { RemoteProvider } from './RemoteContext';
import Catalogue from './pages/Catalogue';
import Applications from './pages/Applications';
import Journal from './pages/Journal';
import MyComputer from './pages/MyComputer';
import Vault from './pages/Vault';
import '../shared/module.css';
import './remote.css';

/** /app/remote — computers catalogue, the journal (admins) and «my computer» (everyone). */
export default function RemoteApp() {
  return (
    <div className="shell">
      <Chrome />
      <main className="shell__main rm-shell">
        <RemoteProvider>
          <PageTransition>
            <Routes>
              <Route index element={<Catalogue />} />
              <Route path="apps" element={<Applications />} />
              <Route path="my" element={<MyComputer />} />
              <Route path="vault" element={<Vault />} />
              <Route path="journal" element={<Journal />} />
              <Route path="*" element={<Navigate to="/app/remote" replace />} />
            </Routes>
          </PageTransition>
        </RemoteProvider>
      </main>
      <AppFooter />
    </div>
  );
}
