import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Collapse, Empty, Skeleton, Tag, Tooltip } from 'antd';
import { BookOutlined, ExperimentOutlined, ExportOutlined, PlayCircleOutlined, SettingOutlined } from '@ant-design/icons';
import PageHeader from '../../components/ui/PageHeader';
import LoadState from '../../components/ui/LoadState';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import Rich from '../../help/Rich';
import { loadHelp } from '../../help/registry';
import { hasUserHelp, loadAdminDocs, moduleUi, useModulesCatalog, useModuleTour } from '../../modules/manifest';
import { linkName, moduleName, pickText } from '../../modules/platformUi';
import DemoDrawer from './settings/DemoDrawer';
import './settings/platform.css';

function Section({ id, title, children }) {
  return (
    <section id={id} className="pf-doc__section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function LinkList({ links, t, locale, field, empty }) {
  if (!links?.length) return empty ? <p className="pf-muted">{empty}</p> : null;
  return (
    <ul className="pf-doc__links">
      {links.map((link) => {
        const key = link.id || link.integration;
        const name = linkName(link, t);
        return (
          <li key={key}>
            {link.id ? <Link to={`/admin/modules/${link.id}/docs`}>{name}</Link> : <Link to={`/admin/settings/${link.integration === 'activeDirectory' ? 'ad' : link.integration}`}>{name}</Link>}
            {'active' in link && <Tag bordered={false} color={link.active ? 'green' : 'default'}>{t(link.active ? 'platform.docs.linkActive' : 'platform.docs.linkInactive')}</Tag>}
            {link.id === 'approvals' && <Tag bordered={false} color="blue">{t('platform.docs.core')}</Tag>}
            <span className="pf-muted"> — {pickText(link[field], locale)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * «About the module» (spec §2): what it does and for whom, setup steps,
 * roles and permissions (from the catalog), dependencies and links (from the
 * manifest), scenarios, FAQ, changelog and the user guide.
 * Content: help/admin/<id>.js (help/ADMIN_SCHEMA.md) + help/content/<id>.js.
 */
export default function ModuleDocs() {
  const { id } = useParams();
  const { t, locale } = useLocale();
  const { can } = useAuth();
  const { refresh: refreshPublic } = useSettings();
  const catalog = useModulesCatalog();
  const [docs, setDocs] = useState(undefined);
  const [help, setHelp] = useState(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const tour = useModuleTour(id);
  const ui = moduleUi(id);
  const module = catalog.data?.modules?.find((entry) => entry.id === id) || null;

  useEffect(() => {
    let alive = true;
    setDocs(undefined);
    loadAdminDocs(id).then((content) => alive && setDocs(content));
    if (hasUserHelp(id)) loadHelp(id).then((content) => alive && setHelp(content));
    else setHelp(null);
    return () => {
      alive = false;
    };
  }, [id]);

  if (catalog.data && !module) {
    return (
      <div className="pf-doc">
        <PageHeader back={{ to: '/admin/settings/modules', label: t('platform.docs.back') }} title={t('platform.docs.title')} />
        <Empty description={t('platform.docs.notFound')} />
      </div>
    );
  }

  const tx = (value) => pickText(value, locale);
  const name = moduleName(id, t);
  const sections = [
    docs && ['purpose', t('platform.docs.purpose')],
    help?.highlights?.length && ['highlights', t('platform.docs.highlights')],
    docs?.setup?.length && ['setup', t('platform.docs.setup')],
    ['roles', t('platform.docs.roles')],
    ['dependencies', t('platform.docs.dependencies')],
    docs?.scenarios?.length && ['scenarios', t('platform.docs.scenarios')],
    docs?.faq?.length && ['faq', t('platform.docs.faq')],
    ['changelog', t('platform.docs.changelog')],
    help && ['help', t('platform.docs.userHelp')],
  ].filter(Boolean);

  return (
    <div className="pf-doc">
      <PageHeader
        back={{ to: `/admin/settings/modules?focus=${id}`, label: t('platform.docs.back') }}
        icon={<MenuIcon name={ui?.icon || 'apps'} />}
        title={`${name} · ${t('platform.docs.title')}`}
        description={ui?.descKey ? t(ui.descKey) : null}
        extra={
          <div className="pf-doc__actions">
            <Link to={`/admin/settings/${id}`}>
              <Button icon={<SettingOutlined />}>{t('platform.modules.settings')}</Button>
            </Link>
            {module?.demo?.available && catalog.data?.demo?.canManage && (
              <Button icon={<ExperimentOutlined />} onClick={() => setDemoOpen(true)}>
                {t('platform.modules.demo')}
              </Button>
            )}
            {tour.available && (
              <Button icon={<PlayCircleOutlined />} onClick={tour.start}>
                {t('platform.modules.tour')}
              </Button>
            )}
            {module?.enabled && ui?.path && (
              <Link to={ui.path}>
                <Button type="primary" icon={<ExportOutlined />}>
                  {t('platform.modules.open')}
                </Button>
              </Link>
            )}
          </div>
        }
      />
      <LoadState ready={Boolean(catalog.data) || !catalog.loading} error={catalog.error} onRetry={catalog.reload}>
        {module && (
          <>
            <div className="pf-doc__facts">
              <span>
                {t('platform.docs.category')}: <b>{t(`platform.categories.${module.category}`)}</b>
              </span>
              <Tooltip title={t('platform.modules.versionTip', { version: module.version, core: catalog.data.coreVersion })}>
                <span>
                  {t('platform.docs.version')}: <b>v{module.version}</b>
                </span>
              </Tooltip>
              <span>
                {t('platform.docs.minCore')}: <b>v{module.minCore}</b>
              </span>
              {module.core ? (
                <Tag bordered={false} color="blue">{t('platform.modules.statusCore')}</Tag>
              ) : (
                <Tag bordered={false} color={module.enabled ? 'green' : 'default'}>{t(module.enabled ? 'platform.modules.statusOn' : 'platform.modules.statusOff')}</Tag>
              )}
            </div>
            <div className="pf-doc__layout">
              <nav className="pf-doc__toc" aria-label={t('platform.docs.contents')}>
                <span className="pf-doc__toc-title">{t('platform.docs.contents')}</span>
                {sections.map(([anchor, title]) => (
                  <a key={anchor} href={`#${anchor}`} onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}>
                    {title}
                  </a>
                ))}
              </nav>
              <div className="pf-doc__main">
                {docs === undefined && <Skeleton active paragraph={{ rows: 6 }} />}
                {docs === null && <p className="pf-muted">{t('platform.docs.notWritten')}</p>}
                {docs && (
                  <Section id="purpose" title={t('platform.docs.purpose')}>
                    <Rich text={tx(docs.purpose)} />
                    {docs.audience && (
                      <div className="pf-doc__callout">
                        <strong>{t('platform.docs.audience')}</strong>
                        <Rich text={tx(docs.audience)} />
                      </div>
                    )}
                  </Section>
                )}
                {help?.highlights?.length > 0 && (
                  <Section id="highlights" title={t('platform.docs.highlights')}>
                    <div className="pf-doc__highlights">
                      {help.highlights.map((item, index) => (
                        <div key={index} className="pf-doc__highlight">
                          <span aria-hidden="true">{item.icon}</span>
                          <div>
                            <strong>{tx(item.title)}</strong>
                            <p>{tx(item.text)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
                {docs?.setup?.length > 0 && (
                  <Section id="setup" title={t('platform.docs.setup')}>
                    <ol className="pf-doc__steps">
                      {docs.setup.map((step, index) => (
                        <li key={index}>
                          <strong>{tx(step.title)}</strong>
                          <Rich text={tx(step.text)} />
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}
                <Section id="roles" title={t('platform.docs.roles')}>
                  {module.permissions.length ? (
                    <>
                      <p className="pf-muted">{t('platform.docs.rolesLead')}</p>
                      <div className="pf-doc__perms">
                        {module.permissions.map((perm) => {
                          const base = `permissions.${perm.replace(/\./g, '_')}`;
                          const title = t(`${base}.title`);
                          const desc = t(`${base}.desc`);
                          const note = docs?.roles?.[perm];
                          return (
                            <div key={perm} className="pf-doc__perm">
                              <div>
                                <strong>{title === `${base}.title` ? perm : title}</strong>
                                <code>{perm}</code>
                              </div>
                              {desc !== `${base}.desc` && <p>{desc}</p>}
                              {note && <p className="pf-doc__note">{tx(note)}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="pf-muted">{t('platform.docs.noPermissions')}</p>
                  )}
                  {docs?.access && (
                    <div className="pf-doc__callout">
                      <strong>{t('platform.docs.access')}</strong>
                      <Rich text={tx(docs.access)} />
                    </div>
                  )}
                  {can('users.view') && (
                    <p>
                      <Link to="/admin/roles">{t('nav.roles')} →</Link>
                    </p>
                  )}
                </Section>
                <Section id="dependencies" title={t('platform.docs.dependencies')}>
                  {!module.requires.length && !module.enhances.length && !module.enhancedBy.length && <p className="pf-muted">{t('platform.docs.noDependencies')}</p>}
                  {module.requires.length > 0 && (
                    <>
                      <h3>{t('platform.docs.requires')}</h3>
                      <LinkList links={module.requires} t={t} locale={locale} field="reason" />
                    </>
                  )}
                  {module.enhances.length > 0 && (
                    <>
                      <h3>{t('platform.docs.enhances')}</h3>
                      <LinkList links={module.enhances} t={t} locale={locale} field="what" />
                    </>
                  )}
                  {module.enhancedBy.length > 0 && (
                    <>
                      <h3>{t('platform.docs.enhancedBy')}</h3>
                      <LinkList links={module.enhancedBy} t={t} locale={locale} field="what" />
                    </>
                  )}
                </Section>
                {docs?.scenarios?.length > 0 && (
                  <Section id="scenarios" title={t('platform.docs.scenarios')}>
                    <div className="pf-doc__cases">
                      {docs.scenarios.map((item, index) => (
                        <div key={index} className="pf-doc__case">
                          <strong>{tx(item.title)}</strong>
                          <Rich text={tx(item.text)} />
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
                {docs?.faq?.length > 0 && (
                  <Section id="faq" title={t('platform.docs.faq')}>
                    <Collapse
                      bordered={false}
                      className="pf-doc__faq"
                      items={docs.faq.map((item, index) => ({ key: String(index), label: tx(item.q), children: <Rich text={tx(item.a)} /> }))}
                    />
                  </Section>
                )}
                <Section id="changelog" title={t('platform.docs.changelog')}>
                  <ul className="pf-doc__changelog">
                    {module.changelog.map((entry) => (
                      <li key={entry.version}>
                        <span className="pf-version">v{entry.version}</span>
                        <span className="pf-muted">{entry.date}</span>
                        <ul>
                          {(entry.changes?.[locale] || entry.changes?.en || []).map((line, index) => (
                            <li key={index}>{line}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </Section>
                {help && (
                  <Section id="help" title={t('platform.docs.userHelp')}>
                    <p className="pf-muted">{t('platform.docs.userHelpLead')}</p>
                    <ul className="pf-doc__help">
                      {(help.sections || []).slice(0, 12).map((section) => (
                        <li key={section.id}>
                          <Link to={`/help/${id}#${section.id}`}>{tx(section.title)}</Link>
                        </li>
                      ))}
                    </ul>
                    <Link to={`/help/${id}`}>
                      <Button icon={<BookOutlined />}>{t('platform.docs.openHelp')}</Button>
                    </Link>
                  </Section>
                )}
              </div>
            </div>
          </>
        )}
      </LoadState>
      {module && catalog.data?.demo?.canManage && (
        <DemoDrawer
          open={demoOpen}
          focus={id}
          modules={catalog.data.modules}
          users={catalog.data.demo.users}
          onClose={() => setDemoOpen(false)}
          onChanged={async () => {
            await catalog.reload();
            await refreshPublic?.();
          }}
        />
      )}
    </div>
  );
}
