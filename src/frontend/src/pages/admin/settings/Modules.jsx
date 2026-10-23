import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, Input, Switch, Tag, Tooltip } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { BookOutlined, CloudServerOutlined, CloudUploadOutlined, ExperimentOutlined, ExportOutlined, PlayCircleOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import LoadState from '../../../components/ui/LoadState';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { useSettings } from '../../../context/SettingsContext';
import { matchesQuery } from '../../../lib/search';
import { CATEGORY_ICONS, hasAdminDocs, moduleUi, useModulesCatalog, useModuleTour } from '../../../modules/manifest';
import { linkName, moduleName, pickText, useModuleSwitch } from '../../../modules/platformUi';
import SettingsPageHeader from './SettingsPageHeader';
import DemoDrawer from './DemoDrawer';
import { InstallDialog, PackageActions, PackageTags, PackageWarnings, RemovedPackages, RestartOverlay, usePackages } from './ModulePackages';
import './platform.css';

const MAX_LINKS = 4;

function StatusTag({ module, t }) {
  if (module.core && !module.hideable) return <Tag bordered={false} color="blue">{t('platform.modules.statusCore')}</Tag>;
  if (!module.compatible) return <Tag bordered={false} color="red">{t('platform.modules.incompatible', { version: module.minCore })}</Tag>;
  if (module.missing?.length) {
    const list = module.missing.map((item) => `«${linkName(item, t)}»`).join(', ');
    return <Tag bordered={false} color={module.enabled ? 'red' : 'orange'}>{t('platform.modules.statusNeeds', { list })}</Tag>;
  }
  return module.enabled ? <Tag bordered={false} color="green">{t('platform.modules.statusOn')}</Tag> : <Tag bordered={false}>{t('platform.modules.statusOff')}</Tag>;
}

function LinkChips({ links, t, locale }) {
  if (!links.length) return null;
  const shown = links.slice(0, MAX_LINKS);
  const rest = links.slice(MAX_LINKS);
  const chip = (link) => {
    const name = linkName(link, t);
    const tip = t(link.active ? 'platform.modules.linkOn' : 'platform.modules.linkOff', { module: name, what: pickText(link.what, locale) });
    return (
      <Tooltip key={link.id || link.integration} title={tip}>
        <span className={`pf-chip${link.active ? ' is-active' : ''}`}>
          <i aria-hidden="true" />
          {name}
        </span>
      </Tooltip>
    );
  };
  return (
    <div className="pf-card__links">
      <span className="pf-card__label">{t('platform.modules.worksWith')}</span>
      {shown.map(chip)}
      {rest.length > 0 && (
        <Tooltip title={rest.map((link) => linkName(link, t)).join(', ')}>
          <span className="pf-chip is-more">+{rest.length}</span>
        </Tooltip>
      )}
    </div>
  );
}

function ModuleCard({ module, canEdit, canDemo, onToggle, onDemo, focused, coreVersion, pkg, canManagePackages, onUpdatePackage, onRestart }) {
  const { t, locale } = useLocale();
  const ui = moduleUi(module.id);
  const tour = useModuleTour(module.id);
  const [busy, setBusy] = useState(false);
  const requires = module.requires || [];
  const demoTotal = module.demo?.total || 0;
  const toggle = async (value) => {
    setBusy(true);
    try {
      await onToggle(module.id, value);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article id={`module-${module.id}`} className={`pf-card${module.enabled ? ' is-on' : ''}${focused ? ' is-focus' : ''}`}>
      <header className="pf-card__head">
        <span className="pf-card__icon">
          <MenuIcon name={ui?.icon || 'apps'} />
        </span>
        <div className="pf-card__title">
          <div className="pf-card__name">
            <strong>{moduleName(module.id, t)}</strong>
            <Tooltip title={t('platform.modules.versionTip', { version: module.version, core: coreVersion })}>
              <span className="pf-version">v{module.version}</span>
            </Tooltip>
          </div>
          <StatusTag module={module} t={t} />
          <PackageTags pkg={pkg} />
        </div>
        {(!module.core || module.hideable) && (
          <Switch
            checked={Boolean(module.enabled)}
            loading={busy}
            disabled={!canEdit}
            onChange={toggle}
            aria-label={`${moduleName(module.id, t)}: ${t('modules.enableLabel')}`}
          />
        )}
      </header>
      {ui?.descKey && <p className="pf-card__desc">{t(ui.descKey)}</p>}
      {requires.length > 0 && (
        <div className="pf-card__requires">
          <span className="pf-card__label">{t('platform.modules.requires')}</span>
          {requires.map((link) => (
            <Tooltip key={link.id || link.integration} title={pickText(link.reason, locale)}>
              <span className="pf-chip is-required">
                {linkName(link, t)}
                {link.id === 'approvals' && <em>{t('platform.modules.coreTag')}</em>}
              </span>
            </Tooltip>
          ))}
        </div>
      )}
      <LinkChips links={module.enhances || []} t={t} locale={locale} />
      <footer className="pf-card__actions">
        {hasAdminDocs(module.id) && (
          <Link to={`/admin/modules/${module.id}/docs`} className="pf-action">
            <BookOutlined /> {t('platform.modules.docs')}
          </Link>
        )}
        <Link to={`/admin/settings/${module.id}`} className="pf-action">
          <SettingOutlined /> {t('platform.modules.settings')}
        </Link>
        {canDemo && module.demo?.available && (
          <button type="button" className="pf-action" onClick={() => onDemo(module.id)}>
            <ExperimentOutlined /> {t('platform.modules.demo')}
            {demoTotal > 0 && <Badge count={demoTotal} size="small" className="pf-action__badge" />}
          </button>
        )}
        {tour.available && (
          <button type="button" className="pf-action" onClick={tour.start}>
            <PlayCircleOutlined /> {t('platform.modules.tour')}
          </button>
        )}
        <PackageActions module={module} pkg={pkg} canManage={canManagePackages} onUpdate={onUpdatePackage} onRestart={onRestart} name={moduleName(module.id, t)} />
        {module.enabled && ui?.path && (
          <Link to={ui.path} className="pf-action pf-action--end">
            {t('platform.modules.open')} <ExportOutlined />
          </Link>
        )}
      </footer>
    </article>
  );
}

/**
 * Settings → Modules (spec §1.3): the core services, then every module by
 * category with its version, status, requirements and links, switches that
 * respect requirements, and the docs / settings / demo data / tour buttons.
 */
export default function ModulesSettings() {
  const { t, locale } = useLocale();
  const { can } = useAuth();
  const { refresh: refreshPublic } = useSettings();
  const admin = useAdminSettings();
  const catalog = useModulesCatalog();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [demo, setDemo] = useState(params.get('demo') ? 'all' : null);
  const focus = params.get('focus');
  const canEdit = can('settings.modules');
  const canDemo = Boolean(catalog.data?.demo?.canManage);
  const { toggle } = useModuleSwitch(admin.save, { onChanged: catalog.reload });
  // Module packages (docs/module-packages.md): install from a file, update, remove.
  const packages = usePackages();
  const canManagePackages = Boolean(packages.data?.canManage);
  const [installOpen, setInstallOpen] = useState(false);
  const [installSource, setInstallSource] = useState('upload'); // upload | server («Пакеты на сервере»)
  const openInstall = (source) => {
    setInstallSource(source);
    setInstallOpen(true);
  };
  const [restartBoot, setRestartBoot] = useState(null);
  const onRestart = (bootId) => {
    setInstallOpen(false);
    setRestartBoot(bootId || packages.data?.bootId || 'unknown');
  };

  useEffect(() => {
    if (!focus || !catalog.data) return;
    document.getElementById(`module-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus, catalog.data]);

  const modules = useMemo(() => {
    const list = catalog.data?.modules || [];
    return list.filter((module) => {
      if (filter === 'on' && !module.enabled) return false;
      if (filter === 'off' && module.enabled) return false;
      if (!query) return true;
      const ui = moduleUi(module.id);
      const text = [moduleName(module.id, t), ui?.descKey ? t(ui.descKey) : '', module.id, t(`platform.categories.${module.category}`), pickText(module.name, 'en'), pickText(module.name, 'ru')].join(' ');
      return matchesQuery(text, query);
    });
  }, [catalog.data, filter, query, t]);

  const all = catalog.data?.modules || [];
  const onCount = all.filter((module) => module.enabled).length;
  const categories = (catalog.data?.categories || []).map((id) => ({ id, modules: modules.filter((module) => module.category === id) })).filter((group) => group.modules.length);

  const changed = async () => {
    await catalog.reload();
    await refreshPublic?.();
  };

  return (
    <>
      <SettingsPageHeader
        id="modules"
        extra={
          (canDemo || canManagePackages) && (
            <>
              {canManagePackages && (
                <Button icon={<CloudUploadOutlined />} onClick={() => openInstall('upload')}>
                  {t('packages.install')}
                </Button>
              )}
              {canManagePackages && (
                <Button icon={<CloudServerOutlined />} onClick={() => openInstall('server')}>
                  {t('packages.server.button')}
                </Button>
              )}
              {canDemo && (
                <Button icon={<ExperimentOutlined />} onClick={() => setDemo('all')}>
                  {t('platform.demo.menu')}
                </Button>
              )}
            </>
          )
        }
      />
      <LoadState ready={Boolean(catalog.data) || !catalog.loading} error={catalog.error} onRetry={catalog.reload}>
        {catalog.data && (
          <div className="pf-modules">
            <div className="pf-toolbar">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder={t('platform.modules.search')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pf-toolbar__search"
              />
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: `${t('platform.modules.all')} · ${all.length}` },
                  { value: 'on', label: `${t('platform.modules.on')} · ${onCount}` },
                  { value: 'off', label: `${t('platform.modules.off')} · ${all.length - onCount}` },
                ]}
              />
              <span className="pf-toolbar__summary">{t('platform.modules.summary', { on: onCount, total: all.length, core: catalog.data.coreVersion })}</span>
            </div>

            {!query && filter !== 'off' && (
              <section className="pf-group pf-group--core">
                <h3 className="pf-group__title">
                  <MenuIcon name="shield" />
                  {t('platform.categories.core')}
                  <span className="pf-group__lead">{t('platform.core.lead')}</span>
                </h3>
                <div className="pf-core">
                  {catalog.data.core.map((service) => (
                    <Link key={service.id} to={service.path} className="pf-core__item">
                      <MenuIcon name={service.icon} />
                      <span>{t(`platform.core.${service.id}`)}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {!query && <PackageWarnings packages={packages.data?.packages} coreVersion={packages.data?.coreVersion} />}
            {categories.map((group) => (
              <section key={group.id} className="pf-group">
                <h3 className="pf-group__title">
                  <MenuIcon name={CATEGORY_ICONS[group.id] || 'apps'} />
                  {t(`platform.categories.${group.id}`)}
                  <span className="pf-group__count">{group.modules.length}</span>
                </h3>
                <div className="pf-grid">
                  {group.modules.map((module) => (
                    <ModuleCard
                      key={module.id}
                      module={module}
                      canEdit={canEdit}
                      canDemo={canDemo}
                      onToggle={toggle}
                      onDemo={setDemo}
                      focused={focus === module.id}
                      coreVersion={catalog.data.coreVersion}
                      pkg={packages.byId.get(module.id)}
                      canManagePackages={canManagePackages}
                      onUpdatePackage={() => openInstall('upload')}
                      onRestart={onRestart}
                    />
                  ))}
                </div>
              </section>
            ))}
            {!categories.length && <p className="pf-empty">{t('platform.modules.empty')}</p>}
            {!query && <RemovedPackages packages={packages.data?.packages} canManage={canManagePackages} onChanged={packages.reload} />}
            <p className="section-footnote">{t('platform.modules.footnote')}</p>
          </div>
        )}
      </LoadState>
      {canManagePackages && <InstallDialog open={installOpen} source={installSource} onClose={() => setInstallOpen(false)} devMode={packages.data?.devMode} maxUploadMb={packages.data?.maxUploadMb} onRestart={onRestart} />}
      {restartBoot && <RestartOverlay bootId={restartBoot} />}
      {canDemo && (
        <DemoDrawer open={Boolean(demo)} focus={demo === 'all' ? null : demo} modules={all} users={catalog.data?.demo?.users || 0} onClose={() => setDemo(null)} onChanged={changed} locale={locale} />
      )}
    </>
  );
}
