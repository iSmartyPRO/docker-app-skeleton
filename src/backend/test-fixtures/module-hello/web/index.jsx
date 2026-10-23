/* Browser entry of the test module (contract: platform/packages/loader.js in the frontend). */
export default {
  id: 'hello',
  App: () => import('./HelloApp.jsx'),
};
