import { createWriteStream } from 'fs';
import { open, unlink } from 'fs/promises';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';

/*
 * Helpers for saving what the editor sends back (PutFile bodies).
 */

const ZIP = new Set(['docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm', 'dotx', 'xltx', 'potx', 'odt', 'ods', 'odp', 'odg']);
const OLE = new Set(['doc', 'xls', 'ppt']);

/** True when `head` (first bytes) looks like a .ext office file. Text formats always pass. */
export function officeSignatureOk(head, ext) {
  if (ZIP.has(ext)) return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (OLE.has(ext)) return head.length >= 4 && head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
  if (ext === 'rtf') return head.subarray(0, 5).toString('latin1') === '{\\rtf';
  return true;
}

export async function checkOfficeFile(path, ext) {
  const handle = await open(path, 'r');
  try {
    const head = Buffer.alloc(8);
    const { bytesRead } = await handle.read(head, 0, 8, 0);
    if (!officeSignatureOk(head.subarray(0, bytesRead), ext)) {
      const error = new Error(`The saved content is not a valid .${ext} file`);
      error.statusCode = 400;
      error.code = 'FILE_CONTENT';
      throw error;
    }
  } finally {
    await handle.close();
  }
}

/**
 * Streams a request body into `path`, refusing more than `maxBytes`
 * (413). Returns the number of bytes written; the file is removed on failure.
 */
export async function bodyToFile(req, path, maxBytes) {
  const declared = Number(req.headers['content-length']);
  if (maxBytes && Number.isFinite(declared) && declared > maxBytes) {
    req.resume();
    throw Object.assign(new Error('File is too large'), { statusCode: 413, code: 'FILE_TOO_LARGE' });
  }
  let size = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (maxBytes && size > maxBytes) callback(Object.assign(new Error('File is too large'), { statusCode: 413, code: 'FILE_TOO_LARGE' }));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(req, counter, createWriteStream(path));
  } catch (err) {
    await unlink(path).catch(() => {});
    throw err.statusCode ? err : Object.assign(new Error('The upload was interrupted'), { statusCode: 400, code: 'UPLOAD_ABORTED' });
  }
  return size;
}
