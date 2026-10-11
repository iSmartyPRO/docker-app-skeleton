import { useEffect, useState } from 'react';
import { Alert, App, Button, Checkbox, Modal, Spin } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { cmpApi, fieldLabel } from '../api';
import { useCompanies } from '../CompaniesContext';
import { formatDate } from './ui';
import { HintLabel } from '../../../help/Hint';

const show = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));

/** Compares the card with the public register and takes the chosen values. */
export default function VerifyDialog({ open, company, onClose }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { meta } = useCompanies();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [chosen, setChosen] = useState(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError(null);
    cmpApi
      .verify(company.id)
      .then((res) => {
        setResult(res.data);
        // Empty card fields are filled by default; differing ones wait for a decision.
        setChosen(new Set(res.data.differences.filter((row) => row.current === null || row.current === '').map((row) => row.field)));
      })
      .catch((err) => {
        const code = err?.response?.data?.code;
        setError(t(`companies.errors.${code}`) !== `companies.errors.${code}` ? t(`companies.errors.${code}`) : errorMessage(err));
      });
  }, [open, company, t]);

  const toggle = (field) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });

  const apply = async () => {
    setBusy(true);
    try {
      const fields = Object.fromEntries(result.differences.filter((row) => chosen.has(row.field)).map((row) => [row.field, row.registry]));
      const { data } = await cmpApi.apply(company.id, {
        fields,
        registry: { source: result.source, sourceName: result.sourceName, checkedAt: result.checkedAt, url: result.url },
        documentId: result.documentId,
        differences: result.differences.length,
      });
      message.success(chosen.size ? t('companies.verifyApplied', { n: chosen.size }) : t('companies.verifyRecorded'));
      onClose(data.company);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => onClose(null)}
      width={820}
      destroyOnHidden
      title={<HintLabel id="companies.verify">{t('companies.verifyTitle')}</HintLabel>}
      footer={
        result && (
          <div className="cmp-verify__foot">
            {result.differences.length > 0 && (
              <Button type="text" onClick={() => setChosen(chosen.size === result.differences.length ? new Set() : new Set(result.differences.map((row) => row.field)))}>
                {chosen.size === result.differences.length ? t('companies.selectNone') : t('companies.selectAll')}
              </Button>
            )}
            <span className="cmp-verify__grow" />
            <Button onClick={() => onClose(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={apply}>
              {chosen.size ? t('companies.applyN', { n: chosen.size }) : t('companies.recordCheck')}
            </Button>
          </div>
        )
      }
    >
      {error ? (
        <Alert type="error" showIcon message={error} />
      ) : !result ? (
        <div className="cmp-verify__loading"><Spin /><span>{t('companies.verifying')}</span></div>
      ) : (
        <div className="cmp-verify">
          <div className="cmp-verify__source">
            <span>🏛 {result.sourceName}</span>
            <span>{formatDate(result.checkedAt, locale)}</span>
            {result.url && <a href={result.url} target="_blank" rel="noopener noreferrer">{t('companies.openRegistry')} ↗</a>}
            {result.documentId && <span>📎 {t('companies.extractWillAttach')}</span>}
          </div>
          {!result.differences.length ? (
            <Alert type="success" showIcon message={t('companies.verifySame')} description={t('companies.verifySameText')} />
          ) : (
            <table className="cmp-verify__table">
              <thead>
                <tr>
                  <th />
                  <th>{t('companies.field')}</th>
                  <th>{t('companies.inCard')}</th>
                  <th>{t('companies.inRegistry')}</th>
                </tr>
              </thead>
              <tbody>
                {result.differences.map((row) => (
                  <tr key={row.field} className={chosen.has(row.field) ? 'is-chosen' : ''} onClick={() => toggle(row.field)}>
                    <td><Checkbox checked={chosen.has(row.field)} /></td>
                    <th>{fieldLabel(t, row.field, meta, company.country, locale)}</th>
                    <td className="is-card">{show(row.current)}</td>
                    <td className="is-registry">{show(row.registry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Modal>
  );
}
