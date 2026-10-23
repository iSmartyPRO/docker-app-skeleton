/* Settings fields shared by widget definitions (see modules/dashboard/catalog.js «Field types»). */

export const period = (values = [7, 30, 90], fallback = 30) => ({ key: 'period', type: 'segmented', default: fallback, options: values.map((value) => ({ value, labelKey: 'dashboard.fields.days', n: value })) });
export const limit = (fallback, min = 3, max = 20) => ({ key: 'limit', type: 'number', default: fallback, min, max });
export const scopeField = (values = ['mine', 'all']) => ({ key: 'scope', type: 'segmented', default: 'mine', options: values.map((value) => ({ value, labelKey: `dashboard.fields.scope.${value}` })) });
export const projectField = { key: 'project', type: 'select', from: 'projects', allowEmpty: 'dashboard.fields.allProjects' };
