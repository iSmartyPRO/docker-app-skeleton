import { Suspense, lazy } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

// The robot assistant loads after the page, never delaying it — and only for
// a signed-in person while the module is on (guests and the login page skip it).
const Assistant = lazy(() => import('../modules/assistant/Assistant'));

export default function AssistantSlot() {
  const { user } = useAuth();
  const { settings } = useSettings();
  if (!user || !settings?.modules?.assistant?.enabled) return null;
  return (
    <Suspense fallback={null}>
      <Assistant />
    </Suspense>
  );
}
