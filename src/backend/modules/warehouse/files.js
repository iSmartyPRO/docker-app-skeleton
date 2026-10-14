import { unlink, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import multer from 'multer';
import { query } from '../../config/database.js';
import { KB_FILE_GROUPS } from '../catalog.js';
import { extOf, newStorageKey, originalName, removeBlob, sendBlob, storagePath, verifyContent } from '../shared/storage.js';
import { canSeeDoc, intOrNull, whContext } from './access.js';
import { FILE_KINDS, httpError } from './logic.js';

/*
 * Attachments of the module (spec §2 «фото и вложения»): photos of items and
 * instances, documents' waybills, acts, damage photos and the recipient's
 * signature. Stored in UPLOAD_DIR/warehouse/…, served only through the
 * access-checked route (nosniff, CSP sandbox), like Procurement.
 */

export const MAX_UPLOAD_MB = 30;
const MAX_FILES = 10;
const ALLOWED = new Set([...KB_FILE_GROUPS.images, ...KB_FILE_GROUPS.pdf, ...KB_FILE_GROUPS.office, 'txt']);
const OWNERS = ['item', 'doc', 'instance'];

function uploader() {
  return multer({
    storage: multer.diskStorage({
      destination: async (_req, file, cb) => {
        try {
          file.storageKey = await newStorageKey(extOf(originalName(file)), 'warehouse');
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

function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    uploader()(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') reject(httpError(413, 'File is too large', 'FILE_TOO_LARGE'));
      else if (err?.code === 'LIMIT_FILE_COUNT') reject(httpError(400, 'Too many files at once', 'TOO_MANY_FILES'));
      else if (err) reject(err.statusCode ? err : httpError(400, err.message));
      else resolve(req.files || []);
    });
  });
}

async function discard(files) {
  for (const file of files || []) await unlink(file.path).catch(() => {});
}

/** May the person attach to / remove from this owner? Item & instance: editors; doc: its editors or recipient. */
async function ownerAccess(ctx, ownerType, ownerId, { write = false } = {}) {
  if (ownerType === 'doc') {
    const { rows } = await query(`SELECT * FROM wh_docs WHERE id = $1`, [ownerId]);
    const doc = rows[0];
    if (!doc || !(await canSeeDoc(ctx, doc))) throw httpError(404, 'Document not found', 'NOT_FOUND');
    if (write) {
      const wid = doc.warehouse_id || doc.to_warehouse_id;
      const mine = doc.author_id === ctx.userId || doc.created_by === ctx.userId || (doc.to_holder_type === 'employee' && doc.to_holder_id === ctx.userId);
      if (!mine && !ctx.can('operate', wid) && !ctx.can('operate', doc.to_warehouse_id)) throw httpError(403, 'You cannot attach files to this document', 'FORBIDDEN');
    }
    return doc;
  }
  if (ownerType === 'item' || ownerType === 'instance') {
    const table = ownerType === 'item' ? 'wh_items' : 'wh_instances';
    const { rows } = await query(`SELECT id FROM ${table} WHERE id = $1`, [ownerId]);
    if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
    if (write && !(ctx.canAny('operate') || ctx.canAny('admin'))) throw httpError(403, 'Only storekeepers add photos', 'FORBIDDEN');
    return rows[0];
  }
  throw httpError(404, 'Not found', 'NOT_FOUND');
}

export function fileShape(row) {
  return { id: row.id, kind: row.kind, name: row.name, ext: row.ext, size: Number(row.size), createdAt: row.created_at, uploadedBy: row.uploaded_by, url: `/api/app/warehouse/files/${row.id}/file` };
}

export async function filesOf(ownerType, ownerId) {
  const { rows } = await query(`SELECT * FROM wh_files WHERE owner_type = $1 AND owner_id = $2 ORDER BY id`, [ownerType, ownerId]);
  return rows.map(fileShape);
}

/** POST /:owner/:id/files (multipart files[], kind). */
export async function uploadFiles(req, res, ownerType, id) {
  if (!OWNERS.includes(ownerType)) throw httpError(404, 'Not found', 'NOT_FOUND');
  const ctx = await whContext(req);
  const ownerId = intOrNull(id);
  await ownerAccess(ctx, ownerType, ownerId, { write: true });
  const files = await runUpload(req, res);
  const kind = FILE_KINDS.includes(req.body?.kind) && req.body.kind !== 'signature' ? req.body.kind : ownerType === 'doc' ? 'other' : 'photo';
  try {
    if (!files.length) throw httpError(400, 'Choose a file', 'NO_FILES');
    for (const file of files) await verifyContent(file.path, extOf(originalName(file)));
  } catch (err) {
    await discard(files);
    throw err;
  }
  for (const file of files) {
    await query(`INSERT INTO wh_files (owner_type, owner_id, kind, name, ext, size, storage_key, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
      ownerType,
      ownerId,
      kind,
      originalName(file).slice(0, 255),
      extOf(originalName(file)),
      file.size || 0,
      file.storageKey,
      ctx.userId,
    ]);
  }
  return filesOf(ownerType, ownerId);
}

/** Stores a signature drawn on the screen (a PNG data URL, ≤ 600 KB). */
export async function storeSignature(ownerId, dataUrl, userId) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw httpError(400, 'The signature must be a PNG picture', 'BAD_SIGNATURE');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length < 60 || buffer.length > 600 * 1024) throw httpError(400, 'The signature is empty or too large', 'BAD_SIGNATURE');
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw httpError(400, 'The signature must be a PNG picture', 'BAD_SIGNATURE');
  const key = await newStorageKey('png', 'warehouse');
  const path = storagePath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  const { rows } = await query(`INSERT INTO wh_files (owner_type, owner_id, kind, name, ext, size, storage_key, uploaded_by) VALUES ('doc', $1, 'signature', 'signature.png', 'png', $2, $3, $4) RETURNING *`, [ownerId, buffer.length, key, userId]);
  return fileShape(rows[0]);
}

async function loadFile(ctx, id) {
  const { rows } = await query(`SELECT * FROM wh_files WHERE id = $1`, [intOrNull(id) || 0]);
  const file = rows[0];
  if (!file) throw httpError(404, 'File not found', 'NOT_FOUND');
  await ownerAccess(ctx, file.owner_type, file.owner_id);
  return file;
}

export async function sendFile(req, res, id, download = false) {
  const ctx = await whContext(req);
  const file = await loadFile(ctx, id);
  await sendBlob(res, storagePath(file.storage_key), { name: file.name, ext: file.ext, download });
}

export async function deleteFile(req, id) {
  const ctx = await whContext(req);
  const file = await loadFile(ctx, id);
  const owner = await ownerAccess(ctx, file.owner_type, file.owner_id, { write: true });
  if (file.owner_type === 'doc' && ['posted', 'reversed'].includes(owner.status) && file.kind === 'signature') throw httpError(409, 'The signature of a posted document stays', 'LOCKED');
  await query(`DELETE FROM wh_files WHERE id = $1`, [file.id]);
  await removeBlob(file.storage_key);
  return filesOf(file.owner_type, file.owner_id);
}
