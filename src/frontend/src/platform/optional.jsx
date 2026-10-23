import { Suspense } from 'react';
import { moduleUi } from './extensions';

/*
 * Using another module's UI without importing it (an optional link, manifest
 * `enhances`). The module provides it from its register.js
 * (provideModule('files', { FilePicker: lazy(…) })); the consumer writes
 *
 *   const FilePicker = optionalComponent('files', 'FilePicker');   // renders nothing while Files is not installed
 *   const chatApi = optionalApi('chat', 'chatApi');                // calls reject while Chat is not installed
 *
 * and keeps checking settings.modules[id].enabled as before.
 */

export function optionalComponent(moduleId, name, { fallback = null } = {}) {
  function Optional(props) {
    const Component = moduleUi(moduleId)?.[name];
    if (!Component) return fallback;
    return (
      <Suspense fallback={fallback}>
        <Component {...props} />
      </Suspense>
    );
  }
  Optional.displayName = `Optional(${moduleId}.${name})`;
  return Optional;
}

export function optionalApi(moduleId, name) {
  return new Proxy(
    {},
    {
      get(_, method) {
        return (...args) => {
          const api = moduleUi(moduleId)?.[name];
          if (!api || typeof api[method] !== 'function') return Promise.reject(Object.assign(new Error(`The ${moduleId} module is not installed`), { code: 'MODULE_MISSING' }));
          return api[method](...args);
        };
      },
    }
  );
}
