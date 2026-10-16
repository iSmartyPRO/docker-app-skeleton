/** Guided tour of Procurement (texts: i18n/businessTours.js → tour.procurement.*). The payments step shows only to people who mark payments. */
export default {
  id: 'procurement',
  module: 'procurement',
  version: 1,
  route: '/app/procurement/requests',
  title: 'tour.procurement.title',
  steps: [
    { id: 'create', target: 'proc.create', placement: 'bottom', title: 'tour.procurement.create.title', text: 'tour.procurement.create.text' },
    { id: 'chips', target: 'proc.chips', placement: 'bottom', title: 'tour.procurement.chips.title', text: 'tour.procurement.chips.text' },
    { id: 'list', target: 'proc.list', placement: 'top', title: 'tour.procurement.list.title', text: 'tour.procurement.list.text' },
    { id: 'approval', target: 'proc.waiting', placement: 'right', title: 'tour.procurement.approval.title', text: 'tour.procurement.approval.text' },
    { id: 'inbox', target: 'proc.inbox', placement: 'right', title: 'tour.procurement.inbox.title', text: 'tour.procurement.inbox.text' },
    { id: 'payments', target: 'proc.payments', placement: 'right', title: 'tour.procurement.payments.title', text: 'tour.procurement.payments.text' },
    { id: 'summary', target: 'proc.summary', placement: 'right', title: 'tour.procurement.summary.title', text: 'tour.procurement.summary.text' },
  ],
};
