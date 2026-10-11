import { App } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { kbApi, privateSource } from '../api';
import { atLeast } from '../KbContext';

/** Context-menu entries for a material, gated by the user's level on it. */
export function useItemActions({ onEdit, onMove, onAccess, onChanged }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const src = privateSource();

  return (item) => {
    const entries = [];
    if (item.kind === 'file') {
      entries.push({ key: 'download', label: <a href={src.file(item, { download: true })}>{t('kb.download')}</a> });
    }
    if (item.kind === 'link') {
      entries.push({ key: 'open', label: <a href={item.url} target="_blank" rel="noopener noreferrer">{t('kb.openLink')}</a> });
    }
    if (atLeast(item.level, 'edit')) {
      entries.push({ key: 'edit', label: item.kind === 'file' ? t('kb.rename') : t('kb.edit'), onClick: () => onEdit(item) });
      entries.push({ key: 'move', label: t('kb.move'), onClick: () => onMove(item) });
    }
    if (atLeast(item.level, 'manage')) {
      entries.push({ key: 'access', label: t('kb.access.menu'), onClick: () => onAccess(item) });
    }
    if (atLeast(item.level, 'edit')) {
      entries.push({ type: 'divider' });
      entries.push({
        key: 'delete',
        danger: true,
        label: t('common.delete'),
        onClick: () =>
          modal.confirm({
            title: t('kb.confirmDeleteItem', { name: item.title }),
            okText: t('common.delete'),
            okButtonProps: { danger: true },
            cancelText: t('common.cancel'),
            onOk: async () => {
              try {
                await kbApi.deleteItem(item.id);
                message.success(t('kb.deleted'));
                onChanged();
              } catch (err) {
                message.error(errorMessage(err));
              }
            },
          }),
      });
    }
    return entries;
  };
}
