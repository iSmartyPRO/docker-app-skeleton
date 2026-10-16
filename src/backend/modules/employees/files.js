import { unlink } from 'fs/promises';
import multer from 'multer';
import { query } from '../../config/database.js';
import { KB_FILE_GROUPS } from '../catalog.js';
import { extOf, newStorageKey, originalName, removeBlob, sendBlob, storagePath, verifyContent } from '../shared/storage.js';
import { assertHr, rightsOf } from './access.js';
import { getEmployee, logEvent, visibleRow } from './service.js';
import { httpError, intOrNull } from './logic.js';

/*
 * The photo and the documents of an employee card. Stored in
 * UPLOAD_DIR/employees/…, served only through the access-checked routes
 * (nosniff, CSP sandbox) like the other modules. The photo is visible to
 * whoever sees the card; documents only to HR.
 */

export const MAX_DOC_MB = 25;
const MAX_PHOTO_MB = 5;
const PHOTO_TYPES = new Set(['png', 'jpg', 'jpeg', 'webp']);
const DOC_TYPES = new Set([...KB_FILE_GROUPS.images, ...KB_FILE_GROUPS.pdf, ...KB_FILE_GROUPS.office, 'txt']);

function upload(req, res, { field, max, types, maxMb }) {
  const handler = multer({
    storage: multer.diskStorage({
      destination: async (_req, file, cb) => {
        try {
          file.storageKey = await newStorageKey(extOf(originalName(file)), 'employees');
          cb(null, storagePath(file.storageKey).replace(/[^/\\]+$/, ''));
        } catch (err) {
          cb(err);
        }
      },
      filename: (_req, file, cb) => cb(null, file.storageKey.split('/').pop()),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: max },
    fileFilter: (_req, file, cb) => {
      const ext = extOf(originalName(file));
      if (!types.has(ext)) cb(httpError(400, `Files of type .${ext || '?'} are not allowed`, 'FILE_TYPE'));
      else cb(null, true);
    },
  }).array(field, max);
  return new Promise((resolve, reject) => {
    handler(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') reject(httpError(413, 'File is too large', 'FILE_TOO_LARGE'));
      else if (err?.code === 'LIMIT_FILE_COUNT') reject(httpError(400, 'Too many files at once', 'TOO_MANY_FILES'));
      else if (err) reject(err.statusCode ? err : httpError(400, err.message));
      else resolve(req.files || []);
    });
  });
}

const discard = async (files) => {
  for (const file of files || []) await unlink(file.path).catch(() => {});
};

/** POST /employees/:id/photo (multipart `photo`), HR only. */
export async function uploadPhoto(req, res, id) {
  const rights = await rightsOf(req);
  assertHr(rights);
  const { row } = await visibleRow(rights, id);
  const files = await upload(req, res, { field: 'photo', max: 1, types: PHOTO_TYPES, maxMb: MAX_PHOTO_MB });
  if (!files.length) throw httpError(400, 'Choose a picture', 'NO_FILES');
  const file = files[0];
  try {
    await verifyContent(file.path, extOf(originalName(file)));
  } catch (err) {
    await discard(files);
    throw err;
  }
  await query(`UPDATE employees SET photo_key = $2, updated_at = NOW() WHERE id = $1`, [row.id, file.storageKey]);
  if (row.photo_key) await removeBlob(row.photo_key);
  await logEvent({ query }, row.id, 'photo', req.user?.id || null, {});
  return getEmployee(req, row.id);
}

export async function removePhoto(req, id) {
  const rights = await rightsOf(req);
  assertHr(rights);
  const { row } = await visibleRow(rights, id);
  if (row.photo_key) {
    await query(`UPDATE employees SET photo_key = NULL, updated_at = NOW() WHERE id = $1`, [row.id]);
    await removeBlob(row.photo_key);
  }
  return getEmployee(req, row.id);
}

/** GET /employees/:id/photo — whoever sees the card. */
export async function sendPhoto(req, res, id) {
  const rights = await rightsOf(req);
  const { row } = await visibleRow(rights, id);
  if (!row.photo_key) throw httpError(404, 'No photo', 'NOT_FOUND');
  await sendBlob(res, storagePath(row.photo_key), { name: `photo-${row.id}.${extOf(row.photo_key)}`, ext: extOf(row.photo_key) });
}

/** POST /employees/:id/documents (multipart `files[]`, optional `note`), HR only. */
export async function uploadDocuments(req, res, id) {
  const rights = await rightsOf(req);
  assertHr(rights);
  const { row } = await visibleRow(rights, id);
  const files = await upload(req, res, { field: 'files', max: 10, types: DOC_TYPES, maxMb: MAX_DOC_MB });
  try {
    if (!files.length) throw httpError(400, 'Choose a file', 'NO_FILES');
    for (const file of files) await verifyContent(file.path, extOf(originalName(file)));
  } catch (err) {
    await discard(files);
    throw err;
  }
  const note = String(req.body?.note || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 300) || null;
  for (const file of files) {
    await query(`INSERT INTO emp_files (employee_id, name, ext, size, storage_key, note, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
      row.id,
      originalName(file).slice(0, 255),
      extOf(originalName(file)),
      file.size || 0,
      file.storageKey,
      note,
      req.user?.id || null,
    ]);
  }
  await logEvent({ query }, row.id, 'documents_added', req.user?.id || null, { names: files.map((file) => originalName(file).slice(0, 80)) });
  return getEmployee(req, row.id);
}

async function documentRow(req, fileId) {
  const rights = await rightsOf(req);
  assertHr(rights);
  const { rows } = await query(`SELECT * FROM emp_files WHERE id = $1`, [intOrNull(fileId) || 0]);
  if (!rows[0]) throw httpError(404, 'File not found', 'NOT_FOUND');
  return rows[0];
}

export async function sendDocument(req, res, fileId, download = false) {
  const file = await documentRow(req, fileId);
  await sendBlob(res, storagePath(file.storage_key), { name: file.name, ext: file.ext, download });
}

export async function deleteDocument(req, fileId) {
  const file = await documentRow(req, fileId);
  await query(`DELETE FROM emp_files WHERE id = $1`, [file.id]);
  await removeBlob(file.storage_key);
  await logEvent({ query }, file.employee_id, 'document_removed', req.user?.id || null, { name: file.name });
  return getEmployee(req, file.employee_id);
}
