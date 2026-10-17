import { useCallback } from 'react';
import { App } from 'antd';
import { useLocale } from '../context/LocaleContext';
import { errorMessage } from '../lib/errors';
import { pick } from '../i18n/languages';

/** { ru, en } → the text in the UI language (strings pass through). */
export const pickText = (value, locale) => pick(value, locale);

/** A module's display name (i18n apps.<id>.name, else the id). */
export function moduleName(id, t) {
  const key = `apps.${id}.name`;
  const label = t(key);
  return label === key ? id : label;
}

/** Name of a requires / enhances entry: a module or an integration. */
export function linkName(link, t) {
  return link.integration ? t(`platform.integrations.${link.integration}`) : moduleName(link.id, t);
}

const quoteList = (names) => names.map((name) => `«${name}»`).join(', ');

/**
 * Switching a module on or off with its requirements (spec §1.3). The server
 * decides (PUT /admin/settings → 409 MODULE_REQUIRES / MODULE_REQUIRED_BY);
 * this hook turns its answer into the dialogs:
 *   «Для X нужны Y — включить вместе?», «Нельзя выключить X: от него зависят …».
 * `save` is useAdminSettings().save. toggle() resolves to true when saved.
 */
export function useModuleSwitch(save, { onChanged } = {}) {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();

  const toggle = useCallback(
    async (id, enabled) => {
      const name = moduleName(id, t);
      const done = (extra = []) => {
        message.success(enabled ? t('modules.enabled') : t('modules.disabled'));
        if (extra.length) message.info(t('platform.deps.alsoEnabled', { list: quoteList(extra.map((item) => moduleName(item, t))) }));
        onChanged?.();
        return true;
      };
      try {
        await save({ modules: { [id]: { enabled } } });
        return done();
      } catch (err) {
        const data = err?.response?.data;
        const info = data?.info || {};
        if (data?.code === 'MODULE_REQUIRES' && info.canAlsoEnable) {
          const ids = info.missing.map((item) => item.id);
          return new Promise((resolve) => {
            modal.confirm({
              title: t('platform.deps.needsTitle', { module: name, list: quoteList(ids.map((item) => moduleName(item, t))) }),
              content: (
                <div className="pf-dialog">
                  <ul>
                    {info.missing.map((item) => (
                      <li key={item.id}>
                        <strong>{moduleName(item.id, t)}</strong> — {pickText(item.reason, locale)}
                      </li>
                    ))}
                  </ul>
                  <p>{t('platform.deps.needsText')}</p>
                </div>
              ),
              okText: t('platform.deps.enableTogether'),
              cancelText: t('platform.deps.cancel'),
              onOk: async () => {
                try {
                  await save({ modules: { [id]: { enabled: true, alsoEnable: true } } });
                  resolve(done(ids));
                } catch (inner) {
                  message.error(errorMessage(inner));
                  resolve(false);
                }
              },
              onCancel: () => resolve(false),
            });
          });
        }
        if (data?.code === 'MODULE_REQUIRES') {
          modal.warning({
            title: t('platform.deps.integrationTitle', { module: name }),
            content: (
              <div className="pf-dialog">
                <p>{t('platform.deps.integrationText', { list: quoteList((info.missing || []).map((item) => (item.integration ? t(`platform.integrations.${item.integration}`) : moduleName(item.id, t)))) })}</p>
                <ul>
                  {(info.missing || []).map((item) => (
                    <li key={item.integration || item.id}>{pickText(item.reason, locale)}</li>
                  ))}
                </ul>
              </div>
            ),
            okText: t('platform.deps.ok'),
          });
          return false;
        }
        if (data?.code === 'MODULE_REQUIRED_BY') {
          modal.warning({
            title: t('platform.deps.cannotDisableTitle', { module: name }),
            content: (
              <div className="pf-dialog">
                <p>{t('platform.deps.cannotDisableText')}</p>
                <ul>
                  {(info.dependents || []).map((item) => (
                    <li key={item.id}>
                      <strong>{moduleName(item.id, t)}</strong> — {pickText(item.reason, locale)}
                    </li>
                  ))}
                </ul>
              </div>
            ),
            okText: t('platform.deps.ok'),
          });
          return false;
        }
        message.error(errorMessage(err));
        return false;
      }
    },
    [save, t, locale, message, modal, onChanged]
  );

  return { toggle };
}
