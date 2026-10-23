import { formatBytes } from '../../lib/format';

/** Visual and viewer classification of a knowledge-base item. */
const EXT_TYPE = {
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', heic: 'image',
  doc: 'word', docx: 'word', odt: 'word', rtf: 'word',
  xls: 'excel', xlsx: 'excel', ods: 'excel', csv: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', odp: 'powerpoint',
  txt: 'text', md: 'text', json: 'text', xml: 'text', log: 'text',
  mp4: 'video', webm: 'video', mov: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio',
  zip: 'archive', '7z': 'archive', rar: 'archive',
};

export const TYPE_STYLE = {
  folder: { color: '#3B82F6', label: '' },
  article: { color: '#4F46E5', label: 'MD' },
  link: { color: '#0EA5A4', label: 'URL' },
  pdf: { color: '#E5484D', label: 'PDF' },
  image: { color: '#8E4EC6', label: 'IMG' },
  word: { color: '#2B579A', label: 'DOC' },
  excel: { color: '#217346', label: 'XLS' },
  powerpoint: { color: '#D24726', label: 'PPT' },
  text: { color: '#64748B', label: 'TXT' },
  video: { color: '#E54666', label: 'VID' },
  audio: { color: '#F76B15', label: 'AUD' },
  archive: { color: '#A18072', label: 'ZIP' },
  file: { color: '#7C8798', label: 'FILE' },
};

export function itemType(item) {
  if (item.kind === 'article') return 'article';
  if (item.kind === 'link') return 'link';
  return EXT_TYPE[item.file?.ext] || 'file';
}

/** Formats rendered with server conversion to PDF (best fidelity). */
const CONVERTIBLE = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'odt', 'ods', 'odp', 'rtf']);

/**
 * Which viewer opens an item:
 *  pdf · image · sheet (xlsx/csv grid) · docx (browser render) · converted (PDF of an office file)
 *  text · markdown · video · audio · none
 */
export function viewerFor(item, { conversion }) {
  const type = itemType(item);
  const ext = item.file?.ext;
  if (type === 'article') return 'article';
  if (type === 'link') return 'link';
  if (type === 'pdf') return 'pdf';
  if (type === 'image') return ext === 'heic' ? 'none' : 'image';
  if (ext === 'xlsx' || ext === 'csv') return 'sheet';
  if (conversion && CONVERTIBLE.has(ext)) return 'converted';
  if (ext === 'docx') return 'docx';
  if (type === 'text') return ext === 'md' ? 'markdown' : 'text';
  if (type === 'video') return 'video';
  if (type === 'audio') return 'audio';
  return 'none';
}

/** File size in the interface language (lib/format.js). */
export const formatSize = (bytes) => formatBytes(bytes);

export const FOLDER_COLORS = [
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F97316',
  '#F59E0B', '#84CC16', '#10B981', '#14B8A6', '#06B6D4', '#64748B',
];
