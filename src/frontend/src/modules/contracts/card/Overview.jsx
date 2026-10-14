import { Link } from 'react-router-dom';
import { Button } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { useContracts } from '../ContractsContext';
import { daysLeft } from '../lib';
import { Money, TypeTag, UserChip } from '../components/bits';
import Risks from './Risks';

function Field({ label, children, wide }) {
  return (
    <div className={`ctr-field${wide ? ' is-wide' : ''}`}>
      <dt>{label}</dt>
      <dd>{children ?? <span className="ctr-muted">—</span>}</dd>
    </div>
  );
}

/** «Обзор»: the card's fields (grouped like the form) and the risks. */
export default function Overview({ data, onEdit, onChanged, onDiscuss, highlightRisk }) {
  const { t } = useLocale();
  const { modules } = useContracts();
  const { contract, can, risks } = data;
  const notice = contract.noticeDeadline;
  const noticeLeft = notice ? daysLeft(notice) : null;
  return (
    <div className="ctr-overview">
      <section className="ctr-section">
        <header className="ctr-section__head">
          <h3>{t('contracts.card.about')}</h3>
          <span className="ctr-grow" />
          {can.edit && (
            <Button size="small" onClick={onEdit} icon={<EditOutlined />}>
              {t('common.edit')}
            </Button>
          )}
        </header>
        <dl className="ctr-fields">
          <Field label={t('contracts.fields.type')}>{contract.typeKey ? <TypeTag typeKey={contract.typeKey} /> : null}</Field>
          <Field label={t('contracts.fields.direction')}>{contract.direction ? t(`contracts.direction.${contract.direction}`) : null}</Field>
          <Field label={t('contracts.fields.counterparty')}>
            {contract.counterparty ? (
              contract.companyId && modules.companies ? (
                <Link to={`/app/companies/c/${contract.companyId}`}>{contract.counterparty}</Link>
              ) : (
                contract.counterparty
              )
            ) : null}
          </Field>
          <Field label={t('contracts.fields.legalEntity')}>{contract.legalEntity?.name || null}</Field>
          <Field label={t('contracts.fields.amount')}>
            <Money contract={contract} />
          </Field>
          <Field label={t('contracts.fields.extNumber')}>{contract.extNumber || null}</Field>
          <Field label={t('contracts.fields.paymentTerms')} wide>
            {contract.paymentTerms ? <span className="ctr-pre">{contract.paymentTerms}</span> : null}
          </Field>
        </dl>
      </section>

      <section className="ctr-section">
        <header className="ctr-section__head">
          <h3>{t('contracts.form.dates')}</h3>
        </header>
        <dl className="ctr-fields">
          <Field label={t('contracts.fields.concludedOn')}>{contract.concludedOn ? fmtDate(contract.concludedOn) : null}</Field>
          <Field label={t('contracts.fields.startsOn')}>{contract.startsOn ? fmtDate(contract.startsOn) : null}</Field>
          <Field label={t('contracts.fields.endsOn')}>{contract.endsOn ? fmtDate(contract.endsOn) : null}</Field>
          <Field label={t('contracts.fields.autoRenew')}>
            {contract.autoRenew ? (
              <span>
                {t('common.yes')}
                {contract.noticeDays ? ` · ${t('contracts.card.noticeDays', { n: contract.noticeDays })}` : ''}
              </span>
            ) : (
              t('common.no')
            )}
          </Field>
          {notice && (
            <Field label={t('contracts.fields.noticeDeadline')} wide>
              <span className={`ctr-deadline${noticeLeft !== null && noticeLeft <= 14 && noticeLeft >= 0 ? ' is-soon' : ''}${noticeLeft < 0 ? ' is-past' : ''}`}>
                {fmtDate(notice)}
                {noticeLeft !== null && noticeLeft >= 0 && <em>{noticeLeft === 0 ? t('contracts.end.today') : t('contracts.end.in', { n: noticeLeft })}</em>}
              </span>
            </Field>
          )}
          {contract.signedAt && (
            <Field label={t('contracts.card.signed')} wide>
              {fmtDateTime(contract.signedAt)}
              {contract.signedBy ? ` · ${contract.signedBy.name}` : ''}
            </Field>
          )}
          {contract.terminatedReason && (
            <Field label={t('contracts.card.terminatedReason')} wide>
              {contract.terminatedReason}
            </Field>
          )}
        </dl>
      </section>

      <section className="ctr-section">
        <header className="ctr-section__head">
          <h3>{t('contracts.form.people')}</h3>
        </header>
        <dl className="ctr-fields">
          <Field label={t('contracts.fields.owner')}>
            <UserChip user={contract.owner} />
          </Field>
          <Field label={t('contracts.fields.lawyer')}>
            <UserChip user={contract.lawyer} />
          </Field>
          <Field label={t('contracts.card.createdBy')}>
            <UserChip user={contract.createdBy} />
          </Field>
          <Field label={t('contracts.card.createdAt')}>{fmtDateTime(contract.createdAt)}</Field>
          {contract.description && (
            <Field label={t('contracts.fields.description')} wide>
              <span className="ctr-pre">{contract.description}</span>
            </Field>
          )}
        </dl>
      </section>

      <Risks contract={contract} risks={risks} canEdit={can.risks} onChanged={onChanged} onDiscuss={onDiscuss} highlight={highlightRisk} />
    </div>
  );
}
