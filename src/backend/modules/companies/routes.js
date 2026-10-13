import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { query } from '../../config/database.js';
import { httpError, intId, wrap } from '../shared/acl.js';
import { extOf, mimeOf } from '../shared/storage.js';
import { filePath, removeFile, storeFile } from './files.js';
import {
  addNote,
  addPosition,
  applyRegistry,
  archiveCompany,
  archivePerson,
  companiesContext,
  createCompany,
  createPerson,
  deleteCompany,
  deleteNote,
  deletePerson,
  deletePosition,
  endPosition,
  findDuplicates,
  getCompany,
  getPerson,
  listCompanies,
  listPeople,
  logEvent,
  meta,
  rate,
  ratings,
  registryLookup,
  searchAll,
  setDadataKey,
  staff,
  timeline,
  updateCompany,
  updatePerson,
  updatePosition,
  verifyCompany,
} from './service.js';
import { cleanIds } from './countries.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

// Public registers are shared resources: a person cannot hammer them.
const registryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `registry:${req.user?.id || req.ip}`,
  handler: (req, res) => res.status(429).json({ success: false, error: 'Too many register requests. Wait a minute.', code: 'RATE_LIMITED', retryAfter: 60 }),
});

/** /api/app/companies — signed-in users. */
export function privateRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    req.cmp = companiesContext(req);
    next();
  });

  router.get('/meta', wrap(async (req, res) => res.json({ success: true, ...(await meta(req.cmp)) })));
  router.get('/staff', wrap(async (req, res) => res.json({ success: true, users: await staff() })));
  router.get('/search', wrap(async (req, res) => res.json({ success: true, ...(await searchAll(req.cmp, req.query.q)) })));

  // Registers
  router.post('/lookup', registryLimiter, wrap(async (req, res) => {
    const result = await registryLookup(String(req.body?.country || ''), String(req.body?.id || ''));
    const { ids } = cleanIds(req.body?.country, result.fields.ids || {});
    res.json({ success: true, ...result, duplicates: await findDuplicates(req.body?.country, ids) });
  }));
  router.get('/duplicates', wrap(async (req, res) => {
    const { ids } = cleanIds(req.query.country, { [req.query.key]: req.query.value });
    res.json({ success: true, duplicates: await findDuplicates(req.query.country, ids, Number(req.query.except) || null) });
  }));

  // Companies
  router.get('/companies', wrap(async (req, res) => res.json({ success: true, ...(await listCompanies(req.cmp, req.query)) })));
  router.post('/companies', wrap(async (req, res) => res.json({ success: true, company: await createCompany(req.cmp, req.body || {}) })));
  router.get('/companies/:id', wrap(async (req, res) => res.json({ success: true, company: await getCompany(req.cmp, req.params.id) })));
  router.put('/companies/:id', wrap(async (req, res) => res.json({ success: true, company: await updateCompany(req.cmp, req.params.id, req.body || {}) })));
  router.post('/companies/:id/archive', wrap(async (req, res) => res.json({ success: true, company: await archiveCompany(req.cmp, req.params.id, req.body?.reason, true) })));
  router.post('/companies/:id/restore', wrap(async (req, res) => res.json({ success: true, company: await archiveCompany(req.cmp, req.params.id, null, false) })));
  router.delete('/companies/:id', wrap(async (req, res) => {
    await deleteCompany(req.cmp, req.params.id);
    res.json({ success: true });
  }));
  router.post('/companies/:id/verify', registryLimiter, wrap(async (req, res) => res.json({ success: true, ...(await verifyCompany(req.cmp, req.params.id)) })));
  router.post('/companies/:id/apply', wrap(async (req, res) => res.json({ success: true, company: await applyRegistry(req.cmp, req.params.id, req.body || {}) })));

  // Company documents
  router.post(
    '/companies/:id/files',
    (req, res, next) => upload.single('file')(req, res, (err) => {
      if (err) {
        err.statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        if (err.code === 'LIMIT_FILE_SIZE') err.code = 'FILE_TOO_LARGE';
      }
      next(err);
    }),
    wrap(async (req, res) => {
      const company = await getCompany(req.cmp, req.params.id);
      if (!company.canEdit) throw httpError(403, 'You cannot change this card', 'FORBIDDEN');
      if (!req.file) throw httpError(400, 'Choose a file', 'NO_FILE');
      const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
      const stored = await storeFile(req.file.buffer, extOf(name));
      const { rows } = await query(
        `INSERT INTO cmp_files (company_id, kind, name, storage_key, size, created_by) VALUES ($1, 'file', $2, $3, $4, $5) RETURNING id`,
        [company.id, name, stored.key, stored.size, req.cmp.userId]
      );
      await logEvent(null, { type: 'company', id: company.id, kind: 'file', body: name, data: { fileId: rows[0].id }, authorId: req.cmp.userId });
      res.json({ success: true, company: await getCompany(req.cmp, company.id) });
    })
  );
  router.get('/files/:id', wrap(async (req, res) => {
    const { rows } = await query(`SELECT * FROM cmp_files WHERE id = $1`, [intId(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'File not found', 'NOT_FOUND');
    const ext = extOf(rows[0].name);
    const inline = ext === 'pdf' && req.query.download !== '1';
    res.setHeader('Content-Type', mimeOf(ext));
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(rows[0].name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.sendFile(filePath(rows[0].storage_key));
  }));
  router.delete('/files/:id', wrap(async (req, res) => {
    const { rows } = await query(`SELECT * FROM cmp_files WHERE id = $1`, [intId(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'File not found', 'NOT_FOUND');
    const company = await getCompany(req.cmp, rows[0].company_id);
    if (!company.canEdit) throw httpError(403, 'You cannot change this card', 'FORBIDDEN');
    await query(`DELETE FROM cmp_files WHERE id = $1`, [rows[0].id]);
    await removeFile(rows[0].storage_key);
    await logEvent(null, { type: 'company', id: company.id, kind: 'file_removed', body: rows[0].name, authorId: req.cmp.userId });
    res.json({ success: true, company: await getCompany(req.cmp, company.id) });
  }));

  // People
  router.get('/people', wrap(async (req, res) => res.json({ success: true, ...(await listPeople(req.cmp, req.query)) })));
  router.post('/people', wrap(async (req, res) => res.json({ success: true, person: await createPerson(req.cmp, req.body || {}) })));
  router.get('/people/:id', wrap(async (req, res) => res.json({ success: true, person: await getPerson(req.cmp, req.params.id) })));
  router.put('/people/:id', wrap(async (req, res) => res.json({ success: true, person: await updatePerson(req.cmp, req.params.id, req.body || {}) })));
  router.post('/people/:id/archive', wrap(async (req, res) => res.json({ success: true, person: await archivePerson(req.cmp, req.params.id, req.body?.reason, true) })));
  router.post('/people/:id/restore', wrap(async (req, res) => res.json({ success: true, person: await archivePerson(req.cmp, req.params.id, null, false) })));
  router.delete('/people/:id', wrap(async (req, res) => {
    await deletePerson(req.cmp, req.params.id);
    res.json({ success: true });
  }));
  router.post('/people/:id/positions', wrap(async (req, res) => res.json({ success: true, person: await addPosition(req.cmp, req.params.id, req.body || {}) })));
  router.put('/positions/:id', wrap(async (req, res) => res.json({ success: true, person: await updatePosition(req.cmp, req.params.id, req.body || {}) })));
  router.post('/positions/:id/end', wrap(async (req, res) => res.json({ success: true, person: await endPosition(req.cmp, req.params.id, req.body || {}) })));
  router.delete('/positions/:id', wrap(async (req, res) => res.json({ success: true, person: await deletePosition(req.cmp, req.params.id) })));

  // Timeline and ratings (type = company | person)
  router.get('/:type(company|person)/:id/timeline', wrap(async (req, res) => res.json({ success: true, ...(await timeline(req.params.type, req.params.id, req.query, req.cmp)) })));
  router.post('/:type(company|person)/:id/notes', wrap(async (req, res) => res.json({ success: true, ...(await addNote(req.cmp, req.params.type, req.params.id, req.body || {})) })));
  router.delete('/events/:id', wrap(async (req, res) => {
    await deleteNote(req.cmp, req.params.id);
    res.json({ success: true });
  }));
  router.get('/:type(company|person)/:id/ratings', wrap(async (req, res) => res.json({ success: true, ...(await ratings(req.params.type, req.params.id)) })));
  router.post('/:type(company|person)/:id/ratings', wrap(async (req, res) => res.json({ success: true, ...(await rate(req.cmp, req.params.type, req.params.id, req.body || {})) })));

  // Administration
  router.put('/admin/dadata', wrap(async (req, res) => {
    if (!req.cmp.isAdmin) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
    await setDadataKey(req.body?.key);
    res.json({ success: true, ...(await meta(req.cmp)) });
  }));

  return router;
}
