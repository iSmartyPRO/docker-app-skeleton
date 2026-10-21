import { Navigate, Route, Routes } from 'react-router-dom';
import Chrome from '../../components/Chrome';
import AppFooter from '../../components/AppFooter';
import PageTransition from '../../components/ui/PageTransition';
import { QrProvider } from './QrContext';
import Library from './pages/Library';
import Studio from './pages/Studio';
import TemplateEditor from './pages/TemplateEditor';
import Templates from './pages/Templates';
import '../shared/module.css';
import './qr.css';

/** /app/qr — library, studio (/new, /:id) and templates (/templates…, qr.admin). */
export default function QrApp() {
  return (
    <div className="shell">
      <Chrome />
      <main className="shell__main qr-shell">
        <QrProvider>
          <PageTransition>
            <Routes>
              <Route index element={<Library />} />
              <Route path="new" element={<Studio />} />
              <Route path="templates" element={<Templates />} />
              <Route path="templates/new" element={<TemplateEditor />} />
              <Route path="templates/:id" element={<TemplateEditor />} />
              <Route path=":id" element={<Studio />} />
              <Route path="*" element={<Navigate to="/app/qr" replace />} />
            </Routes>
          </PageTransition>
        </QrProvider>
      </main>
      <AppFooter />
    </div>
  );
}
