import { useState } from 'react';
import { App, Modal } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { useSettings } from '../../../context/SettingsContext';
import { errorMessage } from '../../../lib/errors';
import { MODULE_REGISTRY, moduleLabel } from '../../registry';
import { MODULE_COLORS, resourcesApi } from '../api';
import ResourceIcon from './ResourceIcon';

/** Adds portal modules as tiles in one go: no addresses to type, names translate themselves. */
export default function AddModules({ open, items, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings } = useSettings();
  const [chosen, setChosen] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const added = new Set(items.filter((item) => item.kind === 'module').map((item) => item.module));
  const modules = MODULE_REGISTRY.filter((module) => module.id !== 'resources' && settings?.modules?.[module.id]?.enabled);

  const toggle = (id) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    try {
      for (const id of chosen) {
        const module = modules.find((entry) => entry.id === id);
        await resourcesApi.createItem({
          kind: 'module',
          module: id,
          title: '',
          visibility: 'signed',
          target: 'self',
          icon: { type: 'menu', name: module.icon, style: 'gradient', color: MODULE_COLORS[id] || '#6366F1' },
        });
      }
      message.success(t('resources.modulesAdded', { n: chosen.size }));
      setChosen(new Set());
      onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('resources.addModulesTitle')}
      onCancel={() => onClose(false)}
      onOk={submit}
      okText={chosen.size ? t('resources.addN', { n: chosen.size }) : t('resources.add')}
      okButtonProps={{ disabled: !chosen.size }}
      cancelText={t('common.cancel')}
      confirmLoading={busy}
      width={720}
      destroyOnHidden
    >
      <p className="rs-manage__hint">{t('resources.addModulesLead')}</p>
      <div className="rs-modules">
        {modules.map((module) => {
          const isAdded = added.has(module.id);
          return (
            <button
              key={module.id}
              type="button"
              disabled={isAdded}
              className={`rs-module${chosen.has(module.id) ? ' is-chosen' : ''}${isAdded ? ' is-added' : ''}`}
              onClick={() => toggle(module.id)}
            >
              <ResourceIcon icon={{ type: 'menu', name: module.icon, style: 'gradient', color: MODULE_COLORS[module.id] || '#6366F1' }} size={40} />
              <span>
                <strong>{moduleLabel(module, settings, t)}</strong>
                <em>{isAdded ? t('resources.alreadyAdded') : t(module.descKey)}</em>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
