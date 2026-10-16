import { Alert, Modal, Table, Tag } from 'antd';
import { useLocale } from '../../../../context/LocaleContext';

/** What a change did, account by account, when something failed. */
export default function ResultDialog({ result, onClose }) {
  const { t } = useLocale();
  if (!result) return null;
  const errorText = (item) => {
    const key = `folderAccess.errors.${item.code}`;
    return t(key) !== key ? t(key) : item.error;
  };
  return (
    <Modal open onCancel={onClose} onOk={onClose} cancelButtonProps={{ style: { display: 'none' } }} title={t('folderAccess.result.title')} width={640}>
      <Alert
        type={result.changed ? 'warning' : 'error'}
        showIcon
        message={t('folderAccess.result.summary', { changed: result.changed || 0, unchanged: result.unchanged || 0, failed: result.failed || 0 })}
        style={{ marginBottom: 12 }}
      />
      <Table
        size="small"
        rowKey={(item, index) => `${item.journalId || index}`}
        pagination={false}
        dataSource={result.results || []}
        columns={[
          { title: t('folderAccess.member'), dataIndex: 'member' },
          { title: t('folderAccess.group'), render: (_, item) => (item.toGroup ? `${item.group} → ${item.toGroup}` : item.group) },
          {
            title: t('folderAccess.journal.result'),
            render: (_, item) =>
              item.ok ? (
                <Tag color={item.outcome === 'changed' ? 'green' : 'default'}>{t(`folderAccess.outcome.${item.outcome}`)}</Tag>
              ) : (
                <span>
                  <Tag color="red">{t(`folderAccess.outcome.${item.outcome}`)}</Tag> {errorText(item)}
                  {item.rolledBack === false && <div className="fa-danger">{t('folderAccess.result.inBoth')}</div>}
                </span>
              ),
          },
        ]}
      />
      {result.skipped?.length > 0 && (
        <Alert type="info" showIcon style={{ marginTop: 12 }} message={t('folderAccess.result.skipped', { groups: result.skipped.map((item) => item.group).join(', ') })} />
      )}
    </Modal>
  );
}
