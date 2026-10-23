import { useEffect, useState } from 'react';
import { App, Button, Input } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { Empty } from '../components/bits';
import { optionalComponent, optionalApi } from '../../../platform/optional';

// Optional links (the module may be off or not installed): provided by its register.js.
const Conversation = optionalComponent('chat', 'Conversation');
const chatApi = optionalApi('chat', 'chatApi');

/** The message that ties a chat message to a risk: «↪ Риск #3 · § 7.2 — …» and a link back to it. */
export function riskMessage(contract, risk, text, t) {
  const link = `${window.location.origin}/app/contracts/${contract.id}?risk=${risk.no}`;
  const quote = risk.text.length > 160 ? `${risk.text.slice(0, 160)}…` : risk.text;
  return `↪ **${t('contracts.risks.ref', { no: risk.no })}**${risk.clause ? ` · § ${risk.clause}` : ''} — _${quote}_\n${text}\n${link}`;
}

/**
 * «Обсуждение»: the contract's conversation (chat entity 'contract'). Open
 * risks sit above it as chips: picking one writes a message about that risk.
 */
export default function Discussion({ data, chatEnabled, risk, onRiskDone }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { contract, risks } = data;
  const [about, setAbout] = useState(risk || null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (risk) setAbout(risk);
  }, [risk]);

  if (!chatEnabled) return <Empty icon="💬" title={t('contracts.discussion.off')} text={t('contracts.discussion.offHint')} />;

  const open = risks.filter((item) => item.status === 'open');
  const send = async () => {
    setSending(true);
    try {
      const room = (await chatApi.entity('contract', contract.id)).data.room;
      await chatApi.send(room.id, { body: riskMessage(contract, about, text.trim(), t) });
      setText('');
      setAbout(null);
      onRiskDone?.();
      setKey((n) => n + 1);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ctr-discussion">
      {open.length > 0 && (
        <div className="ctr-discussion__risks">
          <span className="ctr-muted">{t('contracts.discussion.aboutRisk')}</span>
          {open.map((item) => (
            <button key={item.id} type="button" className={`ctr-riskchip is-${item.importance}${about?.id === item.id ? ' is-active' : ''}`} onClick={() => setAbout(about?.id === item.id ? null : item)} title={item.text}>
              #{item.no}
              {item.clause ? ` · § ${item.clause}` : ''}
            </button>
          ))}
        </div>
      )}
      {about && (
        <div className="ctr-discussion__compose">
          <div className="ctr-discussion__quote">
            <strong>{t('contracts.risks.ref', { no: about.no })}</strong>
            {about.clause ? ` · § ${about.clause}` : ''} — {about.text}
          </div>
          <Input.TextArea autoFocus value={text} onChange={(e) => setText(e.target.value)} autoSize={{ minRows: 2, maxRows: 6 }} maxLength={3000} placeholder={t('contracts.discussion.riskPh')} />
          <div className="ctr-discussion__row">
            <Button onClick={() => { setAbout(null); onRiskDone?.(); }}>{t('common.cancel')}</Button>
            <Button type="primary" disabled={!text.trim()} loading={sending} onClick={send}>
              {t('contracts.discussion.send')}
            </Button>
          </div>
        </div>
      )}
      <div className="ctr-discussion__chat">
        <Conversation key={`${contract.id}-${key}`} entity={{ type: 'contract', id: contract.id }} compact header="bare" bareTitle={t('contracts.discussion.title')} emptyHint={t('contracts.discussion.empty')} />
      </div>
    </div>
  );
}
