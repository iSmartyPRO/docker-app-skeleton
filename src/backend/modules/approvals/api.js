/*
 * Public API of the approvals service for other modules (docs/approvals.md#module-api).
 * Import from here only; everything else in this folder is internal.
 *
 *   import { registerApprovalType, startApproval, getProcess } from '../approvals/api.js';
 */

export { registerApprovalType, getApprovalType, listApprovalTypes } from './registry.js';
export {
  startApproval,
  withdraw,
  restart,
  decide,
  answer,
  getProcess,
  refreshApproval,
  isParticipant,
  routeFor,
  participantDocIds,
  waitingDocIds,
} from './engine.js';
export { registerInboxProvider, inboxFor } from '../../services/inbox.js';
