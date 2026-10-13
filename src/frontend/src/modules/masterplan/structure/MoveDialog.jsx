import { useEffect, useMemo, useState } from 'react';
import { App, Alert, Modal, TreeSelect } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { mpApi } from '../api';
import { iconOf, nodeLabel } from '../lib';

/**
 * Moves several nodes of the tree under one parent at once (e.g. ten houses
 * into another sector) — the server checks every node as a single move and
 * moves all of them or none. `open` = { ids } | null; `tree` = indexTree().
 */
/** The most nodes one bulk move takes (the server refuses more: nodes.js BULK_MOVE_MAX). */
export const BULK_MOVE_MAX = 500;

export default function MoveDialog({ open, tree, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    setTarget(null);
    setError(null);
  }, [open]);

  // Possible parents: not a unit, not one of the chosen nodes or inside them.
  const treeData = useMemo(() => {
    if (!open) return [];
    const chosen = new Set(open.ids);
    const build = (parentId) =>
      tree
        .kids(parentId)
        .filter((node) => node.kind !== 'unit' && !chosen.has(node.id))
        .map((node) => ({ value: node.id, title: `${iconOf(node)} ${nodeLabel(node)}`, children: build(node.id) }));
    return [{ value: 0, title: t('mp.move.root'), children: build(0) }];
  }, [open, tree, t]);

  if (!open) return null;
  const submit = async () => {
    if (target === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await mpApi.bulkMove({ ids: open.ids, parentId: target || null });
      message.success(t('mp.move.done', { n: res.data.moved }));
      onClose(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={t('mp.move.title', { n: open.ids.length })} onCancel={() => onClose(false)} onOk={submit} okText={t('mp.move.apply')} cancelText={t('common.cancel')} okButtonProps={{ disabled: target === null }} confirmLoading={busy} destroyOnClose>
      <p className="dialog-lead">{t('mp.move.lead')}</p>
      {error && <Alert type="error" showIcon message={error} className="mp-dlg-alert" />}
      <label className="mp-ffield">
        <span>{t('mp.move.target')}</span>
        <TreeSelect value={target} onChange={setTarget} treeData={treeData} treeDefaultExpandedKeys={[0]} showSearch treeNodeFilterProp="title" placeholder={t('mp.action.choose')} style={{ width: '100%' }} popupMatchSelectWidth={false} />
      </label>
    </Modal>
  );
}
