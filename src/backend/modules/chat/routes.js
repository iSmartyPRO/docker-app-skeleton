import { Router } from 'express';
import { randomBytes } from 'crypto';
import { httpError, wrap } from '../shared/acl.js';
import { chatUploader, runUpload, sendFile } from './files.js';
import { openStream, setFocus } from './realtime.js';
import {
  addMembers,
  canUpload,
  chatContext,
  chatSettings,
  createGroup,
  deleteMessage,
  directRoom,
  directory,
  editMessage,
  entityRoom,
  fileForDownload,
  getRoom,
  listMessages,
  listRooms,
  markRead,
  postMessage,
  react,
  removeMember,
  roomFiles,
  roomMembers,
  searchMessages,
  setPrefs,
  storeUploads,
  typing,
  unreadTotal,
  updateRoom,
} from './service.js';

/** /api/app/chat — signed-in people. */
export function privateRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    req.chat = chatContext(req);
    next();
  });

  // Live events and presence
  router.get('/stream', (req, res) => openStream(req, res));
  router.post('/focus', wrap(async (req, res) => {
    res.json({ success: setFocus(req.user.id, req.body?.connection, { roomId: req.body?.roomId, visible: req.body?.visible }) });
  }));

  router.get('/', wrap(async (req, res) => {
    const settings = await chatSettings();
    res.json({
      success: true,
      unread: await unreadTotal(req.user.id),
      config: {
        allowGroups: settings.allowGroups !== false || req.chat.isAdmin,
        calls: Boolean(settings.callUrl),
        maxUploadMb: settings.maxUploadMb,
        editMinutes: settings.editMinutes,
      },
    });
  }));
  router.get('/unread', wrap(async (req, res) => res.json({ success: true, unread: await unreadTotal(req.user.id) })));
  router.get('/directory', wrap(async (req, res) => res.json({ success: true, people: await directory(req.chat, req.query.q) })));
  router.get('/search', wrap(async (req, res) => res.json({ success: true, messages: await searchMessages(req.chat, req.query.q) })));

  // Rooms
  router.get('/rooms', wrap(async (req, res) => res.json({ success: true, rooms: await listRooms(req.chat, req.query) })));
  router.post('/rooms', wrap(async (req, res) => res.status(201).json({ success: true, room: await createGroup(req.chat, req.body || {}) })));
  router.post('/direct/:userId', wrap(async (req, res) => res.json({ success: true, room: await directRoom(req.chat, req.params.userId) })));
  router.get('/entity/:type/:id', wrap(async (req, res) => res.json({ success: true, room: await entityRoom(req.chat, req.params.type, req.params.id) })));
  router.get('/rooms/:id', wrap(async (req, res) => res.json({ success: true, room: await getRoom(req.chat, req.params.id) })));
  router.put('/rooms/:id', wrap(async (req, res) => res.json({ success: true, room: await updateRoom(req.chat, req.params.id, req.body || {}) })));
  router.put('/rooms/:id/prefs', wrap(async (req, res) => res.json({ success: true, room: await setPrefs(req.chat, req.params.id, req.body || {}) })));
  router.get('/rooms/:id/members', wrap(async (req, res) => res.json({ success: true, members: await roomMembers(req.chat, req.params.id) })));
  router.post('/rooms/:id/members', wrap(async (req, res) => res.json({ success: true, members: await addMembers(req.chat, req.params.id, req.body?.userIds) })));
  router.delete('/rooms/:id/members/:userId', wrap(async (req, res) => {
    await removeMember(req.chat, req.params.id, req.params.userId);
    res.json({ success: true });
  }));
  router.post('/rooms/:id/read', wrap(async (req, res) => res.json({ success: true, ...(await markRead(req.chat, req.params.id, req.body?.messageId)) })));
  router.post('/rooms/:id/typing', wrap(async (req, res) => {
    await typing(req.chat, req.params.id);
    res.json({ success: true });
  }));
  router.get('/rooms/:id/files', wrap(async (req, res) => res.json({ success: true, files: await roomFiles(req.chat, req.params.id) })));

  // A video call: a fresh meeting link posted into the conversation.
  router.post('/rooms/:id/call', wrap(async (req, res) => {
    const settings = await chatSettings();
    if (!settings.callUrl) throw httpError(400, 'Calls are not set up', 'CALLS_OFF');
    const code = `portal-${req.params.id}-${randomBytes(6).toString('hex')}`;
    const url = settings.callUrl.replace('{room}', code);
    const message = await postMessage(req.chat, req.params.id, { body: url }, { call: { url } });
    res.json({ success: true, url, message });
  }));

  // Messages
  router.get('/rooms/:id/messages', wrap(async (req, res) => res.json({ success: true, ...(await listMessages(req.chat, req.params.id, req.query)) })));
  router.post('/rooms/:id/messages', wrap(async (req, res) => res.status(201).json({ success: true, message: await postMessage(req.chat, req.params.id, req.body || {}) })));
  router.put('/messages/:id', wrap(async (req, res) => res.json({ success: true, message: await editMessage(req.chat, req.params.id, req.body?.body) })));
  router.delete('/messages/:id', wrap(async (req, res) => {
    await deleteMessage(req.chat, req.params.id);
    res.json({ success: true });
  }));
  router.post('/messages/:id/reactions', wrap(async (req, res) => res.json({ success: true, message: await react(req.chat, req.params.id, req.body?.emoji) })));

  // Files
  router.post('/rooms/:id/files', wrap(async (req, res) => {
    // Nothing touches the disk before the room check.
    await canUpload(req.chat, req.params.id);
    const settings = await chatSettings();
    const files = await runUpload(chatUploader(settings.maxUploadMb || 100), req, res);
    res.status(201).json({ success: true, files: await storeUploads(req.chat, req.params.id, files) });
  }));
  router.get('/files/:id', wrap(async (req, res) => sendFile(res, await fileForDownload(req.chat, req.params.id), req.query.download === '1')));

  return router;
}
