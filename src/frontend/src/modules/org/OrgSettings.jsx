import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import LoadState from '../../components/ui/LoadState';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import TourButton from '../../tour/TourButton';
import { orgApi } from './api';
import OrgChart from './OrgChart';
import OrgStructure from './OrgStructure';
import TypesEditor from './TypesEditor';
import './org.css';

/**
 * Settings → Org structure (/admin/settings/org): the tree editor with drag
 * and drop, the org chart, and the unit types and purposes. Everyone signed
 * in reads the structure through the API; changes need `org.manage`.
 */
export default function OrgSettings() {
  const { t } = useLocale();
  const [params, setParams] = useSearchParams();
  const tab = ['structure', 'chart', 'types'].includes(params.get('tab')) ? params.get('tab') : 'structure';
  const [state, setState] = useState({ ready: false, error: null, units: [], meta: null, tree: [] });
  const [chartUnit, setChartUnit] = useState(null);

  const load = useCallback(async () => {
    try {
      const [units, meta, chart] = await Promise.all([orgApi.units(), orgApi.meta(), orgApi.chart()]);
      setState({ ready: true, error: null, units: units.data.units, meta: meta.data, tree: chart.data.tree });
    } catch (error) {
      setState((prev) => ({ ...prev, ready: true, error }));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const canManage = Boolean(state.meta?.canManage);
  return (
    <>
      <SettingsPageHeader id="org" extra={<TourButton module="org" />} />
      <LoadState ready={state.ready} error={state.error} onRetry={load}>
        <Tabs
          className="org-tabs"
          activeKey={tab}
          onChange={(key) => setParams(key === 'structure' ? {} : { tab: key }, { replace: true })}
          items={[
            {
              key: 'structure',
              label: <span data-tour="org.tab.structure">{t('org.tabs.structure')}</span>,
              children: <OrgStructure meta={state.meta} units={state.units} reload={load} canManage={canManage} />,
            },
            {
              key: 'chart',
              label: <span data-tour="org.tab.chart">{t('org.tabs.chart')}</span>,
              children: (
                <section className="org-panel">
                  <OrgChart tree={state.tree} meta={state.meta} selectedId={chartUnit} onSelect={(unit) => setChartUnit(unit.id)} />
                </section>
              ),
            },
            {
              key: 'types',
              label: <span data-tour="org.tab.types">{t('org.tabs.types')}</span>,
              children: <TypesEditor meta={state.meta} units={state.units} canManage={canManage} onSaved={load} />,
            },
          ]}
        />
      </LoadState>
    </>
  );
}
