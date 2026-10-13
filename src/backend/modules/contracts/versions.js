import multer from 'multer';
import { stat } from 'fs/promises';
import { dirname } from 'path';
import { query, withTransaction } from '../../config/database.js';
import { CONVERTIBLE, extOf, mimeOf, newStorageKey, officePreview, originalName, removeBlob, sendBlob, sendPdf, storagePath, verifyContent } from '../shared/storage.js';
import { httpError } from './logic.js';
import { canManageRisks, canView, canWorkFiles } from './access.js';
import { actorNameOf, contractPeople, emitContract, loadRow, logEvent, notifyPeople, postChat, requireContract, versionShape } from './service.js';

/*
 * File versions of a contract («Версии»): each upload is a new version with
 * «что изменено», its author and time; the newest becomes current (any older
 * one can be made current again). Blobs live under UPLOAD_DIR/contracts/<y>/<m>/
 * and are served only through access-checked routes with nosniff and a
 * sandbox CSP (shared/storage.js sendBlob), like Files.
 */

/** multer for one file ('file'), written straight into the storage folder. */
export function versionUploader(maxMb = 50) {
  return multer({
    storage: multer.diskStorage({
      destination: async (_req, file, cb) => {
        try {
          file.storageKey = await newStorageKey(extOf(originalName(file)).replace(/[^a-z0-9]/g, ''), 'contracts');
          cb(null, dirname(storagePath(file.storageKey)));
        } catch (err) {
          cb(err);
        }
      },
      filename: (_req, file, cb) => cb(null, file.storageKey.split('/').pop()),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
  }).single('file');
}

/** Turns a multer error into the API's (413 FILE_TOO_LARGE, 400 otherwise). */
export function uploadErrors(err) {
  if (!err) return null;
  err.statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  if (err.code === 'LIMIT_FILE_SIZE') err.code = 'FILE_TOO_LARGE';
  return err;
}

/** May the person add a version (the contract is visible and its files are theirs to work on)? */
export async function assertCanAddVersion(ctx, contractId) {
  const row = await requireContract(ctx, contractId);
  if (!canWorkFiles(ctx, row)) throw httpError(403, 'You cannot add versions to this contract', 'FORBIDDEN');
  return row;
}

export async function addVersion(ctx, contractId, file, input = {}) {
  if (!file) throw httpError(400, 'Choose a file', 'NO_FILE');
  let row;
  let committed = false;
  try {
    row = await assertCanAddVersion(ctx, contractId);
    const ext = extOf(originalName(file)).replace(/[^a-z0-9]/g, '');
    await verifyContent(file.path, ext);
    const signed = Boolean(input.signed === true || input.signed === 'true' || input.signed === '1') && ctx.isLegal;
    const comment = String(input.comment ?? '').trim().slice(0, 2000) || null;
    const version = await withTransaction(async (client) => {
      await client.query(`SELECT id FROM ctr_contracts WHERE id = $1 FOR UPDATE`, [row.id]);
      const { rows: next } = await client.query(`SELECT COALESCE(MAX(no), 0) + 1 AS no FROM ctr_versions WHERE contract_id = $1`, [row.id]);
      const { rows } = await client.query(
        `INSERT INTO ctr_versions (contract_id, no, name, ext, mime, size, storage_key, comment, signed, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [row.id, next[0].no, originalName(file).slice(0, 255), ext || null, mimeOf(ext).slice(0, 120), file.size, file.storageKey, comment, signed, ctx.userId]
      );
      await client.query(
        `UPDATE ctr_contracts SET current_version_id = $2, signed_version_id = CASE WHEN $3 THEN $2 ELSE signed_version_id END, updated_at = NOW(), updated_by = $4 WHERE id = $1`,
        [row.id, rows[0].id, signed, ctx.userId]
      );
      await logEvent(client, row.id, 'version', { no: rows[0].no, name: rows[0].name, comment, signed }, ctx.userId);
      return rows[0];
    });
    committed = true;
    const fresh = await loadRow(row.id);
    const actor = await actorNameOf(ctx.userId);
    await notifyPeople(contractPeople(fresh), 'contracts.version', 'version', { no: version.no, comment, actor }, fresh, ctx.userId);
    await postChat(row.id, ctx.userId, { event: 'contract.version', no: version.no, name: version.name, comment: comment || undefined });
    emitContract('version_added', fresh, ctx.userId, { version: { id: version.id, no: version.no, name: version.name, size: Number(version.size), comment, signed } });
    return versionShape({ ...version, author_name: actor });
  } catch (err) {
    // Only a blob no version row points at is removed (a failed notification keeps the version).
    if (!committed) {
      await removeBlob(file.storageKey);
      throw err;
    }
    console.warn('[contracts] after adding a version:', err.message);
    const { rows } = await query(`SELECT v.*, COALESCE(u.display_name, u.username) AS author_name FROM ctr_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.contract_id = $1 AND v.storage_key = $2`, [row.id, file.storageKey]);
    return versionShape(rows[0]);
  }
}

async function versionRow(ctx, versionId) {
  const n = Number(versionId);
  if (!Number.isInteger(n) || n < 1) throw httpError(404, 'Version not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT * FROM ctr_versions WHERE id = $1`, [n]);
  if (!rows[0]) throw httpError(404, 'Version not found', 'NOT_FOUND');
  const contract = await loadRow(rows[0].contract_id);
  if (!contract || !(await canView(ctx, contract))) throw httpError(404, 'Version not found', 'NOT_FOUND');
  return { version: rows[0], contract };
}

/** Makes a version current, or (contracts.legal) marks it as the signed one. */
export async function updateVersion(ctx, versionId, input = {}) {
  const { version, contract } = await versionRow(ctx, versionId);
  if (input.current) {
    if (!canWorkFiles(ctx, contract)) throw httpError(403, 'You cannot change the versions', 'FORBIDDEN');
    await withTransaction(async (client) => {
      await client.query(`UPDATE ctr_contracts SET current_version_id = $2, updated_at = NOW() WHERE id = $1`, [contract.id, version.id]);
      await logEvent(client, contract.id, 'current', { no: version.no }, ctx.userId);
    });
  }
  if (typeof input.signed === 'boolean') {
    if (!ctx.isLegal && !canManageRisks(ctx, contract)) throw httpError(403, 'Only a lawyer marks the signed version', 'FORBIDDEN');
    await withTransaction(async (client) => {
      await client.query(`UPDATE ctr_versions SET signed = $2 WHERE id = $1`, [version.id, input.signed]);
      await client.query(
        `UPDATE ctr_contracts SET signed_version_id = CASE WHEN $3 THEN $2 WHEN signed_version_id = $2 THEN NULL ELSE signed_version_id END, updated_at = NOW() WHERE id = $1`,
        [contract.id, version.id, input.signed]
      );
      await logEvent(client, contract.id, input.signed ? 'signed_mark' : 'signed_unmark', { no: version.no }, ctx.userId);
    });
  }
  const { rows } = await query(`SELECT v.*, COALESCE(u.display_name, u.username) AS author_name FROM ctr_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.id = $1`, [version.id]);
  return versionShape(rows[0]);
}

/** The file of a version: inline when safe (PDF, images), else a download. */
export async function sendVersion(ctx, versionId, res, { download = false } = {}) {
  const { version } = await versionRow(ctx, versionId);
  const path = storagePath(version.storage_key);
  await sendBlob(res, path, { name: version.name, ext: version.ext || extOf(version.name), download });
}

/** A PDF preview of an Office version (through the document conversion service, when configured). */
export async function sendVersionPreview(ctx, versionId, res) {
  const { version } = await versionRow(ctx, versionId);
  const ext = version.ext || extOf(version.name);
  if (!CONVERTIBLE.has(ext)) throw httpError(400, 'No PDF preview for this file type', 'NO_PREVIEW');
  const path = storagePath(version.storage_key);
  const info = await stat(path).catch(() => null);
  if (!info) throw httpError(404, 'File is missing on the server', 'FILE_MISSING');
  const pdf = await officePreview({ cacheKey: `ctr-${version.id}`, version: info.mtime, path, name: version.name, ext });
  sendPdf(res, pdf, version.name.replace(/\.[^.]+$/, ''));
}
