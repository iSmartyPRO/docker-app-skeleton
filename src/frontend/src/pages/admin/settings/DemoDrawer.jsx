import { useState } from 'react';
import { App, Button, Drawer, Popconfirm, Tag } from 'antd';
import { DeleteOutlined, ExperimentOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import api from '../../../services/api';
import { moduleUi } from '../../../modules/manifest';
import { moduleName, pickText } from '../../../modules/platformUi';

/** Counts of one module's demo records: «Projects 1 · Tasks 8». */
export function DemoCounts({ counts = {} }) {
  const { t } = useLocale();
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  return (
    <div className="pf-demo__counts">
      {entries.map(([table, n]) => {
        const key = `platform.demo.tables.${table}`;
        const label = t(key);
        return (
          <span key={table} className="pf-demo__count">
            {label === key ? table : label} <b>{n}</b>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Demo data of one module (fill / remove with counts). `onChanged` reloads
 * the catalog. Used by the Modules page drawer and the «About the module» page.
 */
export function DemoModuleBlock({ module, onChanged }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(null);
  const demo = module.demo || {};
  const run = async (action) => {
    setBusy(action);
    try {
      const res = await api.post(`/admin/demo/${module.id}/${action}`);
      const result = res.data.result || {};
      if (action === 'seed') message.success(result.already ? t('platform.demo.already') : t('platform.demo.filled'));
      else {
        message.success(t('platform.demo.removed', { n: result.removed || 0 }));
        if (result.kept) message.warning(t('platform.demo.kept', { n: result.kept }));
      }
      await onChanged?.();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  if (!demo.available) return <p className="pf-muted">{t('platform.demo.notAvailable')}</p>;
  return (
    <div className="pf-demo__module">
      <div className="pf-demo__head">
        <span className="pf-demo__icon">
          <MenuIcon name={moduleUi(module.id)?.icon || 'apps'} />
        </span>
        <div className="pf-demo__name">
          <strong>{moduleName(module.id, t)}</strong>
          {demo.seeded ? <Tag bordered={false} color="gold">{t('platform.demo.records', { n: demo.total })}</Tag> : <Tag bordered={false}>{t('platform.demo.none')}</Tag>}
        </div>
      </div>
      {demo.describe && <p className="pf-demo__desc">{pickText(demo.describe, locale)}</p>}
      <DemoCounts counts={demo.counts} />
      <div className="pf-demo__actions">
        {!demo.seeded && demo.seedable !== false && (
          <Button type="primary" icon={<ExperimentOutlined />} loading={busy === 'seed'} disabled={!module.enabled} onClick={() => run('seed')}>
            {t('platform.demo.fill')}
          </Button>
        )}
        {demo.seeded && (
          <Popconfirm title={t('platform.demo.remove')} onConfirm={() => run('purge')} okText={t('platform.demo.remove')} cancelText={t('platform.deps.cancel')} okButtonProps={{ danger: true }}>
            <Button danger icon={<DeleteOutlined />} loading={busy === 'purge'}>
              {t('platform.demo.remove')}
            </Button>
          </Popconfirm>
        )}
        {!module.enabled && !demo.seeded && demo.seedable !== false && <span className="pf-muted">{t('platform.demo.needsOn')}</span>}
      </div>
    </div>
  );
}

/** The «Demo data» drawer: one module (`focus`) or every module with the portal-wide actions. */
export default function DemoDrawer({ open, focus, modules, users, onClose, onChanged }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const [busy, setBusy] = useState(null);
  const list = focus ? modules.filter((module) => module.id === focus) : modules.filter((module) => module.demo?.available || module.demo?.seeded);
  const any = modules.some((module) => module.demo?.seeded) || users > 0;

  const runAll = (action) =>
    modal.confirm({
      title: t(action === 'seed' ? 'platform.demo.fillAll' : 'platform.demo.removeAll'),
      content: t(action === 'seed' ? 'platform.demo.fillAllText' : 'platform.demo.removeAllText'),
      okText: t(action === 'seed' ? 'platform.demo.fillAll' : 'platform.demo.removeAll'),
      cancelText: t('platform.deps.cancel'),
      okButtonProps: action === 'seed' ? {} : { danger: true },
      onOk: async () => {
        setBusy(action);
        try {
          const res = await api.post(`/admin/demo/${action === 'seed' ? 'seed-all' : 'purge-all'}`);
          if (action === 'seed') message.success(t('platform.demo.filled'));
          else message.success(t('platform.demo.removed', { n: (res.data.results || []).reduce((sum, item) => sum + (item.removed || 0) + (item.users || 0), 0) }));
          await onChanged?.();
        } catch (err) {
          message.error(errorMessage(err));
        } finally {
          setBusy(null);
        }
      },
    });

  return (
    <Drawer open={open} onClose={onClose} title={t('platform.demo.title')} width={520} className="pf-demo" destroyOnHidden>
      <p className="pf-demo__lead">{t('platform.demo.lead')}</p>
      {!focus && (
        <div className="pf-demo__all">
          <Button type="primary" icon={<ThunderboltOutlined />} loading={busy === 'seed'} onClick={() => runAll('seed')}>
            {t('platform.demo.fillAll')}
          </Button>
          <Button danger icon={<DeleteOutlined />} loading={busy === 'purge'} disabled={!any} onClick={() => runAll('purge')}>
            {t('platform.demo.removeAll')}
          </Button>
          {users > 0 && <span className="pf-muted">{t('platform.demo.users', { n: users })}</span>}
        </div>
      )}
      <div className="pf-demo__list">
        {list.map((module) => (
          <DemoModuleBlock key={module.id} module={module} onChanged={onChanged} />
        ))}
      </div>
    </Drawer>
  );
}
