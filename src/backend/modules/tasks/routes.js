import { Router } from 'express';
import { getSettings, parseSettings } from '../../services/settings.js';
import { contextFromRequest, intId, listSubjects, wrap } from '../shared/acl.js';
import {
  addChecklistItem,
  addComment,
  calendarFeed,
  checkKey,
  createProject,
  createTask,
  deleteChecklistItem,
  deleteComment,
  deleteProject,
  deleteTask,
  getProject,
  getProjectAccess,
  getTask,
  listProjects,
  listTasks,
  overview,
  reorderChecklist,
  saveStatuses,
  setProjectAccess,
  setWatching,
  suggestKey,
  updateChecklistItem,
  updateComment,
  updateProject,
  updateTask,
} from './service.js';

async function moduleSettings() {
  return parseSettings(await getSettings()).modules.tasks.settings;
}

/** /api/app/tasks — signed-in users; access is checked per project. */
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
      },
    });
  }));

  // Projects
  router.get('/projects', wrap(async (req, res) => {
    res.json({ success: true, projects: await listProjects(req.tasks, { archived: req.query.archived === '1' }) });
  }));
  router.get('/projects/key', wrap(async (req, res) => {
    if (req.query.from) return res.json({ success: true, key: await suggestKey(req.query.from), available: true });
    return res.json({ success: true, ...(await checkKey(req.query.key)) });
  }));
  router.post('/projects', wrap(async (req, res) => {
    const settings = await moduleSettings();
    const project = await createProject(req.tasks, req.body || {}, {
      locale: req.user.locale,
      allowed: settings.projectCreation !== 'admins' || req.tasks.isAdmin,
    });
    res.status(201).json({ success: true, project });
  }));
  router.get('/projects/:ref', wrap(async (req, res) => {
    res.json({ success: true, ...(await getProject(req.tasks, req.params.ref)) });
  }));
  router.put('/projects/:ref', wrap(async (req, res) => {
    res.json({ success: true, ...(await updateProject(req.tasks, req.params.ref, req.body || {})) });
  }));
  router.delete('/projects/:ref', wrap(async (req, res) => {
    await deleteProject(req.tasks, req.params.ref);
    res.json({ success: true });
  }));
  router.put('/projects/:ref/statuses', wrap(async (req, res) => {
    res.json({ success: true, ...(await saveStatuses(req.tasks, req.params.ref, req.body?.statuses)) });
  }));
  router.get('/projects/:ref/access', wrap(async (req, res) => {
    res.json({ success: true, entries: await getProjectAccess(req.tasks, req.params.ref) });
  }));
  router.put('/projects/:ref/access', wrap(async (req, res) => {
    res.json({ success: true, entries: await setProjectAccess(req.tasks, req.params.ref, req.body?.entries) });
  }));
  router.get('/subjects', wrap(async (req, res) => {
    res.json({ success: true, ...(await listSubjects()) });
  }));

  // Tasks
  router.get('/tasks', wrap(async (req, res) => {
    res.json({ success: true, tasks: await listTasks(req.tasks, req.query) });
  }));
  router.get('/calendar', wrap(async (req, res) => {
    res.json({ success: true, tasks: await calendarFeed(req.tasks, { from: req.query.from, to: req.query.to, mine: req.query.mine === '1' }) });
  }));
  router.post('/tasks', wrap(async (req, res) => {
    res.status(201).json({ success: true, task: await createTask(req.tasks, req.body || {}) });
  }));
  router.get('/tasks/:ref', wrap(async (req, res) => {
    res.json({ success: true, task: await getTask(req.tasks, req.params.ref) });
  }));
  router.put('/tasks/:ref', wrap(async (req, res) => {
    res.json({ success: true, task: await updateTask(req.tasks, req.params.ref, req.body || {}) });
  }));
  router.delete('/tasks/:ref', wrap(async (req, res) => {
    await deleteTask(req.tasks, req.params.ref);
    res.json({ success: true });
  }));
  router.put('/tasks/:ref/watch', wrap(async (req, res) => {
    res.json({ success: true, watching: await setWatching(req.tasks, req.params.ref, Boolean(req.body?.on)) });
  }));

  // Checklist
  router.post('/tasks/:ref/checklist', wrap(async (req, res) => {
    res.status(201).json({ success: true, item: await addChecklistItem(req.tasks, req.params.ref, req.body?.text) });
  }));
  router.put('/tasks/:ref/checklist/order', wrap(async (req, res) => {
    await reorderChecklist(req.tasks, req.params.ref, req.body?.ids);
    res.json({ success: true });
  }));
  router.put('/checklist/:id', wrap(async (req, res) => {
    res.json({ success: true, item: await updateChecklistItem(req.tasks, intId(req.params.id), req.body || {}) });
  }));
  router.delete('/checklist/:id', wrap(async (req, res) => {
    await deleteChecklistItem(req.tasks, intId(req.params.id));
    res.json({ success: true });
  }));

  // Comments
  router.post('/tasks/:ref/comments', wrap(async (req, res) => {
    res.status(201).json({ success: true, ...(await addComment(req.tasks, req.params.ref, req.body?.body)) });
  }));
  router.put('/comments/:id', wrap(async (req, res) => {
    await updateComment(req.tasks, intId(req.params.id), req.body?.body);
    res.json({ success: true });
  }));
  router.delete('/comments/:id', wrap(async (req, res) => {
    await deleteComment(req.tasks, intId(req.params.id));
    res.json({ success: true });
  }));

  return router;
}
