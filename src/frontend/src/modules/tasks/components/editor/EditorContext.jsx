import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import QuickTask from './QuickTask';
import TaskPanel from './TaskPanel';

/*
 * Opens task forms from anywhere in the tasks app: the quick form, the full
 * form (new task) and a task's card. Pages listen to `version` to reload
 * their lists after a change.
 */

const EditorContext = createContext(null);

export function TaskEditorProvider({ children }) {
  const [quick, setQuick] = useState({ open: false, initial: null });
  const [panel, setPanel] = useState({ open: false, ref: null, draft: null, onClose: null });
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((n) => n + 1), []);

  const openQuick = useCallback((initial = null) => setQuick({ open: true, initial }), []);
  const openFull = useCallback((draft = null) => {
    setQuick({ open: false, initial: null });
    setPanel({ open: true, ref: null, draft: draft || {}, onClose: null });
  }, []);
  const openTask = useCallback((ref, onClose = null) => setPanel({ open: true, ref, draft: null, onClose }), []);
  const close = useCallback(() => {
    setPanel((prev) => {
      prev.onClose?.();
      return { open: false, ref: null, draft: null, onClose: null };
    });
  }, []);

  const value = useMemo(() => ({ openQuick, openFull, openTask, close, version, bump }), [openQuick, openFull, openTask, close, version, bump]);
  return (
    <EditorContext.Provider value={value}>
      {children}
      <QuickTask
        open={quick.open}
        initial={quick.initial}
        onClose={() => setQuick({ open: false, initial: null })}
        onCreated={() => {
          setQuick({ open: false, initial: null });
          bump();
        }}
        onFull={openFull}
      />
      <TaskPanel open={panel.open} taskRef={panel.ref} initialDraft={panel.draft} onClose={close} onChanged={bump} onDeleted={bump} />
    </EditorContext.Provider>
  );
}

export const useTaskEditor = () => useContext(EditorContext);
