import { useEffect, useRef, useState } from 'react';
import { App, Button, Input, Select, Space } from 'antd';
import api from '../../../services/api';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';

/*
 * A CRM deal for a unit (spec §10.1 "выбирает сделку или создаёт новую"):
 * search among the deals the person may see in the CRM, or create one with a
 * new contact (name + phone) of Counterparties in place. Talks to the CRM
 * module's own API, so CRM visibility rules apply.
 */
export default function DealPicker({ value, onChange, defaultTitle, initial }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [options, setOptions] = useState(initial ? [initial] : []);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: defaultTitle || '', name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const search = async (q) => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await api.get('/app/crm/deals', { params: { q, pipeline: 'all', group: 'open', pageSize: 20, sort: 'updated', order: 'desc' } });
      if (mine === seq.current) setOptions(res.data.items || []);
    } catch {
      if (mine === seq.current) setOptions([]);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  };

  useEffect(() => {
    search('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!form.title.trim() || !form.name.trim()) return;
    setBusy(true);
    try {
      const meta = (await api.get('/app/crm/meta')).data;
      const pipeline = meta.pipelines.find((item) => item.isDefault) || meta.pipelines[0];
      const client = (await api.post('/app/crm/clients', { type: 'person', name: form.name.trim(), phone: form.phone.trim() || undefined })).data.client;
      const deal = (await api.post('/app/crm/deals', { pipelineId: pipeline.id, title: form.title.trim(), personId: client.id, amount: 0, currency: meta.settings.currency })).data.deal;
      setOptions((prev) => [deal, ...prev]);
      onChange?.(deal.id, deal);
      setCreating(false);
      message.success(t('mp.deal.created'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const clientOf = (deal) => deal.person?.name || deal.company?.name || '';
  return (
    <div className="mp-dealpick">
      {!creating ? (
        <Space.Compact block>
          <Select
            showSearch
            allowClear
            value={value || undefined}
            placeholder={t('mp.deal.search')}
            filterOption={false}
            onSearch={search}
            loading={loading}
            onChange={(id) => onChange?.(id || null, options.find((deal) => deal.id === id) || null)}
            notFoundContent={loading ? t('common.loading') : t('mp.deal.none')}
            options={options.map((deal) => ({
              value: deal.id,
              label: (
                <span className="mp-dealopt">
                  <b>{deal.title}</b>
                  <span>{clientOf(deal) || t('mp.deal.noClient')}</span>
                </span>
              ),
            }))}
            style={{ width: '100%' }}
          />
          <Button onClick={() => setCreating(true)}>{t('mp.deal.new')}</Button>
        </Space.Compact>
      ) : (
        <div className="mp-dealnew">
          <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t('mp.deal.title')} maxLength={300} />
          <Space.Compact block>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t('mp.deal.client')} maxLength={120} />
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder={t('mp.deal.phone')} inputMode="tel" maxLength={40} />
          </Space.Compact>
          <Space>
            <Button type="primary" loading={busy} disabled={!form.title.trim() || !form.name.trim()} onClick={create}>{t('mp.deal.create')}</Button>
            <Button onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
          </Space>
        </div>
      )}
    </div>
  );
}
