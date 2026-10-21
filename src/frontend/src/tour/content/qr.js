export default {
  id: 'qr',
  module: 'qr',
  version: 1,
  route: '/app/qr',
  title: 'tour.qr.title',
  steps: [
    { id: 'intro', title: 'tour.qr.intro.title', text: 'tour.qr.intro.text' },
    { id: 'quick', target: 'qr.quick', placement: 'bottom', title: 'tour.qr.quick.title', text: 'tour.qr.quick.text' },
    { id: 'types', target: 'qr.types', route: '/app/qr/new', placement: 'bottom', title: 'tour.qr.types.title', text: 'tour.qr.types.text' },
    { id: 'templates', target: 'qr.templates', route: '/app/qr/new', placement: 'top', title: 'tour.qr.templates.title', text: 'tour.qr.templates.text' },
    { id: 'designer', target: 'qr.designer', route: '/app/qr/new', placement: 'top', title: 'tour.qr.designer.title', text: 'tour.qr.designer.text' },
    { id: 'preview', target: 'qr.preview', route: '/app/qr/new', placement: 'left', title: 'tour.qr.preview.title', text: 'tour.qr.preview.text' },
    // Templates: only for those who manage them.
    { id: 'manage', target: 'qr.templateList', route: '/app/qr/templates', when: ({ can }) => can('qr.admin'), placement: 'top', title: 'tour.qr.manage.title', text: 'tour.qr.manage.text' },
  ],
};
