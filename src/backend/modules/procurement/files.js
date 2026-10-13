import { copyFile, unlink } from 'fs/promises';
import multer from 'multer';
import { query, withTransaction } from '../../config/database.js';
import { KB_FILE_GROUPS } from '../catalog.js';
import { LEVEL, contextFromRequest } from '../shared/acl.js';
import { extOf, newStorageKey, originalName, removeBlob, sendBlob, storagePath, verifyContent } from '../shared/storage.js';
import { modulesState, rolesOn } from './access.js';
import { DOC_KINDS, PAYABLE, httpError } from './logic.js';
import { documentsOf, logEvent, visibleRow, webhook } from './service.js';

/*
 * Documents of a request: invoices, quotes, specifications, photos, waybills,
 * acts, payment orders. Uploaded files live in UPLOAD_DIR/procurement/…;
 * a file picked from the Files module is copied, so the request keeps its
 * invoice even when the original is moved or deleted. Served only through
 * the access-checked route below (nosniff, CSP sandbox), like Files.
 */

export const MAX_UPLOAD_MB = 50;
export const MAX_FILES = 10;
const ALLOWED = new Set([...KB_FILE_GROUPS.images, ...KB_FILE_GROUPS.pdf, ...KB_FILE_GROUPS.office, 'txt', 'zip', '7z', 'rar']);

export function uploader() {
  return multer({
    storage: multer.diskStorage({
      destination: async (_req, file, cb) => {
        try {
          file.storageKey = await newStorageKey(extOf(originalName(file)), 'procurement');
          cb(null, storagePath(file.storageKey).replace(/[^/\\]+$/, ''));
        } catch (err) {
          cb(err);
        }
      },
      filename: (_req, file, cb) => cb(null, file.storageKey.split('/').pop()),
    }),
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: MAX_FILES },
    fileFilter: (_req, file, cb) => {
      const ext = extOf(originalName(file));
      if (!ALLOWED.has(ext)) {
        cb(httpError(400, `Files of type .${ext || '?'} are not allowed`, 'FILE_TYPE'));
        return;
      }
      cb(null, true);
    },
  }).array('files', MAX_FILES);
}

/** Runs multer; the text fields of the form land in req.body. */
export function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    uploader()(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') reject(httpError(413, 'File is too large', 'FILE_TOO_LARGE'));
      else if (err?.code === 'LIMIT_FILE_COUNT') reject(httpError(400, 'Too many files at once', 'TOO_MANY_FILES'));
      else if (err) reject(err.statusCode ? err : httpError(400, err.message));
      else resolve(req.files || []);
    });
  });
}

/** Removes uploaded blobs (a failed request after multer stored them). */
export async function discardUploads(files) {
  for (const file of files || []) await unlink(file.path).catch(() => {});
}

const kindOf = (value) => (DOC_KINDS.includes(value) ? value : 'other');

/** Who may add documents: editors of the request, and payers while it waits for money. */
function assertCanAttach(ctx, row) {
  const roles = rolesOn(ctx, row);
  const editor = (roles.author || roles.responsible || roles.admin) && !['closed', 'cancelled', 'rejected'].includes(row.status);
  if (!editor && !(roles.pay && [...PAYABLE, 'paid'].includes(row.status))) throw httpError(403, 'You cannot add documents to this request', 'FORBIDDEN');
}

/** Inserts document rows for stored files (the blobs are already in place). */
export async function insertDocuments(client, row, actorId, files, { kind = 'other', paymentId = null, deliveryId = null } = {}) {
  const out = [];
  for (const file of files) {
    const ext = extOf(file.name);
    const { rows } = await client.query(
      `INSERT INTO proc_documents (request_id, kind, name, ext, size, storage_key, source, node_id, payment_id, delivery_id, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [row.id, kindOf(kind), String(file.name).slice(0, 255), ext, file.size || 0, file.storageKey, file.source || 'upload', file.nodeId || null, paymentId, deliveryId, actorId]
    );
    out.push(rows[0].id);
  }
  return out;
}

/** Multer files → { name, size, storageKey } after checking the content of PDFs and pictures. */
export async function acceptedFiles(files) {
  const out = [];
  try {
    for (const file of files) {
      await verifyContent(file.path, extOf(originalName(file)));
      out.push({ name: originalName(file), size: file.size, storageKey: file.storageKey });
    }
  } catch (err) {
    await discardUploads(files);
    throw err;
  }
  return out;
}

/** POST /requests/:id/documents (multipart files[], kind). */
export async function uploadDocuments(req, res, id) {
  const files = await runUpload(req, res);
  let row;
  let ctx;
  try {
    ({ ctx, row } = await visibleRow(req, id));
    assertCanAttach(ctx, row);
    if (!files.length) throw httpError(400, 'Choose a file', 'NO_FILES');
  } catch (err) {
    await discardUploads(files);
    throw err;
  }
  const accepted = await acceptedFiles(files);
  const kind = kindOf(req.body?.kind);
  await withTransaction(async (client) => {
    await insertDocuments(client, row, ctx.userId, accepted, { kind });
    await logEvent(client, row.id, ctx.userId, 'document_added', { kind, names: accepted.map((file) => file.name) });
  });
  if (kind === 'invoice' || row.status !== 'draft') webhook('procurement.updated', row, ctx.userId, { documents: accepted.map((file) => file.name) });
  return documentsOf(row.id);
}

/** POST /requests/:id/documents/link { nodeId, kind }: a copy of a file from the Files module. */
export async function linkDocument(req, id, input = {}) {
  const { ctx, row } = await visibleRow(req, id);
  assertCanAttach(ctx, row);
  if (!(await modulesState()).files) throw httpError(404, 'The Files module is off', 'MODULE_DISABLED');
  const nodeId = Number(input.nodeId);
  if (!Number.isInteger(nodeId) || nodeId < 1) throw httpError(400, 'Choose a file', 'NO_FILES');
  const { nodeAccess } = await import('../files/access.js');
  // The person must be able to open the file in Files themselves (no admin bypass).
  const access = await nodeAccess({ ...contextFromRequest(req, 'files.admin'), isAdmin: false }, nodeId).catch(() => null);
  if (!access || access.level < LEVEL.view) throw httpError(404, 'File not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT name, size, storage_key FROM fs_nodes WHERE id = $1 AND kind = 'file' AND deleted_at IS NULL`, [nodeId]);
  const node = rows[0];
  if (!node?.storage_key) throw httpError(404, 'File not found', 'NOT_FOUND');
  const ext = extOf(node.name);
  if (!ALLOWED.has(ext)) throw httpError(400, `Files of type .${ext || '?'} are not allowed`, 'FILE_TYPE');
  const storageKey = await newStorageKey(ext, 'procurement');
  await copyFile(storagePath(node.storage_key), storagePath(storageKey)).catch(() => {
    throw httpError(404, 'File is missing on the server', 'FILE_MISSING');
  });
  const kind = kindOf(input.kind);
  await withTransaction(async (client) => {
    await insertDocuments(client, row, ctx.userId, [{ name: node.name, size: Number(node.size), storageKey, source: 'files', nodeId }], { kind });
    await logEvent(client, row.id, ctx.userId, 'document_added', { kind, names: [node.name], fromFiles: true });
  });
  return documentsOf(row.id);
}

async function documentRow(docId) {
  const id = Number(docId);
  if (!Number.isInteger(id) || id < 1) throw httpError(404, 'Document not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT * FROM proc_documents WHERE id = $1`, [id]);
  if (!rows[0]) throw httpError(404, 'Document not found', 'NOT_FOUND');
  return rows[0];
}

/** GET /documents/:id/file[?download=1]: only for people who see the request. */
export async function sendDocument(req, res, docId, download = false) {
  const doc = await documentRow(docId);
  await visibleRow(req, doc.request_id).catch(() => {
    throw httpError(404, 'Document not found', 'NOT_FOUND');
  });
  await sendBlob(res, storagePath(doc.storage_key), { name: doc.name, ext: doc.ext || extOf(doc.name), download });
}

/** PUT /documents/:id { kind }. */
export async function updateDocument(req, docId, input = {}) {
  const doc = await documentRow(docId);
  const { ctx, row } = await visibleRow(req, doc.request_id);
  assertCanAttach(ctx, row);
  await query(`UPDATE proc_documents SET kind = $2 WHERE id = $1`, [doc.id, kindOf(input.kind)]);
  return documentsOf(row.id);
}

/** DELETE /documents/:id: the uploader or an editor; the invoice of a request in approval stays. */
export async function deleteDocument(req, docId) {
  const doc = await documentRow(docId);
  const { ctx, row } = await visibleRow(req, doc.request_id);
  assertCanAttach(ctx, row);
  const roles = rolesOn(ctx, row);
  if (doc.uploaded_by !== ctx.userId && !roles.admin && !roles.author && !roles.responsible) throw httpError(403, 'You cannot remove this document', 'FORBIDDEN');
  if (doc.kind === 'invoice' && ['pending', 'question'].includes(row.status)) throw httpError(409, 'The invoice cannot be removed while the request is in approval', 'LOCKED');
  if (doc.payment_id) throw httpError(409, 'Remove the payment instead', 'LOCKED');
  await query(`DELETE FROM proc_documents WHERE id = $1`, [doc.id]);
  await removeBlob(doc.storage_key);
  await withTransaction((client) => logEvent(client, row.id, ctx.userId, 'document_removed', { kind: doc.kind, names: [doc.name] }));
  return documentsOf(row.id);
}

/** Before a request row is deleted: its blobs. */
export async function removeDocumentBlobs(requestId) {
  const { rows } = await query(`SELECT storage_key FROM proc_documents WHERE request_id = $1`, [requestId]);
  for (const row of rows) await removeBlob(row.storage_key);
}
