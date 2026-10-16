/** Guided tour of the Warehouse (texts: i18n/businessTours.js → tour.warehouse.*). Steps for rights a person lacks (create, inventory) are skipped. */
export default {
  id: 'warehouse',
  module: 'warehouse',
  version: 1,
  route: '/app/warehouse/stock',
  title: 'tour.warehouse.title',
  steps: [
    { id: 'chips', target: 'wh.chips', placement: 'bottom', title: 'tour.warehouse.chips.title', text: 'tour.warehouse.chips.text' },
    { id: 'toolbar', target: 'wh.toolbar', placement: 'bottom', title: 'tour.warehouse.toolbar.title', text: 'tour.warehouse.toolbar.text' },
    { id: 'create', target: 'wh.create', placement: 'right', title: 'tour.warehouse.create.title', text: 'tour.warehouse.create.text' },
    { id: 'documents', target: 'wh.nav.documents', placement: 'right', title: 'tour.warehouse.documents.title', text: 'tour.warehouse.documents.text' },
    { id: 'tools', target: 'wh.nav.tools', placement: 'right', title: 'tour.warehouse.tools.title', text: 'tour.warehouse.tools.text' },
    { id: 'inventory', target: 'wh.nav.inventory', placement: 'right', title: 'tour.warehouse.inventory.title', text: 'tour.warehouse.inventory.text' },
    { id: 'mobile', target: 'wh.nav.mobile', placement: 'right', title: 'tour.warehouse.mobile.title', text: 'tour.warehouse.mobile.text' },
  ],
};
