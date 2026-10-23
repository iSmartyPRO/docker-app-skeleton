import { Navigate, useParams } from 'react-router-dom';
import { MODULE_REGISTRY } from '../../modules/registry';

/**
 * Settings → <module> of an installed module package (/admin/settings/<id>):
 * its own Settings screen from web/index.js (platform/packages/loader.js).
 * Built-in modules keep their entries in admin/settingsPages.js.
 */
export default function PackageSettings() {
  const { moduleId } = useParams();
  const entry = MODULE_REGISTRY.find((module) => module.id === moduleId && module.package);
  if (!entry?.Settings) return <Navigate to="/admin/settings" replace />;
  const Settings = entry.Settings;
  return <Settings key={moduleId} itemId={moduleId} />;
}
