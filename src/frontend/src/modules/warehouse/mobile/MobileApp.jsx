import { Navigate, Route, Routes } from 'react-router-dom';
import MobileHome from './MobileHome';
import MobileDocFlow from './MobileDocFlow';
import MobileAccept from './MobileAccept';
import MobileFind from './MobileFind';
import MobileInventory from './MobileInventory';
import './mobile.css';

/**
 * The storekeeper's mobile mode (spec §8.3): /app/warehouse/m with big tiles
 * and one-handed flows. Also works on a desktop with a USB scanner.
 */
export default function MobileApp() {
  return (
    <div className="whm-shell">
      <Routes>
        <Route index element={<MobileHome />} />
        <Route path="doc/:type" element={<MobileDocFlow key="new" />} />
        <Route path="doc/:type/:id" element={<MobileDocFlow key="edit" />} />
        <Route path="accept" element={<MobileAccept />} />
        <Route path="accept/:id" element={<MobileAccept />} />
        <Route path="find" element={<MobileFind />} />
        <Route path="inventory" element={<MobileInventory />} />
        <Route path="inventory/:id" element={<MobileInventory />} />
        <Route path="inventory/:id/area/:bin" element={<MobileInventory />} />
        <Route path="*" element={<Navigate to="/app/warehouse/m" replace />} />
      </Routes>
    </div>
  );
}
