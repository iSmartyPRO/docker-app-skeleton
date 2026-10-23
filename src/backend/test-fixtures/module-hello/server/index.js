import { Router } from 'express';
import { query, httpError } from '@portal/sdk';
import { greet } from './greet.js';

/* Test fixture of a module package (test/module-packages*.test.js): one route, one table, one page. */
let registered = 0;

export default {
  id: 'hello',
  api: { greet, registered: () => registered },
  routes() {
    const router = Router();
    router.get('/ping', async (req, res) => {
      const { rows } = await query('SELECT count(*)::int AS n FROM hello_messages');
      res.json({ success: true, pong: greet(req.user?.username || 'you'), messages: rows[0].n });
    });
    router.get('/fail', () => {
      throw httpError(418, 'teapot', 'TEAPOT');
    });
    return router;
  },
  publicPrefix: '/hello-public',
  publicRoutes() {
    const router = Router();
    router.get('/ping', async (req, res) => {
      const { rows } = await query('SELECT count(*)::int AS n FROM hello_messages');
      res.json({ success: true, pong: greet('guest'), messages: rows[0].n });
    });
    return router;
  },
  register(ctx) {
    if (!ctx?.modules) throw new Error('register(ctx) needs ctx.modules');
    registered += 1;
  },
};
