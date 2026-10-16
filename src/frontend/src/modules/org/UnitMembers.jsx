import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Select, Skeleton, Tooltip } from 'antd';
import { CloseOutlined, UserAddOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { orgApi, orgChanged } from './api';
import { useOrgPeople } from './HeadSelect';
import { knownError } from './errors';
import { initialsOf } from './lib';

/**
 * Portal accounts placed in a unit (the light «подразделение» of an account).
 * With the Employees module on, accounts linked to an employee card follow
 * the card and are edited there.
 */
export default function UnitMembers({ unit, employeesOn, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const people = useOrgPeople();
  const [members, setMembers] = useState(null);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState(null);
  const load = useCallback(() => {
    orgApi.members(unit.id).then((res) => setMembers(res.data.members)).catch(() => setMembers([]));
  }, [unit.id]);
  useEffect(() => {
    load();
  }, [load]);
  const options = useMemo(
    () => (people?.people || []).filter((person) => person.unitId !== unit.id).map((person) => ({ value: person.id, label: person.name, search: `${person.name} ${person.username}`.toLowerCase() })),
    [people, unit.id]
  );
  const place = async (userId, unitId) => {
    try {
      await orgApi.setPlacement(userId, { unitId });
      load();
      await onChanged?.();
      orgChanged();
    } catch (err) {
      message.error(knownError(err, t));
    }
  };
  return (
    <section className="org-members" data-tour="org.members">
      <div className="org-members__head">
        <h4>{t('org.members.title')}</h4>
        {!adding && (
          <Button size="small" icon={<UserAddOutlined />} onClick={() => setAdding(true)}>
            {t('org.members.add')}
          </Button>
        )}
      </div>
      <p className="org-muted">{employeesOn ? t('org.members.leadEmployees') : t('org.members.lead')}</p>
      {adding && (
        <div className="org-members__add">
          <Select
            showSearch
            autoFocus
            value={pick}
            onChange={setPick}
            options={options}
            placeholder={t('org.members.pick')}
            filterOption={(input, item) => String(item?.search || '').includes(input.toLowerCase())}
            style={{ flex: 1, minWidth: 180 }}
          />
          <Button
            type="primary"
            disabled={!pick}
            onClick={async () => {
              await place(pick, unit.id);
              setPick(null);
              setAdding(false);
            }}
          >
            {t('org.members.place')}
          </Button>
          <Button onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
        </div>
      )}
      {!members ? (
        <Skeleton active avatar paragraph={{ rows: 1 }} title={false} />
      ) : members.length ? (
        <ul className="org-members__list">
          {members.map((member) => (
            <li key={member.id}>
              <Avatar size={28} src={member.avatarUrl || undefined}>
                {initialsOf(member.name)}
              </Avatar>
              <span className="org-members__text">
                <strong>{member.name}</strong>
                <em>{member.position || member.username}</em>
              </span>
              {unit.head?.userId === member.id && <span className="org-members__badge">{t('org.members.head')}</span>}
              <Tooltip title={t('org.members.remove')}>
                <Button size="small" type="text" icon={<CloseOutlined />} aria-label={t('org.members.remove')} onClick={() => place(member.id, null)} />
              </Tooltip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="org-muted">{t('org.members.empty')}</p>
      )}
    </section>
  );
}
