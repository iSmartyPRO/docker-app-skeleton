import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Result, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import ModuleHeader from '../../shared/ModuleHeader';
import OrgChart from '../../org/OrgChart';
import { orgApi } from '../../org/api';
import { empError } from '../lib';

/** «Оргсхема» (spec §4.2): units with their heads and headcount; a click opens the unit's people. */
export default function OrgChartPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [state, setState] = useState({ tree: null, meta: null, error: null });
  useEffect(() => {
    Promise.all([orgApi.chart(), orgApi.meta()])
      .then(([chart, meta]) => setState({ tree: chart.data.tree, meta: meta.data, error: null }))
      .catch((error) => setState({ tree: [], meta: null, error }));
  }, []);
  return (
    <div className="emp-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.employees.name'), to: '/app/employees' }, { key: 'chart', label: t('emp.nav.chart') }]}
        icon={<MenuIcon name="layers" />}
        title={t('emp.nav.chart')}
        description={t('emp.chart.lead')}
      />
      {state.error ? (
        <Result status="warning" title={empError(state.error, t)} />
      ) : !state.tree ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <section className="emp-panel">
          <OrgChart
            tree={state.tree}
            meta={state.meta}
            onSelect={(unit) => navigate(`/app/employees?unit=${unit.id}`)}
            countLabel={(node) => t('emp.chart.people', { own: node.counts?.employees ?? 0, total: node.total ?? 0 })}
          />
        </section>
      )}
    </div>
  );
}
