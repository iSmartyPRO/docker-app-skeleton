/*
 * Public UI of Approvals — a core service: other modules import this file and
 * the components in public/ (and nothing else of the folder). Side-effect free;
 * the card components, which bring approvals.css, are separate files:
 *   public/ApprovalPath.jsx    the approval path of a document (default) + useApprovalProcess
 *   public/ApprovalActions.jsx decision buttons (default) + UrgencyPicker
 */
export { UrgencyTag } from './components/bits';
export { formatMoney, shortDuration, tOr, urgencyLevels, urgencyName, useApprovalsMeta } from './lib';
export { inboxChanged } from './api';
