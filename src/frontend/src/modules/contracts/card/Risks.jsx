import { useState } from 'react';
import { App, Button, Dropdown, Input, Segmented, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { HintLabel } from '../../../help/Hint';
import { contractsApi } from '../api';

const IMPORTANCE = ['high', 'medium', 'low'];

/** A new risk: what is wrong, the clause, the importance. */
function RiskEditor({ initial, onSave, onCancel, saving }) {
  const { t } = useLocale();
  const [text, setText] = useState(initial?.text || '');
  const [clause, setClause] = useState(initial?.clause || '');
  const [importance, setImportance] = useState(initial?.importance || 'medium');
  return (
    <div className="ctr-risk-editor">
      <Input.TextArea autoFocus value={text} onChange={(e) => setText(e.target.value)} autoSize={{ minRows: 2, maxRows: 6 }} maxLength={2000} placeholder={t('contracts.risks.textPh')} />
      <div className="ctr-risk-editor__row">
        <Input value={clause} onChange={(e) => setClause(e.target.value)} maxLength={120} placeholder={t('contracts.risks.clausePh')} style={{ maxWidth: 160 }} prefix="§" />
        <Segmented
          value={importance}
          onChange={setImportance}
          options={IMPORTANCE.map((key) => ({ value: key, label: <span className={`ctr-imp-opt is-${key}`}>{t(`contracts.risks.importance.${key}`)}</span> }))}
        />
        <span className="ctr-grow" />
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="primary" disabled={!text.trim()} loading={saving} onClick={() => onSave({ text: text.trim(), clause: clause.trim(), importance })}>
          {initial ? t('common.save') : t('contracts.risks.add')}
        </Button>
      </div>
    </div>
  );
}

/**
 * «На что обратить внимание»: the lawyer's checklist. Open high risks first;
 * the lawyer adds, edits and resolves (accepted / fixed); everyone may
 * discuss a risk — the message in the contract's chat links back here.
 */
export default function Risks({ contract, risks, canEdit, onChanged, onDiscuss, highlight }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const open = risks.filter((risk) => risk.status === 'open');

  const run = async (call) => {
    setSaving(true);
    try {
      await call();
      onChanged();
      return true;
    } catch (err) {
      message.error(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ctr-section">
      <header className="ctr-section__head">
        <h3>
          <HintLabel id="contracts.risks">{t('contracts.risks.title')}</HintLabel>
        </h3>
        {open.length > 0 && <span className="ctr-count">{t('contracts.risks.openCount', { n: open.length })}</span>}
        <span className="ctr-grow" />
        {canEdit && !adding && (
          <Button size="small" onClick={() => setAdding(true)}>
            + {t('contracts.risks.add')}
          </Button>
        )}
      </header>
      {adding && <RiskEditor saving={saving} onCancel={() => setAdding(false)} onSave={(data) => run(() => contractsApi.addRisk(contract.id, data)).then((ok) => ok && setAdding(false))} />}
      {!risks.length && !adding && <div className="ctr-section__empty">{canEdit ? t('contracts.risks.emptyLawyer') : t('contracts.risks.empty')}</div>}
      <ul className="ctr-risks">
        {risks.map((risk) =>
          editing === risk.id ? (
            <li key={risk.id}>
              <RiskEditor initial={risk} saving={saving} onCancel={() => setEditing(null)} onSave={(data) => run(() => contractsApi.updateRisk(risk.id, data)).then((ok) => ok && setEditing(null))} />
            </li>
          ) : (
            <li key={risk.id} id={`risk-${risk.no}`} className={`ctr-risk is-${risk.importance} is-${risk.status}${highlight === risk.no ? ' is-highlight' : ''}`}>
              <span className="ctr-risk__no">#{risk.no}</span>
              <div className="ctr-risk__body">
                <div className="ctr-risk__meta">
                  <span className={`ctr-imp is-${risk.importance}`}>{t(`contracts.risks.importance.${risk.importance}`)}</span>
                  {risk.clause && <span className="ctr-risk__clause">§ {risk.clause}</span>}
                  {risk.status !== 'open' && (
                    <span className={`ctr-risk__state is-${risk.status}`}>
                      {risk.status === 'fixed' ? '✓' : '≈'} {t(`contracts.risks.status.${risk.status}`)}
                      {risk.resolvedBy ? ` · ${risk.resolvedBy.name}` : ''}
                    </span>
                  )}
                </div>
                <p className="ctr-risk__text">{risk.text}</p>
              </div>
              <div className="ctr-risk__actions">
                {onDiscuss && (
                  <Tooltip title={t('contracts.risks.discuss')}>
                    <button type="button" className="ctr-icon-btn" onClick={() => onDiscuss(risk)} aria-label={t('contracts.risks.discuss')}>💬</button>
                  </Tooltip>
                )}
                {canEdit && (
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        risk.status !== 'fixed' && { key: 'fixed', label: `✓ ${t('contracts.risks.markFixed')}` },
                        risk.status !== 'accepted' && { key: 'accepted', label: `≈ ${t('contracts.risks.markAccepted')}` },
                        risk.status !== 'open' && { key: 'open', label: `↺ ${t('contracts.risks.reopen')}` },
                        { type: 'divider' },
                        { key: 'edit', label: t('common.edit') },
                        { key: 'delete', danger: true, label: t('common.delete') },
                      ].filter(Boolean),
                      onClick: ({ key }) => {
                        if (key === 'edit') setEditing(risk.id);
                        else if (key === 'delete') run(() => contractsApi.removeRisk(risk.id));
                        else run(() => contractsApi.updateRisk(risk.id, { status: key }));
                      },
                    }}
                  >
                    <button type="button" className="ctr-icon-btn" aria-label={t('contracts.risks.menu')}>⋯</button>
                  </Dropdown>
                )}
              </div>
            </li>
          )
        )}
      </ul>
    </section>
  );
}

/** Open high risks shown to approvers next to the decision buttons. */
export function HighRisksCallout({ risks, onOpen }) {
  const { t } = useLocale();
  const high = risks.filter((risk) => risk.status === 'open' && risk.importance === 'high');
  if (!high.length) return null;
  return (
    <div className="ctr-callout" role="note">
      <div className="ctr-callout__head">
        <span className="ctr-callout__icon" aria-hidden="true">!</span>
        <strong>{t('contracts.risks.highOpen', { n: high.length })}</strong>
      </div>
      <ul>
        {high.slice(0, 4).map((risk) => (
          <li key={risk.id}>
            <button type="button" className="ctr-link-btn" onClick={() => onOpen?.(risk)}>
              #{risk.no}
              {risk.clause ? ` · § ${risk.clause}` : ''}
            </button>{' '}
            {risk.text.length > 140 ? `${risk.text.slice(0, 140)}…` : risk.text}
          </li>
        ))}
      </ul>
      {high.length > 4 && <div className="ctr-callout__more">{t('contracts.risks.andMore', { n: high.length - 4 })}</div>}
    </div>
  );
}

