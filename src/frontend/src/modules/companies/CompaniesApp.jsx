import { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Button, Drawer, Result, Spin } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { CompaniesProvider, useCompanies } from './CompaniesContext';
import { CompanyList, PeopleList } from './pages/Lists';
import CompanyCard from './pages/CompanyCard';
import PersonCard from './pages/PersonCard';
import '../shared/module.css';
import '../kb/kb.css';
import './companies.css';
import SideRail from '../shared/SideRail';

function Sidebar({ onNavigate }) {
  const { t } = useLocale();
  const { meta } = useCompanies();
  const link = (to, icon, label, end, tour) => (
    <NavLink to={to} end={end} className="mod-nav__link" onClick={onNavigate} data-tour={tour}>
      <MenuIcon name={icon} variant="mono" />
      <span className="mod-nav__text">{label}</span>
    </NavLink>
  );
  return (
    <div className="mod-side">
      <NavLink to="/app/companies" end className="mod-side__brand" onClick={onNavigate}>
        <MenuIcon name="building" />
        <span>{t('apps.companies.name')}</span>
      </NavLink>
      <nav className="mod-nav">
        {link('/app/companies', 'building', t('companies.companies'), true, 'cmp.nav.companies')}
        {link('/app/companies/people', 'people', t('companies.people'), false, 'cmp.nav.people')}
        {link('/app/companies/mine', 'star', t('companies.myCompanies'), false, 'cmp.nav.mine')}
      </nav>
      <nav className="mod-nav fs-side__bottom">
        {link('/app/companies/archive', 'archive', t('companies.archive'), false, 'cmp.nav.archive')}
        {link('/app/companies/people-archive', 'archive', t('companies.peopleArchive'))}
        {meta?.isAdmin && (
          <NavLink to="/admin/settings/companies" className="mod-nav__link" onClick={onNavigate} data-tour="cmp.nav.settings">
            <MenuIcon name="general" variant="mono" />
            <span className="mod-nav__text">{t('companies.settings')}</span>
          </NavLink>
        )}
      </nav>
    </div>
  );
}

function Shell() {
  const { t } = useLocale();
  const { meta, error } = useCompanies();
  const [drawer, setDrawer] = useState(false);
  if (error) return <Result status="warning" title={errorMessage(error)} />;
  if (!meta) return <div className="boot-screen"><Spin size="large" /></div>;
  return (
    <div className="mod-shell">
      <SideRail moduleKey="companies"><Sidebar /></SideRail>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={290} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<MenuOutlined />}>{t('apps.companies.name')}</Button>
        <PageTransition>
          <Routes>
            <Route index element={<CompanyList />} />
            <Route path="mine" element={<CompanyList scope="mine" />} />
            <Route path="archive" element={<CompanyList scope="archive" />} />
            <Route path="people" element={<PeopleList />} />
            <Route path="people-archive" element={<PeopleList scope="archive" />} />
            <Route path="c/:id" element={<CompanyCard />} />
            <Route path="p/:id" element={<PersonCard />} />
            <Route path="*" element={<Navigate to="/app/companies" replace />} />
          </Routes>
        </PageTransition>
      </main>
    </div>
  );
}

/** Counterparties: /app/companies, /people, /mine, /archive, /c/:id, /p/:id. */
export default function CompaniesApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <CompaniesProvider>
        <Shell />
      </CompaniesProvider>
    </div>
  );
}
