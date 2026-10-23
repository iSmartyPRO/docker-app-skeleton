import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useContributions } from '../platform/extensions';
import Contribution from '../platform/Contribution';

// What modules draw over every page (app.overlays — the robot assistant). Each loads after
// the page, never delaying it; `signedIn` ones only for a signed-in person, and only while
// their module is on (guests and the login page skip them).
export default function AssistantSlot() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const overlays = useContributions('app.overlays').filter((item) => (!item.signedIn || user) && (!item.module || settings?.modules?.[item.module]?.enabled));
  if (!overlays.length) return null;
  // Each in its own boundary and Suspense: one that fails to load hides alone.
  return overlays.map(({ id, Component }) => (
    <Contribution key={id} point="app.overlays" id={id}>
      <Component />
    </Contribution>
  ));
}
