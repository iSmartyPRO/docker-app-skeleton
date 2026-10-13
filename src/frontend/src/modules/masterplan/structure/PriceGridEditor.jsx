import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Input, InputNumber, Popconfirm, Select, Skeleton, Tag } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDate, fmtDateTime, todayISO } from '../../../lib/datetime';
import { DateField } from '../../../components/ui/DateTimeField';
import { mpApi } from '../api';
import { useMp, useProject } from '../MpContext';
import { formatMoney, formatPercent, nodeLabel } from '../lib';
import PaymentOptions from '../components/PaymentOptions';
import '../mp-pricing.css';

const MODES = ['base', 'ppm', 'markup'];
/** A first version's plans, named in the person's language (the names are saved as typed and can be changed). */
const defaultPlans = (t) => [
  { name: '100%', mode: 'base', firstPct: 100, months: 0 },
  { name: t('mp.grid.defaultPlan', { pct: 50 }), mode: 'ppm', ppm: null, firstPct: 50, months: 12 },
  { name: t('mp.grid.defaultPlan', { pct: 30 }), mode: 'ppm', ppm: null, firstPct: 30, months: 24 },
];

/** Which version of each grid (project-wide or a type's) is in force today. */
function activeIds(grids, today) {
  const out = new Set();
  const keys = new Set(grids.map((g) => g.typeId || 0));
  for (const key of keys) {
    const best = grids.filter((g) => (g.typeId || 0) === key && g.effectiveFrom <= today).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : b.id - a.id))[0];
    if (best) out.add(best.id);
  }
  return out;
}

/**
 * Prices by payment form (Структура → Цены): versions of the project's grid
 * (and of a type's own grid), each from a date. A new version never changes
 * the old ones — they stay as the history of prices. The unit's own price is
 * the 100 % price ("base"); the other plans are priced per m² or as a markup.
 */
export default function PriceGridEditor() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { types } = useMp();
  const { project, units, reload } = useProject();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await mpApi.priceGrids(project.id);
      setData(res.data);
    } catch (err) {
      message.error(errorMessage(err));
      setData({ grids: [], today: todayISO() });
    }
  }, [project.id, message]);
  useEffect(() => {
    load();
  }, [load]);

  const usedTypes = useMemo(() => {
    const ids = new Set(units.map((node) => node.type?.id).filter(Boolean));
    return types.filter((type) => type.sellable && ids.has(type.id));
  }, [units, types]);
  const active = useMemo(() => activeIds(data?.grids || [], data?.today || todayISO()), [data]);

  const startDraft = () => {
    const current = (data?.grids || []).find((g) => !g.typeId && active.has(g.id));
    setDraft({
      typeId: null,
      effectiveFrom: todayISO(),
      plannedPpm: current?.plannedPpm ?? null,
      note: '',
      plans: (current?.plans || defaultPlans(t)).map((plan) => ({ ...plan })),
    });
  };
  const setPlan = (index, patch) => setDraft((prev) => ({ ...prev, plans: prev.plans.map((plan, i) => (i === index ? { ...plan, ...patch } : plan)) }));
  const save = async () => {
    setBusy(true);
    try {
      await mpApi.createPriceGrid(project.id, draft);
      message.success(t('mp.grid.saved'));
      setDraft(null);
      await load();
      reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (grid) => {
    try {
      await mpApi.deletePriceGrid(grid.id);
      await load();
      reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  // A sample unit of the draft's type (or any) to preview the variants.
  const sample = useMemo(() => {
    if (!draft) return null;
    const list = units.filter((node) => node.unit?.price && (node.unit.areaTotal || node.unit.areaPlot));
    return list.find((node) => !draft.typeId || node.type?.id === draft.typeId) || null;
  }, [draft, units]);
  const previewProject = draft && sample ? { pricing: { grids: [{ ...draft, typeId: null, currency: project.currency, plans: draft.plans.map((plan, i) => ({ ...plan, key: `p${i}`, months: plan.firstPct >= 100 ? 0 : plan.months })) }] } } : null;

  if (!data) return <Skeleton active paragraph={{ rows: 6 }} />;
  const priceOf = (plan, currency) => (plan.mode === 'base' ? t('mp.grid.basePrice') : plan.mode === 'ppm' ? t('mp.measure.perSqm', { price: formatMoney(plan.ppm, currency, locale) }) : `${plan.markupPct > 0 ? '+' : ''}${formatPercent(plan.markupPct, locale)}`);
  const today = data.today;
  return (
    <div className="mp-grids">
      <p className="dialog-lead">{t('mp.grid.lead')}</p>
      {!draft && (
        <div>
          <Button type="primary" onClick={startDraft}>＋ {t('mp.grid.newVersion')}</Button>
        </div>
      )}
      {draft && (
        <section className="mp-grid-version is-active" aria-label={t('mp.grid.newVersion')}>
          <header>
            <b>{t('mp.grid.newVersion')}</b>
          </header>
          <div className="form-grid-2">
            <label className="mp-ffield">
              <span>{t('mp.grid.scope')}</span>
              <Select value={draft.typeId || 0} onChange={(value) => setDraft({ ...draft, typeId: value || null })} options={[{ value: 0, label: t('mp.grid.wholeProject') }, ...usedTypes.map((type) => ({ value: type.id, label: type.name }))]} />
            </label>
            <label className="mp-ffield">
              <span>{t('mp.grid.from')}</span>
              <DateField value={draft.effectiveFrom} onChange={(value) => setDraft({ ...draft, effectiveFrom: value })} style={{ width: '100%' }} />
            </label>
          </div>
          <div className="mp-grid-plans">
            <div className="mp-grid-plan is-head">
              <span>{t('mp.grid.planName')}</span>
              <span>{t('mp.grid.mode')}</span>
              <span>{t('mp.grid.price')}</span>
              <span>{t('mp.grid.firstPct')}</span>
              <span>{t('mp.grid.months')}</span>
              <span />
            </div>
            {draft.plans.map((plan, index) => (
              <div key={index} className="mp-grid-plan">
                <Input value={plan.name} onChange={(event) => setPlan(index, { name: event.target.value })} maxLength={60} aria-label={t('mp.grid.planName')} />
                <Select value={plan.mode} onChange={(mode) => setPlan(index, { mode })} options={MODES.map((mode) => ({ value: mode, label: t(`mp.grid.modes.${mode}`) }))} aria-label={t('mp.grid.mode')} />
                {plan.mode === 'ppm' ? (
                  <InputNumber value={plan.ppm} onChange={(ppm) => setPlan(index, { ppm })} min={0} style={{ width: '100%' }} addonAfter={t('mp.measure.perSqmShort', { price: project.currency })} aria-label={t('mp.grid.price')} />
                ) : plan.mode === 'markup' ? (
                  <InputNumber value={plan.markupPct} onChange={(markupPct) => setPlan(index, { markupPct })} style={{ width: '100%' }} addonAfter="%" aria-label={t('mp.grid.price')} />
                ) : (
                  <span className="mp-muted mp-small">{t('mp.grid.basePrice')}</span>
                )}
                <InputNumber value={plan.firstPct} onChange={(firstPct) => setPlan(index, { firstPct })} min={0} max={100} style={{ width: '100%' }} addonAfter="%" aria-label={t('mp.grid.firstPct')} />
                <InputNumber value={plan.firstPct >= 100 ? null : plan.months} onChange={(months) => setPlan(index, { months })} min={1} max={360} disabled={plan.firstPct >= 100} style={{ width: '100%' }} aria-label={t('mp.grid.months')} />
                <Button type="text" danger onClick={() => setDraft({ ...draft, plans: draft.plans.filter((_, i) => i !== index) })} aria-label={t('common.delete')}>✕</Button>
              </div>
            ))}
            {draft.plans.length < 8 && (
              <div>
                <Button onClick={() => setDraft({ ...draft, plans: [...draft.plans, { name: '', mode: 'ppm', ppm: null, firstPct: 50, months: 12 }] })}>＋ {t('mp.grid.addPlan')}</Button>
              </div>
            )}
          </div>
          <div className="form-grid-2">
            <label className="mp-ffield">
              <span>{t('mp.grid.planned')}</span>
              <InputNumber value={draft.plannedPpm} onChange={(plannedPpm) => setDraft({ ...draft, plannedPpm })} min={0} style={{ width: '100%' }} addonAfter={t('mp.measure.perSqmShort', { price: project.currency })} />
            </label>
            <label className="mp-ffield">
              <span>{t('mp.grid.note')}</span>
              <Input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} maxLength={300} />
            </label>
          </div>
          {previewProject && (
            <div>
              <p className="mp-muted mp-small">{t('mp.grid.preview', { unit: nodeLabel(sample), price: formatMoney(sample.unit.price, sample.unit.currency, locale) })}</p>
              <PaymentOptions unit={{ ...sample.unit, typeId: null }} project={previewProject} />
            </div>
          )}
          <div className="mp-structure__multi">
            <Button type="primary" loading={busy} onClick={save}>{t('common.save')}</Button>
            <Button onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
          </div>
        </section>
      )}
      {data.grids.length === 0 && !draft && <p className="mp-muted">{t('mp.grid.none')}</p>}
      {data.grids.map((grid) => {
        const state = active.has(grid.id) ? 'active' : grid.effectiveFrom > today ? 'upcoming' : 'history';
        const removable = state === 'upcoming' || Date.now() - new Date(grid.createdAt).getTime() < 24 * 3600 * 1000;
        return (
          <section key={grid.id} className={`mp-grid-version${state === 'active' ? ' is-active' : ''}`}>
            <header>
              <b>{grid.typeId ? grid.typeName : t('mp.grid.wholeProject')}</b>
              <span>{t('mp.grid.since', { date: fmtDate(grid.effectiveFrom) })}</span>
              <Tag color={state === 'active' ? 'green' : state === 'upcoming' ? 'blue' : undefined}>{t(`mp.grid.state.${state}`)}</Tag>
              <span className="mod-toolbar__grow" />
              {removable && (
                <Popconfirm title={t('mp.grid.deleteConfirm')} onConfirm={() => remove(grid)} okText={t('common.delete')} cancelText={t('common.cancel')}>
                  <Button size="small" danger>{t('common.delete')}</Button>
                </Popconfirm>
              )}
            </header>
            <table>
              <thead>
                <tr><th>{t('mp.grid.planName')}</th><th>{t('mp.grid.price')}</th><th>{t('mp.grid.firstPct')}</th><th>{t('mp.grid.months')}</th></tr>
              </thead>
              <tbody>
                {grid.plans.map((plan) => (
                  <tr key={plan.key}>
                    <td>{plan.name}</td>
                    <td>{priceOf(plan, grid.currency)}</td>
                    <td>{formatPercent(plan.firstPct, locale)}</td>
                    <td>{plan.months || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mp-muted mp-small">
              {[grid.plannedPpm ? t('mp.grid.plannedShort', { price: formatMoney(grid.plannedPpm, grid.currency, locale) }) : null, grid.note, grid.author ? `${grid.author.name} · ${fmtDateTime(grid.createdAt)}` : null].filter(Boolean).join(' · ')}
            </p>
          </section>
        );
      })}
    </div>
  );
}
