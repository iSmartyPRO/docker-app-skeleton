import { intId, wrap } from '../shared/acl.js';
import {
  aclView,
  applyChange,
  browse,
  cancelPropagation,
  cancelReport,
  findSubjects,
  jobList,
  jobStatus,
  ntfsOverview,
  previewChange,
  reportStatus,
  startPropagationJob,
  startReport,
  undoNtfs,
} from './ntfs.js';

/**
 * /api/app/folderaccess/ntfs — superadministrators only (checked in ntfs.js
 * on every call: system administrators get 403 FA_SUPERADMIN_ONLY). API
 * tokens never get here; a "sign in as" session only reads.
 */
export function mountNtfs(router) {
  const path = (req) => String(req.query.path || '').slice(0, 2000);

  router.get('/ntfs', wrap(async (req, res) => {
    res.json({ success: true, ...(await ntfsOverview(req.fa)) });
  }));

  router.get('/ntfs/tree', wrap(async (req, res) => {
    res.json({ success: true, ...(await browse(req, req.fa, { shareId: req.query.shareId, path: path(req) })) });
  }));

  router.get('/ntfs/acl', wrap(async (req, res) => {
    res.json({ success: true, ...(await aclView(req, req.fa, { shareId: req.query.shareId, path: path(req), sources: req.query.sources !== '0' })) });
  }));

  router.get('/ntfs/subjects', wrap(async (req, res) => {
    res.json({ success: true, subjects: await findSubjects(req.fa, req.query.q) });
  }));

  router.post('/ntfs/preview', wrap(async (req, res) => {
    res.json({ success: true, ...(await previewChange(req, req.fa, req.body || {})) });
  }));

  router.post('/ntfs/apply', wrap(async (req, res) => {
    res.json({ success: true, ...(await applyChange(req, req.fa, req.body || {})) });
  }));

  router.post('/ntfs/journal/:id/undo', wrap(async (req, res) => {
    const body = req.body || {};
    res.json({
      success: true,
      ...(await undoNtfs(req, req.fa, intId(req.params.id), {
        force: body.force === true,
        confirmName: body.confirmName,
        revision: typeof body.revision === 'string' ? body.revision : null,
        propagate: body.propagate !== false,
      })),
    });
  }));

  router.post('/ntfs/propagate', wrap(async (req, res) => {
    res.status(202).json({ success: true, job: await startPropagationJob(req, req.fa, req.body || {}) });
  }));

  router.get('/ntfs/jobs', wrap(async (req, res) => {
    res.json({ success: true, jobs: jobList(req.fa) });
  }));

  router.get('/ntfs/jobs/:id', wrap(async (req, res) => {
    res.json({ success: true, job: jobStatus(req.fa, String(req.params.id).slice(0, 64)) });
  }));

  router.post('/ntfs/jobs/:id/cancel', wrap(async (req, res) => {
    res.json({ success: true, job: cancelPropagation(req.fa, String(req.params.id).slice(0, 64)) });
  }));

  router.post('/ntfs/report', wrap(async (req, res) => {
    res.status(202).json({ success: true, report: await startReport(req, req.fa) });
  }));

  router.get('/ntfs/report', wrap(async (req, res) => {
    res.json({ success: true, report: reportStatus(req.fa, req.query.id ? String(req.query.id).slice(0, 64) : null) });
  }));

  router.post('/ntfs/report/:id/cancel', wrap(async (req, res) => {
    res.json({ success: true, report: cancelReport(req.fa, String(req.params.id).slice(0, 64)) });
  }));
}
