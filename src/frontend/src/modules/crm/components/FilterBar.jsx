import { useEffect, useMemo, useState } from 'react';
import { App, Button, DatePicker, Input, InputNumber, Modal, Popover, Select, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { dayFromPicker, dayToPicker, pickerFormat, useRegional } from '../../../lib/datetime';
import { crmApi, listOf } from '../api';
import { useCrm } from '../CrmContext';
import { BUILTIN_PRESETS, EMPTY_FILTER, filterCount, normalizeFilter, sameFilter } from '../lib';
import { Glyph } from './bits';
import ClientPicker from './ClientPicker';
import UserSelect from './UserSelect';

const { RangePicker } = DatePicker;

// Both ranges are calendar days ('YYYY-MM-DD'): no zone shift. The server reads
// "created on these days" in the person's zone (the tz param of filterParams).
const toRange = (from, to) => (from || to ? [dayToPicker(from), dayToPicker(to)] : null);
const fromRange = (range) => [dayFromPicker(range?.[0]) || undefined, dayFromPicker(range?.[1]) || undefined];

/** The right side of the popover: every field of the filter. */
function FilterFields({ draft, setDraft, pipeline }) {
  const { t } = useLocale();
  const { settings } = useCrm();
  const dateFormat = pickerFormat(useRegional()).date;
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const selectFields = (settings.fields || []).filter((field) => field.type === 'select' || field.type === 'multiselect');
  const stageOptions = (pipeline?.stages || []).map((stage) => ({ value: stage.id, label: <span className="status-option"><span className="status-pip" style={{ '--c': stage.color }} />{stage.name}</span>, search: stage.name.toLowerCase() }));
  return (
    <div className="crm-filter__fields">
      <label className="crm-filter__field">
        <span>{t('crm.fields.owner')}</span>
        <UserSelect multiple withMe value={draft.owners} onChange={(owners) => set({ owners })} placeholder={t('crm.filter.anyone')} />
      </label>
      <label className="crm-filter__field">
        <span>{t('crm.filter.group')}</span>
        <Select
          value={draft.group || 'open'}
          onChange={(group) => set({ group })}
          options={['open', 'won', 'lost', 'closed', 'all'].map((value) => ({ value, label: t(`crm.filter.groups.${value}`) }))}
        />
      </label>
      <label className="crm-filter__field">
        <span>{t('crm.filter.stages')}</span>
        <Select mode="multiple" allowClear value={draft.stages || []} onChange={(stages) => set({ stages })} options={stageOptions} placeholder={t('crm.filter.anyStage')} filterOption={(input, option) => option.search.includes(input.toLowerCase())} maxTagCount="responsive" />
      </label>
      <label className="crm-filter__field">
        <span>{t('crm.filter.amount')}</span>
        <span className="crm-filter__pair">
          <InputNumber min={0} value={draft.amountMin} onChange={(amountMin) => set({ amountMin: amountMin ?? undefined })} placeholder={t('crm.filter.from')} style={{ width: '100%' }} />
          <InputNumber min={0} value={draft.amountMax} onChange={(amountMax) => set({ amountMax: amountMax ?? undefined })} placeholder={t('crm.filter.to')} style={{ width: '100%' }} />
        </span>
      </label>
      <label className="crm-filter__field">
        <span>{t('crm.fields.closeDate')}</span>
        <RangePicker placeholder={[t('crm.filter.from'), t('crm.filter.to')]} allowEmpty={[true, true]} value={toRange(draft.closeFrom, draft.closeTo)} onChange={(range) => { const [closeFrom, closeTo] = fromRange(range); set({ closeFrom, closeTo }); }} format={dateFormat} style={{ width: '100%' }} />
      </label>
      <label className="crm-filter__field">
        <span>{t('crm.filter.created')}</span>
        <RangePicker placeholder={[t('crm.filter.from'), t('crm.filter.to')]} allowEmpty={[true, true]} value={toRange(draft.createdFrom, draft.createdTo)} onChange={(range) => { const [createdFrom, createdTo] = fromRange(range); set({ createdFrom, createdTo }); }} format={dateFormat} style={{ width: '100%' }} />
      </label>
      <label className="crm-filter__field">
        <span>{t('crm.fields.source')}</span>
        <Select allowClear value={draft.source} onChange={(source) => set({ source })} options={(settings.sources || []).map((value) => ({ value, label: value }))} placeholder={t('crm.filter.any')} />
      </label>
      <label className="crm-filter__field">
        <span>{t('crm.fields.client')}</span>
        <ClientPicker value={draft.client} initial={draft.clientLabel} onChange={(client, item) => set({ client: client || undefined, clientLabel: item || undefined })} placeholder={t('crm.filter.anyClient')} />
      </label>
      <label className="crm-filter__field">
        <span>{t('crm.fields.createdBy')}</span>
        <UserSelect multiple withMe value={draft.createdBy} onChange={(createdBy) => set({ createdBy })} placeholder={t('crm.filter.anyone')} />
      </label>
      {selectFields.map((field) => (
        <label key={field.key} className="crm-filter__field">
          <span>{field.label}</span>
          <Select allowClear value={draft[`cf_${field.key}`]} onChange={(value) => set({ [`cf_${field.key}`]: value })} options={(field.options || []).map((value) => ({ value, label: value }))} placeholder={t('crm.filter.any')} />
        </label>
      ))}
    </div>
  );
}

/**
 * Filter bar: the applied preset as a chip plus search; a click opens the
 * popover — presets on the left, fields on the right, Find / Reset.
 * `value` = { presetId, filter }.
 */
export default function FilterBar({ value, onChange, pipeline }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value.filter);
  const [presets, setPresets] = useState([]);
  const [q, setQ] = useState(value.filter.q || '');
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    crmApi
      .presets()
      .then((res) => setPresets(listOf(res.data, 'presets')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) setDraft(value.filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => setQ(value.filter.q || ''), [value.filter.q]);

  // Search applies by itself after a short pause.
  useEffect(() => {
    if ((value.filter.q || '') === q) return undefined;
    const timer = setTimeout(() => onChange({ presetId: value.presetId, filter: { ...value.filter, q: q || undefined } }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const builtins = BUILTIN_PRESETS.map((preset) => ({ ...preset, name: t(`crm.filter.presets.${preset.id}`), builtin: true }));
  const all = [...builtins, ...presets.map((preset) => ({ ...preset, id: `u${preset.id}`, serverId: preset.id }))];
  const current = all.find((preset) => preset.id === value.presetId);
  const modified = current && !sameFilter({ ...current.filter, q: undefined }, { ...value.filter, q: undefined });
  const extra = filterCount(value.filter);

  const apply = (filter, presetId = null) => {
    onChange({ presetId, filter: normalizeFilter({ ...filter, q: value.filter.q }) });
    setOpen(false);
  };

  const choosePreset = (preset) => apply(preset.filter, preset.id);

  const savePreset = async () => {
    const name = saving?.trim();
    if (!name) return;
    try {
      const { clientLabel, q: _q, ...filter } = draft;
      const res = await crmApi.createPreset({ name, filter: { ...filter, ...(clientLabel ? { clientLabel } : {}) } });
      const preset = res.data.preset || res.data;
      setPresets((list) => [...list, preset]);
      setSaving(null);
      message.success(t('crm.filter.presetSaved', { name }));
      apply(draft, `u${preset.id}`);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const removePreset = (preset) =>
    modal.confirm({
      title: t('crm.filter.deletePreset', { name: preset.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        await crmApi.deletePreset(preset.serverId);
        setPresets((list) => list.filter((item) => item.id !== preset.serverId));
        if (value.presetId === preset.id) apply(EMPTY_FILTER, 'work');
      },
    });

  const content = (
    <div className="crm-filter">
      <aside className="crm-filter__presets">
        <div className="crm-filter__label">{t('crm.filter.presetsTitle')}</div>
        {all.map((preset) => (
          <div key={preset.id} className={`crm-filter__preset${preset.id === value.presetId ? ' is-on' : ''}`}>
            <button type="button" onClick={() => choosePreset(preset)}>
              {preset.name}
            </button>
            {!preset.builtin && (
              <Tooltip title={t('common.delete')}>
                <button type="button" className="crm-filter__x" onClick={() => removePreset(preset)} aria-label={t('common.delete')}>
                  <Glyph name="close" size={12} />
                </button>
              </Tooltip>
            )}
          </div>
        ))}
        <button type="button" className="crm-filter__save" onClick={() => { setOpen(false); setSaving(''); }}>
          + {t('crm.filter.savePreset')}
        </button>
      </aside>
      <div className="crm-filter__main">
        <FilterFields draft={draft} setDraft={setDraft} pipeline={pipeline} />
        <div className="crm-filter__foot">
          <Button type="primary" onClick={() => apply(draft, sameFilter(draft, current?.filter || {}) ? value.presetId : null)}>
            {t('crm.filter.find')}
          </Button>
          <Button onClick={() => apply(EMPTY_FILTER, 'work')}>{t('crm.filter.reset')}</Button>
        </div>
      </div>
    </div>
  );

  const chip = current ? current.name : extra || value.filter.group !== 'open' ? t('crm.filter.custom') : null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomLeft" content={content} overlayClassName="crm-filter-pop" arrow={false} destroyOnHidden>
        <div
          className={`crm-filterbar${open ? ' is-open' : ''}`}
          data-tour="crm.filters"
          onClick={(event) => {
            if (event.target.tagName !== 'INPUT') setOpen(true);
          }}
        >
          <Glyph name="filter" size={15} />
          {chip && (
            <span className="crm-filterbar__chip">
              {chip}
              {modified && <i className="crm-filterbar__dot" aria-label={t('crm.filter.modified')} />}
              {extra > 0 && !current && <b>{extra}</b>}
              {value.presetId !== 'work' && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    apply(EMPTY_FILTER, 'work');
                  }}
                  aria-label={t('crm.filter.reset')}
                >
                  <Glyph name="close" size={11} />
                </button>
              )}
            </span>
          )}
          <input
            className="crm-filterbar__input"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onFocus={() => setOpen(false)}
            onKeyDown={(event) => event.key === 'Escape' && setQ('')}
            placeholder={t('crm.filter.search')}
            aria-label={t('crm.filter.search')}
          />
          {q && (
            <button type="button" className="crm-filterbar__clear" onClick={(event) => { event.stopPropagation(); setQ(''); }} aria-label={t('crm.filter.clearSearch')}>
              <Glyph name="close" size={12} />
            </button>
          )}
        </div>
      </Popover>
      <Modal open={saving !== null} title={t('crm.filter.savePreset')} okText={t('common.save')} cancelText={t('common.cancel')} onOk={savePreset} onCancel={() => setSaving(null)} okButtonProps={{ disabled: !saving?.trim() }} width={400} destroyOnHidden>
        <p className="dialog-lead">{t('crm.filter.saveLead')}</p>
        <Input autoFocus value={saving || ''} onChange={(event) => setSaving(event.target.value)} onPressEnter={savePreset} placeholder={t('crm.filter.presetName')} maxLength={100} />
      </Modal>
    </>
  );
}

/** The applied filter for the current user, remembered between visits. */
export function useStoredFilter(storageKey) {
  const initial = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved?.filter) return { presetId: saved.presetId ?? null, filter: normalizeFilter(saved.filter) };
    } catch {
      /* ignore */
    }
    return { presetId: 'work', filter: { ...EMPTY_FILTER } };
  }, [storageKey]);
  const [state, setState] = useState(initial);
  const change = (next) => {
    setState(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return [state, change];
}
