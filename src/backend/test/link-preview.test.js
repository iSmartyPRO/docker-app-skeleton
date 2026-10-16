import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanText,
  countsAsView,
  describe as describePreview,
  escapeHtml,
  excerpt,
  formatSize,
  headTags,
  injectHead,
  isBot,
  isPreviewBot,
  previewLocale,
  siteInfo,
} from '../services/linkPreview/meta.js';
import { parseRoute } from '../services/linkPreview/index.js';
import { cardKey, cardSvg, imageSize, layoutTitle, wrapText } from '../services/linkPreview/card.js';
import { loadMetrics } from '../services/linkPreview/fontMetrics.js';

const site = { name: 'Example', description: 'Корпоративный портал', color: '#1E3A6E', iconUrl: null, logoUrl: null };
const regional = { timeZone: 'Asia/Bishkek', dateFormat: 'DD.MM.YYYY', timeFormat: '24' };
const ru = (model) => describePreview(model, { site, locale: 'ru', regional });

test('link preview: HTML escaping keeps injected markup inert', () => {
  assert.equal(escapeHtml(`"><script>alert('x')</script>&`), '&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;');
  const text = ru({ state: 'ok', module: 'files', kind: 'file', name: '"><img src=x onerror=alert(1)>.pdf', perms: ['view'], size: 10 });
  const tags = headTags({ text, site: { ...site, name: '</title><script>x</script>' }, locale: 'ru', url: 'https://p.example/l/abc"onload="x', image: { url: 'https://p.example/api/og/l/abc.png?v=1', width: 1200, height: 630 } });
  assert.ok(!/<script/i.test(tags));
  assert.ok(!/<img/i.test(tags));
  assert.ok(!tags.includes('"onload="'));
  // Every tag is one of ours.
  for (const line of tags.split('\n')) assert.match(line.trim(), /^<(title>|meta |link )/);
  const html = injectHead('<!doctype html><html lang="en"><head><!-- link-preview:start --><title>x</title><!-- link-preview:end --></head><body></body></html>', tags, 'ru');
  assert.ok(html.startsWith('<!doctype html><html lang="ru">'));
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.ok(html.includes('&lt;/title&gt;&lt;script&gt;'));
});

test('link preview: injection without markers replaces the static title and description', () => {
  const html = injectHead('<html><head><meta name="description" content="Application console" /><title>docker-app-skeleton</title></head></html>', '<title>New</title>', 'en');
  assert.ok(!html.includes('docker-app-skeleton'));
  assert.ok(!html.includes('Application console'));
  assert.ok(html.includes('<html lang="en"><head>\n    <title>New</title>'));
});

test('link preview: clean text strips control and bidi characters and shortens', () => {
  assert.equal(cleanText('a‮b\u0000c\n\n d'), 'a b c d');
  const long = cleanText('слово '.repeat(100), 50);
  assert.ok(long.length <= 50);
  assert.ok(long.endsWith('…'));
});

test('link preview: file facts — type, size, rights, expiry, sender', () => {
  const text = ru({ state: 'ok', module: 'files', kind: 'file', name: 'Договор.pdf', ext: 'pdf', size: 2.4 * 1024 * 1024, perms: ['view', 'download'], expiresAt: '2026-10-21T10:00:00Z', owner: 'Иван Петров' });
  assert.equal(text.title, 'Договор.pdf');
  assert.equal(text.description, 'PDF · 2,4 МБ · Можно скачать · Доступно до 21.10.2026 · Отправитель: Иван Петров');
  assert.equal(text.card.icon, 'file');
  assert.equal(text.card.badge, 'PDF');
  assert.deepEqual(text.card.lines, ['PDF · 2,4 МБ', 'Можно скачать · Доступно до 21.10.2026']);
  const en = describePreview({ state: 'ok', module: 'drive', kind: 'file', name: 'photo.JPG', size: 3_300_000, perms: ['view'] }, { site, locale: 'en', regional });
  assert.equal(en.description, 'Image JPG · 3.1 MB · View only');
});

test('link preview: folder facts and custom link title', () => {
  const text = ru({ state: 'ok', module: 'files', kind: 'folder', name: 'Проект', title: 'Документы для банка', files: 12, folders: 3, perms: ['view', 'download', 'upload'] });
  assert.equal(text.title, 'Документы для банка');
  assert.match(text.description, /^Проект · Папка · 12 файлов, 3 папки · Можно скачать · Можно загрузить файлы$/);
  assert.equal(ru({ state: 'ok', module: 'files', kind: 'folder', name: 'X', files: 1, folders: 0, perms: ['view'] }).card.lines[0], 'Папка · 1 файл');
  assert.equal(ru({ state: 'ok', module: 'files', kind: 'folder', name: 'X', files: 0, folders: 0, perms: ['view'] }).card.lines[0], 'Папка · пусто');
  // Without file-server facts (people opening a Drive link) the count is simply left out.
  assert.equal(ru({ state: 'ok', module: 'drive', kind: 'folder', name: 'X', perms: ['view'] }).card.lines[0], 'Папка');
});

test('link preview: upload-only links say what to do and never list the folder', () => {
  const text = ru({ state: 'ok', module: 'drive', kind: 'folder', name: 'Входящие', files: 99, perms: ['upload'], owner: 'Анна', note: 'Пришлите сканы' });
  assert.equal(text.card.icon, 'upload');
  assert.ok(text.description.includes('Отправьте файлы — их получит Анна'));
  assert.ok(text.description.includes('Содержимое папки скрыто'));
  assert.ok(text.description.startsWith('Пришлите сканы'));
  assert.ok(!/99|файлов/.test(text.description));
});

test('link preview: locked, invalid and employees-only cards are generic', () => {
  const locked = ru({ state: 'locked' });
  assert.equal(locked.title, '🔒 Доступ по паролю');
  assert.equal(locked.card.icon, 'locked');
  const invalid = ru({ state: 'invalid' });
  assert.equal(invalid.title, 'Ссылка недействительна или истекла');
  assert.equal(ru({ state: 'employees' }).card.icon, 'employees');
  // Nothing of the resource leaks into them.
  for (const text of [locked, invalid]) assert.ok(!/\.pdf|Папка|МБ/.test(JSON.stringify(text)));
});

test('link preview: knowledge base cards use the excerpt', () => {
  const article = ru({ state: 'ok', module: 'kb', kind: 'article', name: 'Отпуск', excerpt: 'Как оформить отпуск: заявление подаётся за две недели.' });
  assert.equal(article.title, 'Отпуск');
  assert.equal(article.card.icon, 'article');
  assert.ok(article.description.startsWith('Как оформить отпуск'));
  const folder = ru({ state: 'ok', module: 'kb', kind: 'folder', name: 'HR', title: 'Онбординг', items: 5 });
  assert.equal(folder.title, 'Онбординг');
  assert.equal(folder.card.lines[0], 'База знаний · 5 материалов');
});

test('link preview: article excerpts skip headings and markup', () => {
  const md = '# Заголовок\n\n![img](x.png)\n\nПервый **абзац** со [ссылкой](https://x) и текстом, достаточно длинный для превью.\n\nВторой.';
  assert.equal(excerpt(md, { skip: 'Заголовок' }), 'Первый абзац со ссылкой и текстом, достаточно длинный для превью. Второй.');
  const html = '<h1>Title</h1><p>Hello <b>world</b> &amp; friends, this is the first paragraph of it.</p><script>alert(1)</script>';
  assert.equal(excerpt(html, { html: true }), 'Hello world & friends, this is the first paragraph of it.');
  assert.ok(excerpt('word '.repeat(200)).length <= 160);
});

test('link preview: site card and skeleton defaults', () => {
  const info = siteInfo({ appName: 'docker-app-skeleton', appDescription: 'Premium application skeleton on React, Express and PostgreSQL', appearance: { customColors: { colorPrimary: '#0F766E' } } }, 'ru');
  assert.equal(info.name, 'Портал');
  assert.equal(info.description, 'Корпоративный портал');
  assert.equal(info.color, '#0F766E');
  assert.equal(previewLocale({ defaultLocale: 'auto' }), 'ru');
  assert.equal(previewLocale({ defaultLocale: 'en' }), 'en');
  const text = describePreview({ state: 'site' }, { site, locale: 'ru' });
  assert.equal(text.title, 'Example');
  const tags = headTags({ text, site, locale: 'ru', url: 'https://p.example/', image: null });
  assert.ok(tags.includes('<title>Example</title>'));
  assert.ok(tags.includes('og:locale" content="ru_RU"'));
  assert.ok(tags.includes('twitter:card" content="summary"'));
});

test('link preview: sizes', () => {
  assert.equal(formatSize(0), '0 Б');
  assert.equal(formatSize(1536), '1,5 КБ');
  assert.equal(formatSize(1536, 'en'), '1.5 KB');
  assert.equal(formatSize(15 * 1024 * 1024), '15 МБ');
  assert.equal(formatSize(NaN), '');
});

test('link preview: crawler detection', () => {
  const bots = [
    'WhatsApp/2.23.20.0 A',
    'TelegramBot (like TwitterBot)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; vkShare; +http://vk.com/dev/Share)',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5',
    'Viber/14.0 CFNetwork',
  ];
  for (const ua of bots) {
    assert.ok(isPreviewBot(ua), ua);
    assert.ok(isBot(ua), ua);
  }
  const people = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; CUBOT KingKong) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
  ];
  for (const ua of people) assert.ok(!isBot(ua), ua);
  assert.ok(isBot(''));
  assert.ok(isBot('curl/8.5.0'));
});

test('link preview: only GET requests of people count as views', () => {
  const req = (method, ua) => ({ method, get: (name) => (name === 'user-agent' ? ua : undefined) });
  const chrome = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
  assert.equal(countsAsView(req('GET', chrome)), true);
  assert.equal(countsAsView(req('HEAD', chrome)), false);
  assert.equal(countsAsView(req('GET', 'WhatsApp/2.23.20.0 A')), false);
  assert.equal(countsAsView(req('GET', 'TelegramBot (like TwitterBot)')), false);
});

test('link preview: page routes', () => {
  assert.deepEqual(parseRoute('/l/AbC_1-2'), { module: 'files', token: 'AbC_1-2', path: '/l/AbC_1-2' });
  assert.deepEqual(parseRoute('/d/mLoqaWxrzH-OtsSS/'), { module: 'drive', token: 'mLoqaWxrzH-OtsSS', path: '/d/mLoqaWxrzH-OtsSS' });
  assert.equal(parseRoute('/s/Onboarding/d/12').itemId, 12);
  assert.equal(parseRoute('/s/onboarding/f/7').folderId, 7);
  assert.equal(parseRoute('/s/onboarding/f/7').path, '/s/onboarding/f/7');
  for (const path of ['/', '/login', '/app/files', '/l/', '/l/a/b', '/l/<x>', '/d/a"b', '/s/x/q/1']) assert.equal(parseRoute(path), null, path);
});

test('link preview: card text fits and wraps with the bundled font', () => {
  const metrics = loadMetrics(new URL('../assets/fonts/Inter-Bold.ttf', import.meta.url).pathname);
  for (const char of 'АЯЁёңөүқ') assert.ok(metrics.has(char), char);
  const { lines } = wrapText('Очень длинное название файла для проверки переноса строк на карточке превью и многоточия в конце', { font: metrics, size: 60, width: 700, maxLines: 2 });
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'));
  for (const line of lines) assert.ok(metrics.width(line, 60) <= 700);
  const title = layoutTitle('Короткое', { width: 700 });
  assert.equal(title.size, 64);
  assert.deepEqual(title.lines, ['Короткое']);
});

test('link preview: card SVG escapes text and keys change with content', () => {
  const card = { icon: 'file', color: '#E5484D', badge: 'PDF', title: '<script>&"', lines: ['PDF · 1 МБ'], footer: 'Отправитель: <b>' };
  const svg = cardSvg({ card, site, host: 'portal.example' });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(!svg.includes('<b>'));
  const a = cardKey({ card, site, host: 'portal.example' });
  assert.equal(a, cardKey({ card: { ...card }, site, host: 'portal.example' }));
  assert.notEqual(a, cardKey({ card: { ...card, title: 'Other' }, site, host: 'portal.example' }));
  assert.notEqual(a, cardKey({ card, site: { ...site, name: 'Other' }, host: 'portal.example' }));
  assert.notEqual(a, cardKey({ card, site, host: 'portal.example', thumbKey: 'v2' }));
});

test('link preview: image sizes of embedded pictures', () => {
  const png = Buffer.alloc(32);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.deepEqual(imageSize(png), { type: 'png', width: 640, height: 480 });
  assert.equal(imageSize(Buffer.from('not an image at all')), null);
});
