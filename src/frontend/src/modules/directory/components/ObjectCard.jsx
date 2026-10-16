import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Drawer, Dropdown, Empty, Grid, Result, Skeleton, Tabs, Tag, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  IdcardOutlined,
  KeyOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
  StopOutlined,
  SwapOutlined,
  UnlockOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { adApi, adError } from '../api';
import { useDirectory } from '../DirectoryContext';
import { Avatar, DateText, Field, KindIcon, LastLogon, PathText, ReadOnlyNote, StatusTags } from './Bits';
import { BulkDialog, EditDialog, EmployeeLinkDialog, GroupsDialog, MembersDialog, OuPickerDialog, PasswordDialog, PortalUserDialog } from './Dialogs';

const reasonText = (t, reason) => (reason ? t(`directory.actionOff.${reason}`) : null);

/** One action button: disabled with the reason as a tooltip (rights, protected account, secure channel…). */
function Action({ reason, icon, label, onClick, danger, primary, tour }) {
  const { t } = useLocale();
  if (reason === 'kind' || reason === 'rights') return null;
  const button = (
    <Button icon={icon} onClick={onClick} disabled={Boolean(reason)} danger={danger} type={primary ? 'primary' : 'default'} data-tour={tour}>
      {label}
    </Button>
  );
  return reason ? <Tooltip title={reasonText(t, reason)}>{button}</Tooltip> : button;
}

function History({ items }) {
  const { t } = useLocale();
  if (!items?.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('directory.history.empty')} />;
  return (
    <ol className="ad-history">
      {items.map((item) => (
        <li key={item.id} className={item.ok ? '' : 'is-failed'}>
          <div className="ad-history__head">
            <strong>{t(`directory.journal.action.${item.action}`)}</strong>
            <DateText value={item.at} time />
          </div>
          <div className="ad-muted">
            {item.user}
            {item.adAccount ? ` · ${t('directory.journal.as', { account: item.adAccount })}` : ''}
            {item.details?.group ? ` · ${item.details.group.name}` : ''}
            {!item.ok && item.errorCode ? ` · ${t(`directory.errors.${item.errorCode}`)}` : ''}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The card of a user, group or computer in a drawer: who, status, attributes, groups (with
 * their type; folder access groups and groups outside the root read-only), members of a
 * group, links to the portal account and the employee, history; actions by rights.
 */
export default function ObjectCard({ dn, onClose, onChanged, onOpen }) {
  const { t } = useLocale();
  const { modal } = App.useApp();
  const { info, change } = useDirectory();
  const screens = Grid.useBreakpoint();
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    if (!dn) return;
    try {
      setError(null);
      const { data } = await adApi.object(dn);
      setCard(data);
    } catch (err) {
      setError(adError(err, t));
    }
  }, [dn, t]);

  useEffect(() => {
    setCard(null);
    load();
  }, [load]);

  const changed = (newDn) => {
    onChanged?.();
    if (newDn && newDn !== dn) onOpen?.(newDn);
    else load();
  };
  const closeDialog = (done, newDn) => {
    setDialog(null);
    if (done) changed(newDn);
  };

  const object = card?.object;
  const actions = card?.actions || {};

  const confirm = (title, content, run, { danger = false, okText } = {}) =>
    modal.confirm({
      title,
      content,
      okText: okText || t('directory.confirm'),
      okButtonProps: { danger },
      cancelText: t('common.cancel'),
      onOk: async () => {
        const data = await run();
        if (data) changed();
      },
    });

  const toggleEnabled = () => {
    const disable = object.enabled !== false;
    confirm(
      t(disable ? 'directory.confirmDisable.title' : 'directory.confirmEnable.title', { name: object.name }),
      t(disable ? 'directory.confirmDisable.text' : 'directory.confirmEnable.text'),
      () => change(() => adApi.bulk({ action: disable ? 'disable' : 'enable', dns: [object.dn] })),
      { danger: disable }
    );
  };
  const unlock = () => confirm(t('directory.confirmUnlock.title', { name: object.name }), t('directory.confirmUnlock.text'), () => change(() => adApi.unlock(object.dn)));
  const removeFromGroup = (group) =>
    confirm(t('directory.confirmRemove.title'), t('directory.confirmRemove.text', { name: object.name, group: group.name }), () => change(() => adApi.members({ groups: [group.dn], members: [object.dn], action: 'remove' })), { danger: true });
  const removeMember = (member) =>
    confirm(t('directory.confirmRemove.title'), t('directory.confirmRemove.text', { name: member.name, group: object.name }), () => change(() => adApi.members({ groups: [object.dn], members: [member.dn], action: 'remove' })), { danger: true });
  const unlinkUser = () => confirm(t('directory.links.unlinkUserTitle'), t('directory.links.unlinkUserText', { user: card.portalUser.username }), () => change(() => adApi.portalUnlink(object.dn)), { danger: true });
  const unlinkEmployee = () => confirm(t('directory.links.unlinkEmployeeTitle'), t('directory.links.unlinkEmployeeText', { name: card.employee.name }), () => change(() => adApi.employeeUnlink(card.employee.id)), { danger: true });

  const more = [
    actions.portalUser !== 'kind' && !card?.portalUser && { key: 'portal', icon: <UserAddOutlined />, label: t('directory.links.portalTitle'), disabled: Boolean(actions.portalUser), onClick: () => setDialog('portal') },
    card?.portalUser && actions.portalUser === null && { key: 'unlinkUser', icon: <LinkOutlined />, label: t('directory.links.unlinkUser'), onClick: unlinkUser },
    actions.employee !== 'kind' && !card?.employee && { key: 'employee', icon: <IdcardOutlined />, label: t('directory.links.employeeTitle'), disabled: Boolean(actions.employee), onClick: () => setDialog('employee') },
    card?.employee && actions.employee === null && { key: 'unlinkEmployee', icon: <IdcardOutlined />, label: t('directory.links.unlinkEmployee'), onClick: unlinkEmployee },
  ].filter(Boolean);

  const userTabs = object && [
    {
      key: 'overview',
      label: t('directory.card.overview'),
      children: (
        <dl className="ad-fields">
          {object.kind !== 'group' && <Field label={t('directory.attr.sAMAccountName')}>{object.login}</Field>}
          {object.kind === 'user' && <Field label={t('directory.attr.userPrincipalName')}>{object.upn}</Field>}
          {object.kind !== 'computer' && <Field label={t('directory.attr.mail')}>{object.mail}</Field>}
          {object.kind === 'user' && (
            <>
              <Field label={t('directory.attr.title')}>{object.title}</Field>
              <Field label={t('directory.attr.department')}>{object.department}</Field>
              <Field label={t('directory.attr.company')}>{object.company}</Field>
              <Field label={t('directory.attr.manager')}>{card.manager ? card.manager.inScope && card.manager.dn ? <a onClick={() => onOpen?.(card.manager.dn)}>{card.manager.name}</a> : card.manager.name : null}</Field>
              <Field label={t('directory.attr.telephoneNumber')}>{object.phone}</Field>
              <Field label={t('directory.attr.mobile')}>{object.mobile}</Field>
              <Field label={t('directory.attr.physicalDeliveryOfficeName')}>{object.office}</Field>
            </>
          )}
          {object.kind === 'computer' && (
            <>
              <Field label={t('directory.attr.dNSHostName')}>{object.host}</Field>
              <Field label={t('directory.attr.operatingSystem')}>{object.os}</Field>
            </>
          )}
          {object.kind === 'group' && card.group && (
            <Field label={t('directory.group.type')}>
              {t(card.group.security ? 'directory.group.security' : 'directory.group.distribution')} · {t(`directory.group.scope.${card.group.groupScope || 'global'}`)}
            </Field>
          )}
          <Field label={t('directory.attr.description')} wide>{object.description}</Field>
          <Field label={t('directory.card.ou')} wide><PathText path={object.path} /></Field>
          {object.kind !== 'group' && (
            <>
              <Field label={t('directory.card.lastLogon')}><LastLogon value={object.lastLogon} inactiveDays={info?.settings?.inactiveDays} /></Field>
              {object.kind === 'user' && <Field label={t('directory.card.pwdLastSet')}>{object.mustChange ? t('directory.status.mustChange') : <DateText value={object.pwdLastSet} />}</Field>}
              {object.kind === 'user' && <Field label={t('directory.card.pwdExpires')}>{object.pwdNeverExpires ? t('directory.card.never') : <DateText value={object.pwdExpires} />}</Field>}
            </>
          )}
          <Field label={t('directory.card.created')}><DateText value={object.created} /></Field>
          <Field label={t('directory.card.dn')} wide><code className="ad-dn">{object.dn}</code></Field>
        </dl>
      ),
    },
    object.kind !== 'group' && {
      key: 'groups',
      label: `${t('directory.card.groups')} · ${card.groups.length}`,
      children: (
        <div className="ad-groups" data-tour="directory.groups">
          {actions.groups === null && (
            <Button icon={<PlusOutlined />} onClick={() => setDialog('groups')} className="ad-gap">
              {t('directory.groups.addTitle')}
            </Button>
          )}
          {card.groups.length ? (
            <ul className="ad-list">
              {card.groups.map((group) => (
                <li key={group.dn || group.name}>
                  <KindIcon kind="group" />
                  <div className="ad-list__main">
                    {group.dn && group.place === 'inside' && !group.drive ? <a onClick={() => onOpen?.(group.dn)}>{group.name}</a> : <span>{group.name}</span>}
                    <span className="ad-muted">
                      {t(group.security ? 'directory.group.security' : 'directory.group.distribution')}
                      {group.groupScope ? ` · ${t(`directory.group.scope.${group.groupScope}`)}` : ''}
                    </span>
                    <ReadOnlyNote reason={group.readOnly} />
                    {group.drive && info?.drive?.access && (
                      <Link to={`/app/drive/access/person?dn=${encodeURIComponent(object.dn)}`} className="ad-link-small">
                        {t('directory.groups.openAccess')}
                      </Link>
                    )}
                  </div>
                  {group.editable && actions.groups === null && <Button type="text" danger icon={<DeleteOutlined />} aria-label={t('directory.groups.remove')} onClick={() => removeFromGroup(group)} />}
                </li>
              ))}
            </ul>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('directory.groups.none')} />
          )}
        </div>
      ),
    },
    object.kind === 'group' && {
      key: 'members',
      label: `${t('directory.card.members')} · ${card.memberTotal || 0}`,
      children: (
        <div className="ad-groups">
          {card.group?.readOnly && <Alert type="info" showIcon className="ad-gap" message={t(`directory.readOnly.${card.group.readOnly}`)} />}
          {card.group?.editable && (
            <Button icon={<PlusOutlined />} onClick={() => setDialog('members')} className="ad-gap">
              {t('directory.groups.addMembersShort')}
            </Button>
          )}
          {card.members?.length ? (
            <ul className="ad-list">
              {card.members.map((member, index) => (
                <li key={member.dn || index}>
                  <KindIcon kind={member.kind} />
                  <div className="ad-list__main">
                    {member.dn && member.place === 'inside' ? <a onClick={() => onOpen?.(member.dn)}>{member.name}</a> : <span>{member.name}</span>}
                    <span className="ad-muted">{[member.login, member.place !== 'inside' ? t(`directory.place.${member.place}`) : null, member.enabled === false ? t('directory.status.disabled') : null].filter(Boolean).join(' · ')}</span>
                  </div>
                  {card.group?.editable && member.dn && <Button type="text" danger icon={<DeleteOutlined />} aria-label={t('directory.groups.remove')} onClick={() => removeMember(member)} />}
                </li>
              ))}
            </ul>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('directory.groups.noMembers')} />
          )}
          {card.memberTotal > (card.members?.length || 0) && <p className="ad-note">{t('directory.groups.moreMembers', { n: card.memberTotal - card.members.length })}</p>}
        </div>
      ),
    },
    {
      key: 'history',
      label: t('directory.card.history'),
      children: <History items={card.history} />,
    },
  ].filter(Boolean);

  return (
    <Drawer open={Boolean(dn)} onClose={onClose} width={screens.md ? 600 : '100%'} destroyOnHidden className="ad-drawer" title={null} closable={false} styles={{ body: { padding: 0 } }}>
      {error && <Result status="warning" title={error} extra={<Button onClick={onClose}>{t('common.close')}</Button>} />}
      {!error && !card && (
        <div className="ad-card__pad">
          <Skeleton avatar active paragraph={{ rows: 8 }} />
        </div>
      )}
      {card && object && (
        <div className="ad-card" data-tour="directory.card">
          <header className="ad-card__head">
            <button type="button" className="ad-card__close" onClick={onClose} aria-label={t('common.close')}>
              ×
            </button>
            <Avatar object={object} size={64} />
            <div className="ad-card__who">
              <span className="ad-card__kind">
                <KindIcon kind={object.kind} /> {t(`directory.kind.${object.kind}`)}
                {card.mode === 'demo' && <Tag className="ad-tag ad-tag--demo">{t('directory.demoBadge')}</Tag>}
              </span>
              <h2>{object.name}</h2>
              <div className="ad-muted">{[object.login, object.kind === 'user' ? object.upn : null].filter(Boolean).join(' · ')}</div>
              <StatusTags object={object} />
              <div className="ad-chips">
                {card.portalUser && (
                  <Link className="ad-chip" to={`/admin/users/${card.portalUser.id}`}>
                    <LinkOutlined /> {t('directory.links.portalChip', { user: card.portalUser.username })}
                  </Link>
                )}
                {card.employee && (
                  <Link className="ad-chip" to={`/app/employees/${card.employee.id}`}>
                    <IdcardOutlined /> {card.employee.name}
                  </Link>
                )}
              </div>
            </div>
          </header>
          <div className="ad-card__actions" data-tour="directory.actions">
            <Action reason={actions.edit} icon={<EditOutlined />} label={t('directory.actions.edit')} onClick={() => setDialog('edit')} />
            {object.kind === 'user' && <Action reason={actions.password} icon={<KeyOutlined />} label={t('directory.actions.password')} onClick={() => setDialog('password')} tour="directory.password" />}
            {object.locked && <Action reason={actions.unlock} icon={<UnlockOutlined />} label={t('directory.actions.unlock')} onClick={unlock} />}
            {object.kind !== 'group' && (
              <Action reason={actions.enable} icon={object.enabled === false ? <CheckCircleOutlined /> : <StopOutlined />} label={t(object.enabled === false ? 'directory.actions.enable' : 'directory.actions.disable')} onClick={toggleEnabled} danger={object.enabled !== false} />
            )}
            <Action reason={actions.move} icon={<SwapOutlined />} label={t('directory.actions.move')} onClick={() => setDialog('move')} />
            {more.length > 0 && (
              <Dropdown menu={{ items: more }} trigger={['click']}>
                <Button icon={<MoreOutlined />} aria-label={t('directory.actions.more')} />
              </Dropdown>
            )}
          </div>
          {object.protected && <Alert className="ad-card__note" type="info" showIcon message={t('directory.protectedNote')} />}
          {actions.password === 'secure' && object.kind === 'user' && <Alert className="ad-card__note" type="warning" showIcon message={t('directory.channel.unavailable')} description={t('directory.channel.unavailableShort')} />}
          <Tabs className="ad-card__tabs" items={userTabs} />
        </div>
      )}
      {object && (
        <>
          <PasswordDialog open={dialog === 'password'} object={object} onClose={(done) => closeDialog(done)} />
          <EditDialog open={dialog === 'edit'} object={object} managerName={card?.manager?.name} onClose={(done) => closeDialog(done)} />
          <GroupsDialog open={dialog === 'groups'} object={object} onClose={(done) => closeDialog(done)} />
          <MembersDialog open={dialog === 'members'} group={object} onClose={(done) => closeDialog(done)} />
          <EmployeeLinkDialog open={dialog === 'employee'} object={object} onClose={(done) => closeDialog(done)} />
          <PortalUserDialog open={dialog === 'portal'} object={object} onClose={(done) => closeDialog(done)} />
          <OuPickerDialog
            open={dialog === 'move'}
            current={object.parentDn}
            title={t('directory.move.title', { name: object.name })}
            okText={t('directory.move.next')}
            onClose={() => setDialog(null)}
            onPick={(ou) => setDialog({ kind: 'moveConfirm', ou })}
          />
          <BulkDialog
            open={dialog?.kind === 'moveConfirm'}
            action="move"
            dns={dialog?.kind === 'moveConfirm' ? [object.dn] : null}
            targetOu={dialog?.ou?.dn}
            onClose={(done) => {
              const target = dialog?.ou?.dn;
              setDialog(null);
              if (done) {
                onChanged?.();
                const rdn = String(object.dn).match(/^((?:\\.|[^,\\])+)/)?.[1];
                if (rdn && target) onOpen?.(`${rdn},${target}`);
              }
            }}
          />
        </>
      )}
    </Drawer>
  );
}
