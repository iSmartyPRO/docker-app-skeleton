import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from 'antd';
import Segmented from '../../components/ui/Segmented';
import { useLocale } from '../../context/LocaleContext';
import { WidgetState } from '../dashboard/widgets/common';
import { empApi } from './api';
import { initials } from './lib';
import { localeTag } from '../../i18n/languages';

const dayMonth = (date, locale) => new Intl.DateTimeFormat(localeTag(locale), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

/** Dashboard widget «Дни рождения и годовщины» (spec §4.2); the module's privacy setting decides what shows. */
export default function CelebrationsWidget() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [mode, setMode] = useState('birthdays');
  const load = () => {
    setState((prev) => ({ ...prev, loading: true }));
    empApi
      .celebrations(14)
      .then((res) => setState({ data: res.data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error, loading: false }));
  };
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const data = state.data;
  const birthdaysOn = data && data.mode !== 'off';
  const current = !birthdaysOn ? 'anniversaries' : mode;
  const list = (current === 'birthdays' ? data?.birthdays : data?.anniversaries) || [];
  const when = (item) => (item.inDays === 0 ? t('emp.widget.today') : item.inDays === 1 ? t('emp.widget.tomorrow') : dayMonth(item.date, locale));
  return (
    <WidgetState state={{ ...state, reload: load }} empty={data && !list.length && !(birthdaysOn && data.anniversaries?.length) ? t('emp.widget.empty') : null} emptyIcon="gift">
      <div className="emp-widget">
        {birthdaysOn && (
          <Segmented
            size="small"
            block
            value={current}
            onChange={setMode}
            options={[
              { value: 'birthdays', label: `${t('emp.widget.birthdays')} · ${data?.birthdays?.length || 0}` },
              { value: 'anniversaries', label: `${t('emp.widget.anniversaries')} · ${data?.anniversaries?.length || 0}` },
            ]}
          />
        )}
        <ul className="emp-widget__list">
          {list.map((item) => (
            <li key={`${current}:${item.id}`}>
              <button type="button" onClick={() => navigate(`/app/employees/${item.id}`)}>
                <Avatar size={32} src={item.photoUrl || undefined}>
                  {initials(item.name)}
                </Avatar>
                <span className="emp-widget__text">
                  <strong>{item.name}</strong>
                  <em>{[item.position, item.unit].filter(Boolean).join(' · ')}</em>
                </span>
                <span className={`emp-widget__when${item.inDays === 0 ? ' is-today' : ''}`}>
                  {when(item)}
                  {current === 'anniversaries' && <small>{t('emp.widget.years', { n: item.years })}</small>}
                </span>
              </button>
            </li>
          ))}
          {!list.length && <li className="emp-muted emp-widget__none">{t('emp.widget.none')}</li>}
        </ul>
      </div>
    </WidgetState>
  );
}
