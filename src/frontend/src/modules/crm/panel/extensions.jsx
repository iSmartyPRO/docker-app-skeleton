import { LinkBlocks } from '../../../platform/links';

/*
 * Extension point of the deal panel: blocks other modules show under the
 * deal's fields («Связи», platform/links.jsx — host 'crm.deal'). Each block is
 * lazy, so a module adds nothing to the CRM bundle, and appears only while
 * that module is switched on. Masterplan registers its units block there.
 *
 *   registerLinkBlock('crm.deal', { id, module: '<module id>', Component: lazy(() => import(...)) })  — gets { deal, onChanged }
 */
export default function DealExtensions({ deal, onChanged }) {
  if (!deal) return null;
  return <LinkBlocks host="crm.deal" deal={deal} onChanged={onChanged} />;
}
