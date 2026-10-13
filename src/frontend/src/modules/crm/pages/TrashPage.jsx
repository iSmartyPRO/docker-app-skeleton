import { useCallback, useEffect, useState } from 'react';
import { App, Button, Input, Table } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatRelative } from '../../../lib/format';
import { Person } from '../../shared/People';
import { crmApi, listOf } from '../api';
import { useCrm } from '../CrmContext';
import { Empty, Glyph, Money, StageTag } from '../components/bits';

/** /app/crm/trash — deleted deals; the owner, the author and CRM admins restore them. */
export default function TrashPage() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { stageById, pipelineById, touch } = useCrm();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await crmApi.trash(q ? { q } : {});
      setItems(listOf(res.data, 'deals'));
    } catch (err) {
      message.error(errorMessage(err));
      setItems([]);
    }
  }, [q, message]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  const restore = async (deal) => {
    setBusy(deal.id);
    try {
      await crmApi.restoreDeal(deal.id);
      setItems((list) => list.filter((item) => item.id !== deal.id));
      message.success(t('crm.trash.restored', { title: deal.title }));
      touch();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="crm-page crm-page--narrow">
      <header className="crm-head">
        <div>
          <h1>{t('crm.trash.title')}</h1>
          <p>{t('crm.trash.lead')}</p>
        </div>
      </header>
      <div className="mod-toolbar">
        <Input.Search allowClear value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('crm.trash.search')} style={{ maxWidth: 360 }} />
      </div>
      <Table
        className="crm-table"
        rowKey="id"
        loading={items === null}
        dataSource={items || []}
        pagination={(items || []).length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: items ? <Empty icon="trash" title={t('crm.trash.empty')} text={t('crm.trash.emptyText')} /> : ' ' }}
        columns={[
          { title: t('crm.list.col.title'), key: 'title', render: (_, deal) => <span className="crm-row-title">{deal.title}</span> },
          { title: t('crm.list.col.stage'), key: 'stage', render: (_, deal) => <span className="crm-trash-stage"><span className="crm-muted">{pipelineById(deal.pipelineId)?.name}</span> <StageTag stage={stageById(deal.stageId)} /></span> },
          { title: t('crm.list.col.amount'), key: 'amount', align: 'right', render: (_, deal) => (Number(deal.amount) ? <Money amount={deal.amount} currency={deal.currency} /> : '—') },
          { title: t('crm.list.col.owner'), key: 'owner', responsive: ['md'], render: (_, deal) => (deal.owner ? <Person user={deal.owner} size={22} /> : '—') },
          { title: t('crm.trash.deleted'), key: 'deleted', responsive: ['md'], render: (_, deal) => <span className="crm-muted">{formatRelative(deal.deletedAt || deal.updatedAt, locale)}</span> },
          {
            title: '',
            key: 'actions',
            align: 'right',
            render: (_, deal) =>
              deal.canDelete !== false && (
                <Button size="small" icon={<Glyph name="copy" size={13} />} loading={busy === deal.id} onClick={() => restore(deal)}>
                  {t('crm.trash.restore')}
                </Button>
              ),
          },
        ]}
      />
    </div>
  );
}
