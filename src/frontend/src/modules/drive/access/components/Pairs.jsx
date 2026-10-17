import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Dropdown, Empty, Popconfirm, Table, Tag, Tooltip } from 'antd';
import { ArrowRightOutlined, DeleteOutlined, EditOutlined, LockOutlined, MoreOutlined, UserAddOutlined } from '@ant-design/icons';
import { useLocale } from '../../../../context/LocaleContext';
import { faApi, folderUrl, personUrl } from '../api';
import { useAccess } from '../AccessContext';
import { ReviewTag, StatusTag, TypeTag } from './Bits';
import PersonSelect from './PersonSelect';

const OTHER = { full: 'read', read: 'full' };

/** One group of a pair: its members, add / remove / move to the other group of the pair. */
export function GroupColumn({ slot, group, members, otherGroup, onChanged, onDescribe, onDelete, compact = false }) {
  const { t } = useLocale();
  const { info, change } = useAccess();
  const [selected, setSelected] = useState([]);
  const [adding, setAdding] = useState([]);
  const [busy, setBusy] = useState(false);
  const editable = Boolean(group.editable && info?.canWrite);
  const canMove = editable && otherGroup?.editable;
  const superadmin = info?.role === 'superadmin' && info?.canWrite;

  const run = async (fn) => {
    setBusy(true);
    const data = await change(fn);
    setBusy(false);
    if (data) {
      setSelected([]);
      setAdding([]);
      onChanged();
    }
  };
  const add = () => run(() => faApi.members(group.dn, adding, 'add'));
  const remove = (dns) => run(() => faApi.members(group.dn, dns, 'remove'));
  const move = (dns) => run(() => faApi.move(group.dn, otherGroup.dn, dns));

  return (
    <section className={`panel fa-col${compact ? ' is-compact' : ''}`}>
      <header className="fa-col__head">
        <div>
          <div className="fa-col__title">
            {slot === 'other' ? null : <TypeTag type={slot === 'unknown' ? group.type : slot} />}
            <code>{group.name}</code>
            {!group.editable && (
              <Tooltip title={t('folderAccess.protected')}>
                <LockOutlined className="fa-lock" />
              </Tooltip>
            )}
            <ReviewTag issues={group.issues} />
          </div>
          <div className="fa-muted fa-col__desc">{group.description || t('folderAccess.noDescription')}</div>
        </div>
        <span className="fa-col__count">{members.length}</span>
        {superadmin && onDescribe && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'describe', icon: <EditOutlined />, label: t('folderAccess.describe.action'), onClick: () => onDescribe(group) },
                { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('folderAccess.delete.action'), onClick: () => onDelete({ ...group, memberCount: members.length }) },
              ],
            }}
          >
            <Button type="text" icon={<MoreOutlined />} aria-label={t('folderAccess.more')} />
          </Dropdown>
        )}
      </header>
      {editable && (
        <div className="fa-add">
          <PersonSelect mode="multiple" value={adding} onChange={setAdding} kind={info?.role === 'superadmin' ? 'all' : 'user'} exclude={members.map((member) => member.dn)} style={{ flex: 1 }} />
          <Button type="primary" icon={<UserAddOutlined />} disabled={!adding.length} loading={busy} onClick={add}>
            {t('folderAccess.add')}
          </Button>
        </div>
      )}
      {editable && selected.length > 0 && (
        <div className="fa-selection">
          <span>{t('folderAccess.selected', { n: selected.length })}</span>
          {canMove && (
            <Button size="small" icon={<ArrowRightOutlined />} onClick={() => move(selected)} loading={busy}>
              {t('folderAccess.moveTo', { type: t(`folderAccess.type.${OTHER[slot]}`) })}
            </Button>
          )}
          <Popconfirm title={t('folderAccess.removeConfirm', { count: selected.length })} onConfirm={() => remove(selected)}>
            <Button size="small" danger icon={<DeleteOutlined />} loading={busy}>
              {t('folderAccess.remove')}
            </Button>
          </Popconfirm>
        </div>
      )}
      <Table
        size="small"
        rowKey="dn"
        dataSource={members}
        pagination={{ pageSize: compact ? 50 : 100, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('folderAccess.noMembers')} /> }}
        rowSelection={editable ? { selectedRowKeys: selected, onChange: setSelected } : undefined}
        columns={[
          {
            title: t('folderAccess.personCol'),
            render: (_, person) => (
              <div className="fa-person-cell">
                <Link to={personUrl(person.dn)}>{person.name}</Link>
                <span className="fa-muted">{[person.login, person.kind !== 'user' && person.kind !== 'unknown' ? t(`folderAccess.kind.${person.kind}`) : null, compact ? person.department : null].filter(Boolean).join(' · ')}</span>
              </div>
            ),
          },
          !compact && { title: t('folderAccess.department'), dataIndex: 'department', responsive: ['lg'], render: (value) => value || <span className="fa-muted">—</span> },
          { title: t('folderAccess.status'), width: 104, responsive: compact ? ['sm'] : undefined, render: (_, person) => <StatusTag person={person} /> },
          editable && {
            title: '',
            width: 84,
            render: (_, person) => (
              <span className="fa-row-actions">
                {canMove && (
                  <Tooltip title={t('folderAccess.moveTo', { type: t(`folderAccess.type.${OTHER[slot]}`) })}>
                    <Button size="small" type="text" icon={<ArrowRightOutlined />} onClick={() => move([person.dn])} aria-label={t('folderAccess.moveTo', { type: t(`folderAccess.type.${OTHER[slot]}`) })} />
                  </Tooltip>
                )}
                <Popconfirm title={t('folderAccess.removeOne', { name: person.name })} onConfirm={() => remove([person.dn])}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('folderAccess.remove')} />
                </Popconfirm>
              </span>
            ),
          },
        ].filter(Boolean)}
      />
    </section>
  );
}

const SLOTS = ['full', 'read', 'unknown', 'other'];

/** A group pair (_full / _read) with both member lists side by side. */
export function PairBlock({ pair, members, onChanged, onDescribe, onDelete, compact = false, showHead = true }) {
  const { t } = useLocale();
  const slots = SLOTS.filter((slot) => pair.groups[slot]);
  return (
    <div className="fa-pair">
      {showHead && (
        <div className="fa-pair__head">
          <span className="fa-pair__name">{pair.kind === 'other' ? pair.name : `${pair.code ? `${pair.code} · ` : ''}${pair.name}`}</span>
          {pair.project && <Tag bordered={false}>{pair.project}</Tag>}
          {(pair.root || pair.protected) && (
            <Tooltip title={t('folderAccess.protected')}>
              <LockOutlined className="fa-lock" />
            </Tooltip>
          )}
          <ReviewTag issues={pair.needsReview ? pair.issues : []} />
        </div>
      )}
      <div className={`fa-cols${slots.length === 1 ? ' is-single' : ''}${compact ? ' is-compact' : ''}`}>
        {slots.map((slot) => (
          <GroupColumn
            key={slot}
            slot={slot}
            group={pair.groups[slot]}
            members={members?.[pair.groups[slot].dn] || []}
            otherGroup={OTHER[slot] ? pair.groups[OTHER[slot]] : null}
            onChanged={onChanged}
            onDescribe={onDescribe}
            onDelete={onDelete}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

/** Folders above that also open this one (their groups' access reaches down): read-only, nearest first. */
export function InheritedList({ folders }) {
  const { t } = useLocale();
  if (!folders?.length) return null;
  return (
    <section className="fa-inherited">
      <h4>{t('folderAccess.panel.inheritedTitle')}</h4>
      <p className="fa-muted">{t('folderAccess.panel.inheritedLead')}</p>
      <ul>
        {folders.map((folder) => (
          <li key={folder.key}>
            <div className="fa-inherited__path">
              <span className="fa-muted">{t('folderAccess.panel.inheritedFrom')}</span> <Link to={folderUrl(folder.key)}>{folder.path}</Link>
              {(folder.root || folder.protected) && <LockOutlined className="fa-lock" />}
            </div>
            <div className="fa-inherited__groups">
              {folder.pairs.flatMap((pair) =>
                ['full', 'read', 'unknown'].filter((slot) => pair.groups[slot]).map((slot) => (
                  <span key={pair.groups[slot].dn} className="fa-inherited__group">
                    <TypeTag type={pair.groups[slot].type} />
                    <code>{pair.groups[slot].name}</code>
                    <span className="fa-muted">{t('folderAccess.panel.members', { count: pair.groups[slot].memberCount })}</span>
                  </span>
                ))
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
