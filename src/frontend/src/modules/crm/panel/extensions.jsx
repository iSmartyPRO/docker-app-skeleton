import { Suspense, lazy } from 'react';
import { useSettings } from '../../../context/SettingsContext';

/*
 * Extension point of the deal panel: blocks other modules show under the
 * deal's fields. Each entry is lazy, so a module adds nothing to the CRM
 * bundle, and appears only while that module is switched on.
 *
 *   { id, module: '<module id>', Component: lazy(() => import(...)) }  — gets { deal, onChanged }
 */
const DEAL_BLOCKS = [{ id: 'masterplan', module: 'masterplan', Component: lazy(() => import('../../masterplan/integrations/DealUnitsBlock')) }];

export default function DealExtensions({ deal, onChanged }) {
  const { settings } = useSettings();
  const blocks = DEAL_BLOCKS.filter((block) => settings?.modules?.[block.module]?.enabled);
  if (!deal || !blocks.length) return null;
  return (
    <Suspense fallback={null}>
      {blocks.map(({ id, Component }) => (
        <Component key={id} deal={deal} onChanged={onChanged} />
      ))}
    </Suspense>
  );
}
