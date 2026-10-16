import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Avatar, Button, Input, Skeleton, Tag } from 'antd';
import { IdcardOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { orgApi, orgChanged } from './api';
import UnitSelect from './UnitSelect';
import { knownError } from './errors';
import { initialsOf } from './lib';

/**
 * «Оргструктура» block of Users → a person: the unit and position of the
 * account. With the Employees module on and a linked card, it shows the
 * employee and follows the card (edited there).
 */
export default function UserPlacement({ userId, canEdit }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [unitId, setUnitId] = useState(null);
  const [position, setPosition] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    orgApi
      .placement(userId)
      .then((res) => {
        setData(res.data.placement);
        setUnitId(res.data.placement.unit?.id || null);
        setPosition(res.data.placement.position || '');
      })
      .catch(() => setData(false));
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);
  if (data === false) return null;
  if (!data) return <Skeleton active paragraph={{ rows: 2 }} title={false} />;
  const dirty = (unitId || null) !== (data.unit?.id || null) || (position || '') !== (data.position || '');
  const save = async () => {
    setBusy(true);
    try {
      await orgApi.setPlacement(userId, { unitId, position });
      message.success(t('common.saved'));
      orgChanged();
      load();
    } catch (err) {
      message.error(knownError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="org-placement" data-testid="user-placement">
      {data.employee && (
        <Link to={`/app/employees/${data.employee.id}`} className="org-placement__employee">
          <Avatar size={36} src={data.employee.photoUrl || undefined}>
            {initialsOf(data.employee.name)}
          </Avatar>
          <span className="org-placement__text">
            <strong>{data.employee.name}</strong>
            <em>{[data.employee.position, data.unit?.path?.join(' / ')].filter(Boolean).join(' · ') || t('org.placement.noUnit')}</em>
          </span>
          <Tag bordered={false} color="blue" icon={<IdcardOutlined />}>
            {t('org.placement.employeeCard')}
          </Tag>
        </Link>
      )}
      {data.managed ? (
        <p className="org-muted">{t('org.placement.managed')}</p>
      ) : (
        <div className="org-placement__form">
          <label>
            <span>{t('org.placement.unit')}</span>
            <UnitSelect value={unitId} onChange={setUnitId} disabled={!canEdit} placeholder={t('org.placement.noUnit')} />
          </label>
          <label>
            <span>{t('org.placement.position')}</span>
            <Input value={position} onChange={(event) => setPosition(event.target.value)} maxLength={160} disabled={!canEdit} placeholder={t('org.placement.positionPlaceholder')} />
          </label>
          {canEdit && (
            <Button type="primary" disabled={!dirty} loading={busy} onClick={save}>
              {t('common.save')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
