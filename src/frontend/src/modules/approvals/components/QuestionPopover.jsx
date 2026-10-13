import { useEffect, useRef, useState } from 'react';
import { Button, Input, Popover } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { PersonSelect } from './pickers';

/**
 * «Вопрос» in two clicks: a popover with the question text and whom to ask
 * (the author by default). Ctrl+Enter sends. mode: 'question' | 'answer' | 'accept' (comment optional).
 */
export default function QuestionPopover({ author, onSubmit, children, placement = 'bottomRight', mode = 'question' }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [to, setTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 60);
  }, [open]);
  const optional = mode === 'accept';
  const send = async () => {
    if (!optional && !text.trim()) return;
    setBusy(true);
    try {
      await onSubmit(text.trim(), to);
      setOpen(false);
      setText('');
      setTo(null);
    } catch {
      /* the caller shows the error */
    } finally {
      setBusy(false);
    }
  };
  const content = (
    <div className="apr-pop" onClick={(event) => event.stopPropagation()}>
      <div className="apr-pop__title">{t(`approvals.${mode}.title`)}</div>
      <Input.TextArea
        ref={ref}
        value={text}
        onChange={(event) => setText(event.target.value)}
        autoSize={{ minRows: 3, maxRows: 8 }}
        maxLength={4000}
        placeholder={t(`approvals.${mode}.placeholder`)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) send();
        }}
      />
      {mode === 'question' && (
        <div className="apr-pop__to">
          <span>{t('approvals.question.to')}</span>
          <PersonSelect value={to} onChange={setTo} allowClear placeholder={author ? t('approvals.question.toAuthor', { name: author.name }) : t('approvals.question.toAuthorPlain')} />
        </div>
      )}
      <div className="apr-pop__foot">
        <span className="apr-pop__hint">Ctrl+Enter</span>
        <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
        <Button type="primary" loading={busy} disabled={!optional && !text.trim()} onClick={send}>
          {t(`approvals.${mode}.send`)}
        </Button>
      </div>
    </div>
  );
  return (
    <Popover open={open} onOpenChange={setOpen} trigger="click" placement={placement} content={content} destroyTooltipOnHide>
      <span onClick={(event) => event.stopPropagation()}>{children}</span>
    </Popover>
  );
}
