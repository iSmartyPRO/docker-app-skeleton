import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDateTime } from '../../../lib/datetime';
import { DateField } from '../../../components/ui/DateTimeField';
import { Hint } from '../../../help/Hint';
import { procApi } from '../api';
import { useProc } from '../ProcContext';
import { formatMoney } from '../lib';
import { CategoryTag, DayBadge, PersonSelect } from '../components/bits';
import { procError } from './RequestCard';

function Row({ label, children, hint }) {
  return (
    <div className="prc-dl__row">
      <dt>
        {label}
        {hint && <Hint id={hint} />}
      </dt>
      <dd>{children || <span className="prc-muted">—</span>}</dd>
    </div>
  );
}

/** Details: what, how much, terms, deadlines, supplier, links, people. */
export default function DetailsTab({ data, onChanged }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { meta } = useProc();
  const [saving, setSaving] = useState(false);
  const { request, my } = data;
  const money = (value) => formatMoney(value, request.currency, locale);
  const patch = async (body) => {
    setSaving(true);
    try {
      const res = await procApi.update(request.id, body);
      onChanged(res.data);
    } catch (err) {
      message.error(procError(err, t));
    } finally {
      setSaving(false);
    }
  };
  const terms = request.paymentTerms === 'advance' ? t('procurement.terms.advanceN', { n: request.advancePercent || '—' }) : t(`procurement.terms.${request.paymentTerms}`);
  const links = [
    meta.modules.masterplan && request.project && { key: 'project', label: t('procurement.fields.project'), value: [request.project.label, request.object?.label].filter(Boolean).join(' · '), to: request.project.id ? `/app/masterplan/p/${request.project.id}` : null },
    meta.modules.crm && request.deal && { key: 'deal', label: t('procurement.fields.deal'), value: request.deal.label, to: request.deal.id ? `/app/crm/deals/${request.deal.id}` : null },
    meta.modules.contracts && request.contract && { key: 'contract', label: t('procurement.fields.contract'), value: request.contract.label, to: request.contract.id ? `/app/contracts/${request.contract.id}` : null },
  ].filter(Boolean);
  return (
    <div className="prc-details">
      {request.description && <p className="prc-description">{request.description}</p>}

      {request.hasItems && request.items.length > 0 && (
        <div className="prc-items">
          <table>
            <thead>
              <tr>
                <th>{t('procurement.items.name')}</th>
                <th className="is-num">{t('procurement.items.qty')}</th>
                <th className="is-num">{t('procurement.items.price')}</th>
                <th className="is-num">{t('procurement.items.sum')}</th>
              </tr>
            </thead>
            <tbody>
              {request.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="is-num">{item.qty.toLocaleString(locale)} {item.unit}</td>
                  <td className="is-num">{money(item.price)}</td>
                  <td className="is-num">{money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>{t('procurement.items.total')}</td>
                <td className="is-num"><strong>{money(request.amount)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <dl className="prc-dl">
        <Row label={t('procurement.fields.amount')}>
          <strong>{money(request.amount)}</strong>
          {request.paid > 0 && <span className="prc-muted"> · {t('procurement.paidOf', { paid: money(request.paid) })}</span>}
        </Row>
        <Row label={t('procurement.fields.category')}>{request.category && <CategoryTag value={request.category} />}</Row>
        <Row label={t('procurement.fields.legalEntity')}>{request.legalEntity?.label}</Row>
        <Row label={t('procurement.fields.paymentTerms')} hint="procurement.paymentTerms">{terms}</Row>
        <Row label={t('procurement.fields.payBy')}>{request.payBy && <DayBadge value={request.payBy} done={['paid', 'delivered', 'closed'].includes(request.status)} />}</Row>
        <Row label={t('procurement.fields.deliverBy')}>
          {my.canEditSecondary ? (
            <DateField value={request.deliverBy} onChange={(value) => patch({ deliverBy: value })} disabled={saving} size="small" />
          ) : (
            request.deliverBy && <DayBadge value={request.deliverBy} done={request.deliveryState === 'full'} />
          )}
        </Row>
        <Row label={t('procurement.fields.delivery')}>{t(`procurement.delivery.${request.deliveryState}`)}</Row>
        <Row label={t('procurement.fields.supplier')}>
          {request.supplier && (
            <span className="prc-supplier">
              {request.supplier.companyId && meta.modules.companies ? <Link to={`/app/companies/c/${request.supplier.companyId}`}>{request.supplier.name}</Link> : request.supplier.name}
              {request.supplier.contact && <small>{request.supplier.contact}</small>}
            </span>
          )}
        </Row>
        {links.map((item) => (
          <Row key={item.key} label={item.label}>
            {item.to ? <Link to={item.to}>{item.value}</Link> : item.value}
          </Row>
        ))}
        <Row label={t('procurement.fields.author')}>{request.author?.name}</Row>
        <Row label={t('procurement.fields.responsible')} hint="procurement.responsible">
          {my.canEditSecondary ? (
            <PersonSelect value={request.responsible?.id} onChange={(id) => id && patch({ responsibleId: id })} allowClear={false} size="small" style={{ minWidth: 220 }} disabled={saving} />
          ) : (
            request.responsible?.name
          )}
        </Row>
        <Row label={t('procurement.fields.created')}>{fmtDateTime(request.createdAt)}</Row>
        {request.approvedAt && <Row label={t('procurement.fields.approved')}>{fmtDateTime(request.approvedAt)}</Row>}
      </dl>
    </div>
  );
}
