import { endpoints } from './introspect.js';
import { ERRORS, SECTIONS } from './reference.js';
import { EVENT_CATALOG } from './events.js';
import { pick } from '../services/i18n/index.js';

/*
 * OpenAPI 3.1 description of /api/v1, built from the same data as the
 * developer portal. Imports into Postman, Insomnia, Swagger UI and code
 * generators.
 */

const text = (value, lang) => (value && typeof value === 'object' ? pick(value, lang) : value || '');

function schemaFor(type) {
  const t = String(type || '');
  if (/\[\]$/.test(t)) return { type: 'array', items: schemaFor(t.slice(0, -2)) };
  if (/^integer|^id$|^0–3$/.test(t)) return { type: 'integer' };
  if (/^boolean/.test(t)) return { type: 'boolean' };
  if (/date/.test(t)) return { type: 'string', format: t.includes('time') ? 'date-time' : 'date' };
  const parts = t.split('|').map((part) => part.trim());
  if (parts.every((part) => /^"[^"]+"$/.test(part))) return { type: 'string', enum: parts.map((part) => part.slice(1, -1)) };
  return { type: 'string' };
}

export function openApi({ origin, lang = 'en', appName = 'Portal', version = '1.0.0' }) {
  const paths = {};
  for (const endpoint of endpoints()) {
    const path = endpoint.path.replace(/:(\w+)(\([^)]*\))?/g, '{$1}').replace(/(.)\/$/, '$1');
    const doc = endpoint.doc || {};
    const params = [...endpoint.path.matchAll(/:(\w+)/g)].map(([, name]) => ({ name, in: 'path', required: true, schema: { type: 'string' } }));
    for (const item of doc.query || []) {
      for (const name of item.name.split('/').map((part) => part.trim())) {
        params.push({ name, in: 'query', required: Boolean(item.required), description: text(item.desc, lang), schema: schemaFor(item.type) });
      }
    }
    const operation = {
      tags: [text(SECTIONS.find((section) => section.key === endpoint.section)?.title, lang)],
      summary: text(doc.summary, lang) || `${endpoint.method} ${endpoint.path}`,
      description: [text(doc.description, lang), endpoint.area ? `Scope: \`${endpoint.area}:${endpoint.level}\`` : ''].filter(Boolean).join('\n\n'),
      operationId: `${endpoint.method.toLowerCase()}${path.replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))}`,
      parameters: params,
      'x-scope': endpoint.area ? `${endpoint.area}:${endpoint.level}` : null,
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' }, ...(doc.response ? { example: doc.response } : {}) } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        429: { $ref: '#/components/responses/RateLimited' },
      },
    };
    if (doc.body || doc.example) {
      const properties = {};
      const required = [];
      for (const item of doc.body || []) {
        for (const name of item.name.split('/').map((part) => part.trim())) {
          properties[name] = { ...schemaFor(item.type), description: text(item.desc, lang) };
          if (item.required) required.push(name);
        }
      }
      operation.requestBody = {
        content: { 'application/json': { schema: { type: 'object', properties, ...(required.length ? { required } : {}) }, ...(doc.example ? { example: doc.example } : {}) } },
      };
    }
    paths[path] = paths[path] || {};
    paths[path][endpoint.method.toLowerCase()] = operation;
  }

  const errorSchema = { type: 'object', properties: { success: { type: 'boolean', const: false }, code: { type: 'string' }, error: { type: 'string' } } };
  return {
    openapi: '3.1.0',
    info: {
      title: `${appName} API`,
      version,
      description: text({ ru: 'REST API портала. Авторизация — токеном в заголовке `Authorization: Bearer`.', en: 'Portal REST API. Authenticate with a token in `Authorization: Bearer`.', ky: 'Порталдын REST API\'си. Аутентификация — `Authorization: Bearer` башындагы токен менен.', tr: 'Portal REST API\'si. `Authorization: Bearer` başlığındaki bir belirteçle kimlik doğrulayın.', zh: '门户 REST API。在 `Authorization: Bearer` 请求头中使用令牌进行认证。' }, lang),
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ bearer: [] }],
    tags: SECTIONS.map((section) => ({ name: text(section.title, lang), description: text(section.intro, lang) })),
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'pat_…' }, apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } },
      schemas: { Error: errorSchema },
      responses: {
        Unauthorized: { description: 'Token missing, invalid, expired or revoked', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        Forbidden: { description: 'Scope, rule, IP or owner rights deny the request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        RateLimited: { description: 'Too many requests', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    'x-errors': ERRORS.map((error) => ({ status: error.status, code: error.code, description: text(error.text, lang) })),
    'x-webhook-events': EVENT_CATALOG.map((event) => event.type),
  };
}
