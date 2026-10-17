import { useEffect, useState } from 'react';
import { App, Button, Input, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatRelative } from '../../../lib/format';
import { cmpApi } from '../api';
import { Avatar, Stars } from './ui';
import { HintLabel } from '../../../help/Hint';

const CRITERIA = { company: ['reliability', 'payment', 'quality', 'communication'], person: ['reliability', 'communication', 'quality'] };

/** Scores from colleagues: each person's latest score counts; the full history stays visible. */
export default function Rating({ type, id, onChange }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [score, setScore] = useState(0);
  const [criteria, setCriteria] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    cmpApi.ratings(type, id).then((res) => setData(res.data)).catch(() => setData({ summary: { count: 0, distribution: [] }, items: [] }));
  }, [type, id]);

  const submit = async () => {
    setBusy(true);
    try {
      const { data: next } = await cmpApi.rate(type, id, { score, criteria, comment });
      setData(next);
      setScore(0);
      setCriteria({});
      setComment('');
      message.success(t('companies.rated'));
      onChange?.();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Skeleton active />;
  const { summary } = data;
  const max = Math.max(1, ...summary.distribution.map((row) => row.count));
  return (
    <div className="cmp-rating">
      <div className="cmp-rating__summary">
        <div className="cmp-rating__big">
          <strong>{summary.avg ? summary.avg.toFixed(1) : '—'}</strong>
          <Stars value={summary.avg || 0} size={20} />
          <span>{t('companies.ratingsN', { count: summary.count })}</span>
        </div>
        <div className="cmp-rating__bars">
          {summary.distribution.map((row) => (
            <div key={row.score} className="cmp-rating__bar">
              <span>{row.score} ★</span>
              <div><i style={{ width: `${(row.count / max) * 100}%` }} /></div>
              <em>{row.count}</em>
            </div>
          ))}
        </div>
        <div className="cmp-rating__criteria">
          {CRITERIA[type].map((key) => (
            <div key={key}>
              <span>{t(`companies.criteria.${key}`)}</span>
              {summary.criteria?.[key] ? <Stars value={summary.criteria[key]} size={13} showValue /> : <em className="cmp-muted">—</em>}
            </div>
          ))}
        </div>
      </div>

      <div className="cmp-rating__form">
        <strong><HintLabel id="companies.rating">{t('companies.yourRating')}</HintLabel></strong>
        <Stars value={score} onChange={setScore} size={28} />
        <div className="cmp-rating__crit-input">
          {CRITERIA[type].map((key) => (
            <div key={key}>
              <span>{t(`companies.criteria.${key}`)}</span>
              <Stars value={criteria[key] || 0} onChange={(value) => setCriteria({ ...criteria, [key]: value })} size={16} />
            </div>
          ))}
        </div>
        <Input.TextArea value={comment} onChange={(event) => setComment(event.target.value)} autoSize={{ minRows: 2 }} placeholder={t('companies.ratingComment')} />
        <Button type="primary" disabled={!score} loading={busy} onClick={submit}>{t('companies.rate')}</Button>
      </div>

      <ol className="cmp-rating__history">
        {data.items.map((item) => (
          <li key={item.id} className={item.current ? '' : 'is-old'}>
            <Avatar name={item.author?.name} size={28} />
            <div>
              <div className="cmp-rating__who">
                <strong>{item.author?.name || t('companies.system')}</strong>
                <Stars value={item.score} size={13} />
                <span>{formatRelative(item.at, locale)}</span>
                {!item.current && <em>{t('companies.ratingOld')}</em>}
              </div>
              {item.comment && <p>{item.comment}</p>}
              {Object.keys(item.criteria).length > 0 && (
                <div className="cmp-rating__crit">
                  {Object.entries(item.criteria).map(([key, value]) => <span key={key}>{t(`companies.criteria.${key}`)}: {value}★</span>)}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
