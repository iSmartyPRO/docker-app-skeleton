import { createElement } from 'react';
import { Button } from 'antd';

/**
 * "This event or the whole series?" for recurring events.
 * Resolves 'single' | 'all', or null when dismissed.
 */
export function askScope(modal, t, action = 'edit') {
  return new Promise((resolve) => {
    let settled = false;
    let instance;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      instance?.destroy();
    };
    instance = modal.confirm({
      title: t(action === 'delete' ? 'calendar.scope.deleteTitle' : 'calendar.scope.editTitle'),
      content: t('calendar.scope.text'),
      closable: true,
      maskClosable: true,
      onCancel: () => done(null),
      afterClose: () => done(null),
      footer: createElement(
        'div',
        { className: 'scope-buttons' },
        createElement(Button, { key: 'cancel', onClick: () => done(null) }, t('common.cancel')),
        createElement(Button, { key: 'single', onClick: () => done('single') }, t('calendar.scope.single')),
        createElement(Button, { key: 'all', type: 'primary', danger: action === 'delete', onClick: () => done('all') }, t('calendar.scope.all'))
      ),
    });
  });
}
