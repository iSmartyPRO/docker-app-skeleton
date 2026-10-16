import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Result, Spin } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { ACCESS_ROOT, faError } from './api';
import { useAccess } from './AccessContext';
import { AdOff } from './components/Bits';
import Folders from './pages/Folders';
import FolderPage from './pages/FolderPage';
import People from './pages/People';
import PersonPage from './pages/PersonPage';
import Journal from './pages/Journal';
import NtfsReport from './pages/NtfsReport';
import './access.css';

/**
 * File server → «Доступ» (/app/drive/access/…): folders with access groups by project, folder
 * card, people, person card, journal and (superadministrators) the mismatch report. A folder's
 * own «Доступ» panel opens from the folder itself (AccessDrawer).
 */
export default function AccessSection() {
  const { t } = useLocale();
  const { info, error } = useAccess();
  const { pathname } = useLocation();
  if (error) return <Result status="warning" title={faError(error, t)} />;
  if (!info) {
    return (
      <div className="fa-loading">
        <Spin />
      </div>
    );
  }
  if (!info.role) return <Result status="403" title={t('folderAccess.noAccess')} subTitle={t('folderAccess.noAccessText')} />;
  // Without AD only the journal (kept in the portal's database) can be shown.
  if (!info.adConfigured && !pathname.startsWith(`${ACCESS_ROOT}/journal`)) return <AdOff role={info.role} />;
  const superadmin = info.role === 'superadmin';
  return (
    <Routes>
      <Route index element={<Folders />} />
      <Route path="f/:key" element={<FolderPage />} />
      <Route path="people" element={<People />} />
      <Route path="person" element={<PersonPage />} />
      <Route path="journal" element={<Journal />} />
      <Route path="report" element={superadmin ? <NtfsReport /> : <Navigate to={ACCESS_ROOT} replace />} />
      <Route path="*" element={<Navigate to={ACCESS_ROOT} replace />} />
    </Routes>
  );
}
