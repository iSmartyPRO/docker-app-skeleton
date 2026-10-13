import { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, Input, Popconfirm, Skeleton } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { dayToPicker, pickerFormat, todayISO } from '../../../lib/datetime';

// Calendar days (YYYY-MM-DD) never shift with a zone.
const day = (value) => dayToPicker(value)?.format(pickerFormat().date) || '';
import { DateField } from '../../../components/ui/DateTimeField';
import { approvalsApi } from '../api';
import { Person } from '../components/bits';
import { PersonSelect } from '../components/pickers';

/**
 * Substitutes: «Мой заместитель» for everyone (all = false), and every
 * person's substitutes for approvals administrators (all = true).
 */
export default function SubstitutesPanel({ all = false }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ userId: null, substituteId: null, startsOn: todayISO(), endsOn: null, note: '' });
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => approvalsApi.substitutes(all).then((res) => setData(res.data)).catch((err) => message.error(errorMessage(err))), [all, message]);
  useEffect(() => {
    load();
  }, [load]);
  const add = async () => {
    setSaving(true);
    try {
      await approvalsApi.addSubstitute({ ...form, userId: all ? form.userId || user.id : undefined });
      setForm((prev) => ({ ...prev, substituteId: null, note: '', endsOn: null }));
      message.success(t('approvals.substitutes.added'));
      load();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const ready = form.substituteId && form.startsOn && form.endsOn && form.endsOn >= form.startsOn;
  const items = (data?.items || []).filter((item) => !item.past);
  const away = items.filter((item) => item.user.id === user.id);
  const standIn = items.filter((item) => item.substitute.id === user.id && item.user.id !== user.id);
  const others = all ? items.filter((item) => item.user.id !== user.id && item.substitute.id !== user.id) : [];
  const row = (item) => (
    <li key={item.id} className={`apr-sub${item.active ? ' is-active' : ''}`}>
      <Person person={item.user} />
      <span className="apr-sub__arrow">→</span>
      <Person person={item.substitute} />
      <span className="apr-sub__period">
        {day(item.startsOn)} — {day(item.endsOn)}
        {item.active && <em>{t('approvals.substitutes.now')}</em>}
      </span>
      {item.note && <span className="apr-sub__note">{item.note}</span>}
      {(item.user.id === user.id || all) && (
        <Popconfirm title={t('approvals.substitutes.removeConfirm')} onConfirm={() => approvalsApi.removeSubstitute(item.id).then(load).catch((err) => message.error(errorMessage(err)))} okText={t('common.delete')} cancelText={t('common.cancel')}>
          <Button type="text" danger size="small">
            {t('common.delete')}
          </Button>
        </Popconfirm>
      )}
    </li>
  );
  return (
    <div className="apr-subs">
      <div className="apr-subs__form">
        {all && (
          <label>
            <span>{t('approvals.substitutes.who')}</span>
            <PersonSelect value={form.userId} onChange={(userId) => setForm((prev) => ({ ...prev, userId }))} placeholder={t('approvals.substitutes.me')} allowClear />
          </label>
        )}
        <label>
          <span>{t('approvals.substitutes.substitute')}</span>
          <PersonSelect value={form.substituteId} onChange={(substituteId) => setForm((prev) => ({ ...prev, substituteId }))} exclude={[form.userId || user.id]} />
        </label>
        <label>
          <span>{t('approvals.substitutes.from')}</span>
          <DateField value={form.startsOn} onChange={(startsOn) => setForm((prev) => ({ ...prev, startsOn }))} />
        </label>
        <label>
          <span>{t('approvals.substitutes.to')}</span>
          <DateField value={form.endsOn} onChange={(endsOn) => setForm((prev) => ({ ...prev, endsOn }))} />
        </label>
        <label className="apr-subs__note">
          <span>{t('approvals.substitutes.note')}</span>
          <Input value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} maxLength={200} placeholder={t('approvals.substitutes.notePlaceholder')} />
        </label>
        <Button type="primary" onClick={add} disabled={!ready} loading={saving}>
          {t('approvals.substitutes.add')}
        </Button>
      </div>
      {!data ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : !items.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('approvals.substitutes.empty')} />
      ) : (
        <>
          {away.length > 0 && (
            <>
              <h4 className="apr-subs__h">{t('approvals.substitutes.myAway')}</h4>
              <ul className="apr-subs__list">{away.map(row)}</ul>
            </>
          )}
          {standIn.length > 0 && (
            <>
              <h4 className="apr-subs__h">{t('approvals.substitutes.iStandIn')}</h4>
              <ul className="apr-subs__list">{standIn.map(row)}</ul>
            </>
          )}
          {others.length > 0 && (
            <>
              <h4 className="apr-subs__h">{t('approvals.substitutes.others')}</h4>
              <ul className="apr-subs__list">{others.map(row)}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
