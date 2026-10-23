import { Suspense } from 'react';
import { useSettings } from '../context/SettingsContext';
import { contribute, useContributions } from './extensions';

/*
 * «Связи» blocks of a card: other modules show what they link to a record
 * (Masterplan: the units of a CRM deal) without the card's module importing
 * them. The block appears only while its module is on; it loads with that
 * module's code.
 *
 *   registerLinkBlock('crm.deal', { id: 'masterplan', module: 'masterplan', Component: lazy(() => import('./integrations/DealUnitsBlock')) });
 *   <LinkBlocks host="crm.deal" deal={deal} onChanged={reload} />   // every block gets the card's props
 *
 * Hosts used today: crm.deal ({ deal, onChanged }).
 */

export function registerLinkBlock(host, definition) {
  if (!definition?.Component) throw new Error('registerLinkBlock needs a Component');
  return contribute(`links.${host}`, definition);
}

export function LinkBlocks({ host, ...props }) {
  const { settings } = useSettings();
  const blocks = useContributions(`links.${host}`).filter((block) => !block.module || settings?.modules?.[block.module]?.enabled);
  if (!blocks.length) return null;
  return (
    <Suspense fallback={null}>
      {blocks.map(({ id, Component }) => (
        <Component key={id} {...props} />
      ))}
    </Suspense>
  );
}
