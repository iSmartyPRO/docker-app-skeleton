/**
 * Online editor (Collabora) availability for a file, from the module config
 * the server sends (`config.editor`: { enabled, openByDefault, edit: [ext], view: [ext] }).
 * → 'edit' | 'view' | null
 */
export function editorMode(editor, ext, canWrite) {
  if (!editor?.enabled || !ext) return null;
  const type = String(ext).toLowerCase();
  if (canWrite && editor.edit?.includes(type)) return 'edit';
  if (editor.view?.includes(type) || editor.edit?.includes(type)) return 'view';
  return null;
}

/** Whether opening the file (click / Enter) should start the editor instead of the preview. */
export function opensInEditor(editor, ext) {
  return Boolean(editor?.enabled && editor.openByDefault !== false && ext && (editor.edit?.includes(String(ext).toLowerCase()) || editor.view?.includes(String(ext).toLowerCase())));
}
