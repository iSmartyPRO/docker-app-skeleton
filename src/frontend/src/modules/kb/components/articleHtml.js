import { marked } from 'marked';
import TurndownService from 'turndown';

/*
 * Article bodies keep their files as `kbfile:<id>` (in Markdown and in HTML).
 * The visual editor works on real URLs, so these helpers translate both ways,
 * and convert an article between Markdown and HTML when its format changes.
 */

const KBFILE = /^kbfile:(\d{1,10})$/;
// URLs the editor may have produced for a file (attachments or Files).
const FILE_URL = /\/api\/app\/(?:kb\/items\/\d+\/attachments|files\/nodes)\/(\d{1,10})(?:\/file)?(?:[?#].*)?$/;

function parse(html) {
  return new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html').body;
}

/** kbfile:<id> → real URLs (with data-kbfile) for the editor. */
export function toEditorHtml(html, urlOf) {
  if (!html) return '';
  const body = parse(html);
  body.querySelectorAll('img[src], a[href]').forEach((element) => {
    const attr = element.tagName === 'IMG' ? 'src' : 'href';
    const match = KBFILE.exec(element.getAttribute(attr) || '');
    if (!match) return;
    element.setAttribute('data-kbfile', match[1]);
    element.setAttribute(attr, urlOf(Number(match[1])));
  });
  return body.innerHTML;
}

/** Editor HTML → stored HTML: files go back to kbfile:<id>, local previews never leak. */
export function fromEditorHtml(html) {
  const body = parse(html);
  body.querySelectorAll('img, a').forEach((element) => {
    const attr = element.tagName === 'IMG' ? 'src' : 'href';
    const value = element.getAttribute(attr) || '';
    const id = element.getAttribute('data-kbfile') || FILE_URL.exec(value)?.[1];
    element.removeAttribute('data-kbfile');
    if (id) element.setAttribute(attr, `kbfile:${id}`);
    else if (/^blob:/i.test(value)) element.remove();
  });
  return body.innerHTML;
}

/** Markdown → HTML for the visual editor (kbfile: links are kept as they are). */
export function markdownToHtml(text) {
  return text ? marked.parse(String(text), { gfm: true, breaks: false }) : '';
}

let turndown;
/** HTML → Markdown; what Markdown cannot express (tables, alignment) stays as HTML. */
export function htmlToMarkdown(html) {
  if (!html) return '';
  if (!turndown) {
    turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '_' });
    turndown.keep(['table', 'mark', 'u']);
    turndown.addRule('taskItem', {
      filter: (node) => node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
      replacement: (content, node) => `- [${node.getAttribute('data-checked') === 'true' ? 'x' : ' '}] ${content.trim().replace(/\n+/g, ' ')}\n`,
    });
    turndown.addRule('alignedBlock', {
      filter: (node) => /^(P|H[1-6])$/.test(node.nodeName) && /text-align:\s*(center|right)/.test(node.getAttribute('style') || ''),
      replacement: (content, node) => `\n\n${node.outerHTML.replace(/\sdata-[a-z-]+="[^"]*"/g, '')}\n\n`,
    });
  }
  return turndown.turndown(html).trim();
}
