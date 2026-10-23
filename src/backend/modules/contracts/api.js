import { canView, contractsContext, contractsSettings } from './access.js';
import { contractUrl, loadRow } from './service.js';
export { linkedObjectStates, recordSyncNotes } from './objectSync.js';

/*
 * Public surface of Contracts for other modules (docs/contracts.md). Others
 * reach it at run time only (Contracts is an optional link for them):
 *   - «Связи» provider 'contracts.contract' (a purchase request points at a contract);
 *   - events contract.deposit_received / contract.signed / contract.paid (objectSync.js);
 *   - linkedObjectStates() / recordSyncNotes(): for a follower that catches up on the events it missed
 *     (Masterplan installed after contracts changed — docs/masterplan.md «Catching up with Contracts»).
 */

/** «Связи» provider of contracts, with the Contracts visibility rules. */
export const contractLinkProvider = {
  kind: 'contracts.contract',
  area: 'contracts',
  async resolve(req, id) {
    const row = await loadRow(id).catch(() => null);
    if (!row || !(await canView(contractsContext(req, await contractsSettings()), row))) return null;
    return { id: row.id, label: [row.number, row.title].filter(Boolean).join(' · '), url: contractUrl(row.id) };
  },
};
