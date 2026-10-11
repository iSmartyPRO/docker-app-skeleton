import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listNotifications, markRead, unreadCount } from '../services/notifications.js';

/** The bell: inbox, unread counter, mark as read. */
const router = Router();
router.use(requireAuth);

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

router.get('/', wrap(async (req, res) => {
  res.json({
    success: true,
    ...(await listNotifications(req.user.id, {
      before: req.query.before,
      limit: req.query.limit,
      unreadOnly: req.query.unread === '1',
    })),
  });
}));

router.get('/unread', wrap(async (req, res) => {
  res.json({ success: true, unread: await unreadCount(req.user.id) });
}));

router.post('/read', wrap(async (req, res) => {
  res.json({ success: true, unread: await markRead(req.user.id, req.body || {}) });
}));

export default router;
