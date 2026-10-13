import { Router } from 'express';
import { getSettings, parseSettings } from '../../services/settings.js';
import { contextFromRequest, httpError, intId, listSubjects, wrap } from '../shared/acl.js';
import {
  calendarFeed,
  checkKey,
  checkMoveToProject,
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  getProject,
  getProjectAccess,
  getTask,
  listProjects,
  listTasks,
  moveTaskToProject,
  overview,
  saveStatuses,
  setProjectAccess,
  setWatching,
  statusOfProject,
  suggestKey,
  updateProject,
  updateTask,
} from './service.js';
import {
  addChecklist,
  addChecklistItem,
  addDep,
  addLink,
  addReminder,
  addResult,
  bulkChecklist,
  copyTask,
  delegateTask,
  deleteChecklist,
  deleteChecklistItem,
  deleteReminder,
  deleteResult,
  formPayload,
  linkTaskFile,
  rateTask,
  removeDep,
  removeLink,
  removeTaskFile,
  reorderChecklist,
  sendTaskFile,
  setFavorite,
  startTask,
  storeTaskFiles,
  taskUploader,
  timer,
  updateChecklist,
  updateChecklistItem,
} from './extras.js';
import { addField, createRecurring, deleteField, deleteFlow, deleteTemplate, listFields, listFlows, listTemplates, saveFlow, saveTemplate } from './templates.js';

async function moduleSettings() {
  return parseSettings(await getSettings()).modules.tasks.settings;
}

function runUpload(upload, req, res) {
  return new Promise((done, fail) => {
    upload(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') fail(httpError(413, 'File is too large', 'FILE_TOO_LARGE'));
      else if (err) fail(err);
      else done(req.files || []);
    });
  });
}

/** /api/app/tasks — signed-in users; access is checked per project and per task. */
export function privateRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    req.tasks = contextFromRequest(req, 'tasks.admin');
    next();
  });

  router.get('/', wrap(async (req, res) => {
    const settings = await moduleSettings();
    res.json({
      success: true,
      ...(await overview(req.tasks)),
      config: {
        canCreateProjects: settings.projectCreation !== 'admins' || req.tasks.isAdmin,
        defaultView: settings.defaultView,
        isAdmin: req.tasks.isAdmin,
        chat: Boolean(parseSettings(await getSettings()).modules.chat?.enabled),
      },
    });
  }));

  // Projects
  router.get('/projects', wrap(async (req, res) => res.json({ success: true, projects: await listProjects(req.tasks, { archived: req.query.archived === '1' }) })));
  router.get('/projects/key', wrap(async (req, res) => {
    if (req.query.from) return res.json({ success: true, key: await suggestKey(req.query.from), available: true });
    return res.json({ success: true, ...(await checkKey(req.query.key)) });
  }));
  router.post('/projects', wrap(async (req, res) => {
    const settings = await moduleSettings();
    const project = await createProject(req.tasks, req.body || {}, { locale: req.locale, allowed: settings.projectCreation !== 'admins' || req.tasks.isAdmin });
    res.status(201).json({ success: true, project });
  }));
  router.get('/projects/:ref', wrap(async (req, res) => res.json({ success: true, ...(await getProject(req.tasks, req.params.ref)) })));
  router.put('/projects/:ref', wrap(async (req, res) => res.json({ success: true, ...(await updateProject(req.tasks, req.params.ref, req.body || {})) })));
  router.delete('/projects/:ref', wrap(async (req, res) => {
    await deleteProject(req.tasks, req.params.ref);
    res.json({ success: true });
  }));
  router.put('/projects/:ref/statuses', wrap(async (req, res) => res.json({ success: true, ...(await saveStatuses(req.tasks, req.params.ref, req.body?.statuses)) })));
  router.get('/projects/:ref/access', wrap(async (req, res) => res.json({ success: true, entries: await getProjectAccess(req.tasks, req.params.ref) })));
  router.put('/projects/:ref/access', wrap(async (req, res) => res.json({ success: true, entries: await setProjectAccess(req.tasks, req.params.ref, req.body?.entries) })));
  router.get('/subjects', wrap(async (req, res) => res.json({ success: true, ...(await listSubjects()) })));

  // Tasks
  router.get('/tasks', wrap(async (req, res) => {
    const tasks = await listTasks(req.tasks, req.query);
    res.json({ success: true, tasks, ...(tasks.truncated ? { truncated: true } : {}) });
  }));
  router.get('/calendar', wrap(async (req, res) => {
    res.json({ success: true, tasks: await calendarFeed(req.tasks, { from: req.query.from, to: req.query.to, mine: req.query.mine === '1', scope: ['doing', 'participant', 'all'].includes(req.query.scope) ? req.query.scope : undefined, done: req.query.done !== '0' }) });
  }));
  router.post('/tasks', wrap(async (req, res) => {
    const body = req.body || {};
    if (body.recurrence) {
      const { task, template } = await createRecurring(req.tasks, body, body.recurrence);
      res.status(201).json({ success: true, task, template });
      return;
    }
    res.status(201).json({ success: true, task: await createTask(req.tasks, body) });
  }));
  router.get('/tasks/:ref', wrap(async (req, res) => res.json({ success: true, task: await getTask(req.tasks, req.params.ref) })));
  router.put('/tasks/:ref', wrap(async (req, res) => {
    const { projectId, ...rest } = req.body || {};
    const move = projectId !== undefined ? await checkMoveToProject(req.tasks, req.params.ref, projectId) : null;
    if (!move || move.same) {
      res.json({ success: true, task: await updateTask(req.tasks, move ? move.row.id : req.params.ref, rest) });
      return;
    }
    // The other fields go first, in the current project: if they fail, the task stays where it was.
    // A status is applied after the move, and only when it belongs to the new project
    // (one of the old project is ignored: the move keeps the status category).
    const { statusId, ...fields } = rest;
    await updateTask(req.tasks, move.row.id, fields);
    let task = await moveTaskToProject(req.tasks, move.row.id, projectId);
    if (await statusOfProject(statusId, move.target.id)) task = await updateTask(req.tasks, move.row.id, { statusId: Number(statusId) });
    res.json({ success: true, task });
  }));
  router.delete('/tasks/:ref', wrap(async (req, res) => {
    await deleteTask(req.tasks, req.params.ref);
    res.json({ success: true });
  }));
  router.put('/tasks/:ref/watch', wrap(async (req, res) => res.json({ success: true, watching: await setWatching(req.tasks, req.params.ref, Boolean(req.body?.on)) })));
  router.put('/tasks/:ref/favorite', wrap(async (req, res) => res.json({ success: true, favorite: await setFavorite(req.tasks, req.params.ref, Boolean(req.body?.on)) })));
  router.post('/tasks/:ref/start', wrap(async (req, res) => res.json({ success: true, task: await startTask(req.tasks, req.params.ref) })));
  router.post('/tasks/:ref/delegate', wrap(async (req, res) => res.json({ success: true, task: await delegateTask(req.tasks, req.params.ref, req.body?.userId) })));
  router.post('/tasks/:ref/rate', wrap(async (req, res) => res.json({ success: true, ...(await rateTask(req.tasks, req.params.ref, req.body || {})) })));
  router.post('/tasks/:ref/copy', wrap(async (req, res) => res.status(201).json({ success: true, task: await copyTask(req.tasks, req.params.ref, req.body || {}) })));
  router.get('/tasks/:ref/form', wrap(async (req, res) => res.json({ success: true, payload: await formPayload(req.tasks, req.params.ref) })));
  router.post('/tasks/:ref/timer', wrap(async (req, res) => res.json({ success: true, time: await timer(req.tasks, req.params.ref, req.body?.action) })));

  // Checklists
  router.post('/tasks/:ref/checklists', wrap(async (req, res) => res.status(201).json({ success: true, ...(await addChecklist(req.tasks, req.params.ref, req.body || {})) })));
  router.put('/checklists/:id', wrap(async (req, res) => {
    await updateChecklist(req.tasks, req.params.id, req.body || {});
    res.json({ success: true });
  }));
  router.delete('/checklists/:id', wrap(async (req, res) => {
    await deleteChecklist(req.tasks, req.params.id);
    res.json({ success: true });
  }));
  router.put('/checklists/:id/order', wrap(async (req, res) => {
    await reorderChecklist(req.tasks, { listId: req.params.id }, req.body?.ids);
    res.json({ success: true });
  }));
  router.post('/tasks/:ref/checklist', wrap(async (req, res) => res.status(201).json({ success: true, item: await addChecklistItem(req.tasks, req.params.ref, req.body || {}) })));
  router.put('/tasks/:ref/checklist/order', wrap(async (req, res) => {
    await reorderChecklist(req.tasks, { taskRef: req.params.ref }, req.body?.ids);
    res.json({ success: true });
  }));
  router.post('/checklist/bulk', wrap(async (req, res) => {
    await bulkChecklist(req.tasks, req.body || {});
    res.json({ success: true });
  }));
  router.put('/checklist/:id', wrap(async (req, res) => res.json({ success: true, item: await updateChecklistItem(req.tasks, intId(req.params.id), req.body || {}) })));
  router.delete('/checklist/:id', wrap(async (req, res) => {
    await deleteChecklistItem(req.tasks, intId(req.params.id));
    res.json({ success: true });
  }));

  // Files: uploads before the task exists wait for it ("drafts")
  const upload = async (req) => runUpload(taskUploader((await moduleSettings()).maxUploadMb || 200), req, req.res);
  router.post('/files', wrap(async (req, res) => res.status(201).json({ success: true, files: await storeTaskFiles(req.tasks, null, await upload(req)) })));
  router.post('/files/link', wrap(async (req, res) => res.status(201).json({ success: true, file: await linkTaskFile(req.tasks, null, req.body || {}) })));
  router.post('/tasks/:ref/files', wrap(async (req, res) => res.status(201).json({ success: true, files: await storeTaskFiles(req.tasks, req.params.ref, await upload(req)) })));
  router.post('/tasks/:ref/files/link', wrap(async (req, res) => res.status(201).json({ success: true, file: await linkTaskFile(req.tasks, req.params.ref, req.body || {}) })));
  router.get('/files/:id', wrap(async (req, res) => sendTaskFile(req.tasks, req.params.id, res, req.query.download === '1')));
  router.delete('/files/:id', wrap(async (req, res) => {
    await removeTaskFile(req.tasks, req.params.id);
    res.json({ success: true });
  }));

  // Results, links, Gantt, reminders
  router.post('/tasks/:ref/results', wrap(async (req, res) => res.status(201).json({ success: true, ...(await addResult(req.tasks, req.params.ref, req.body || {})) })));
  router.delete('/results/:id', wrap(async (req, res) => {
    await deleteResult(req.tasks, req.params.id);
    res.json({ success: true });
  }));
  router.post('/tasks/:ref/links', wrap(async (req, res) => {
    await addLink(req.tasks, req.params.ref, req.body?.ref);
    res.json({ success: true });
  }));
  router.delete('/tasks/:ref/links/:otherId', wrap(async (req, res) => {
    await removeLink(req.tasks, req.params.ref, req.params.otherId);
    res.json({ success: true });
  }));
  router.post('/tasks/:ref/deps', wrap(async (req, res) => {
    await addDep(req.tasks, req.params.ref, req.body || {});
    res.json({ success: true });
  }));
  router.delete('/deps/:id', wrap(async (req, res) => {
    await removeDep(req.tasks, req.params.id);
    res.json({ success: true });
  }));
  router.post('/tasks/:ref/reminders', wrap(async (req, res) => res.status(201).json({ success: true, ...(await addReminder(req.tasks, req.params.ref, req.body || {})) })));
  router.delete('/reminders/:id', wrap(async (req, res) => {
    await deleteReminder(req.tasks, req.params.id);
    res.json({ success: true });
  }));

  // Templates (and recurring tasks), flows, custom fields
  router.get('/templates', wrap(async (req, res) => res.json({ success: true, templates: await listTemplates(req.tasks) })));
  router.post('/templates', wrap(async (req, res) => res.status(201).json({ success: true, template: await saveTemplate(req.tasks, req.body || {}) })));
  router.put('/templates/:id', wrap(async (req, res) => res.json({ success: true, template: await saveTemplate(req.tasks, req.body || {}, req.params.id) })));
  router.delete('/templates/:id', wrap(async (req, res) => {
    await deleteTemplate(req.tasks, req.params.id);
    res.json({ success: true });
  }));
  router.get('/flows', wrap(async (req, res) => res.json({ success: true, flows: await listFlows(req.tasks) })));
  router.post('/flows', wrap(async (req, res) => res.status(201).json({ success: true, ...(await saveFlow(req.tasks, req.body || {})) })));
  router.put('/flows/:id', wrap(async (req, res) => res.json({ success: true, ...(await saveFlow(req.tasks, req.body || {}, req.params.id)) })));
  router.delete('/flows/:id', wrap(async (req, res) => {
    await deleteFlow(req.tasks, req.params.id);
    res.json({ success: true });
  }));
  router.get('/fields', wrap(async (req, res) => res.json({ success: true, fields: await listFields() })));
  router.post('/fields', wrap(async (req, res) => res.status(201).json({ success: true, field: await addField(req.tasks, req.body || {}) })));
  router.delete('/fields/:id', wrap(async (req, res) => {
    await deleteField(req.tasks, req.params.id);
    res.json({ success: true });
  }));

  return router;
}
