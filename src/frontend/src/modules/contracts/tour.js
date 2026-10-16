/** Guided tour of Contracts (texts: i18n/businessTours.js → tour.contracts.*). The payments step shows only to finance and to those who see every contract. */
export default {
  id: 'contracts',
  module: 'contracts',
  version: 1,
  route: '/app/contracts',
  title: 'tour.contracts.title',
  steps: [
    { id: 'intro', title: 'tour.contracts.intro.title', text: 'tour.contracts.intro.text' },
    { id: 'create', target: 'ctr.create', placement: 'bottom', title: 'tour.contracts.create.title', text: 'tour.contracts.create.text' },
    { id: 'chips', target: 'ctr.chips', placement: 'bottom', title: 'tour.contracts.chips.title', text: 'tour.contracts.chips.text' },
    { id: 'card', target: 'ctr.list', placement: 'top', title: 'tour.contracts.card.title', text: 'tour.contracts.card.text' },
    { id: 'waiting', target: 'ctr.nav.waiting', placement: 'right', title: 'tour.contracts.waiting.title', text: 'tour.contracts.waiting.text' },
    { id: 'calendar', target: 'ctr.nav.calendar', placement: 'right', title: 'tour.contracts.calendar.title', text: 'tour.contracts.calendar.text' },
    { id: 'payments', target: 'ctr.nav.payments', placement: 'right', title: 'tour.contracts.payments.title', text: 'tour.contracts.payments.text' },
  ],
};
