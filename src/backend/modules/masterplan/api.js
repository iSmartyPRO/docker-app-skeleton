/*
 * Public API of Masterplan for other modules (docs/masterplan.md). Masterplan
 * is an optional link for them (manifest `enhances`), so they reach it at run
 * time: `modules.loaded('masterplan')?.api` / `modules.get('masterplan')?.api`.
 * Contract sync is not here: Masterplan follows the contract.* events itself
 * (contractSync.js). Pickers of Procurement and Warehouse use the core
 * «objects» source Masterplan registers (links.js objectSource).
 */

export { contractUnit, unitPaymentPlans } from './contractSync.js';
export { projectFor, nodeFor, projectLinkOptions } from './links.js';
export { DEMO_CONTRACT_UNITS } from './demoData.js';
