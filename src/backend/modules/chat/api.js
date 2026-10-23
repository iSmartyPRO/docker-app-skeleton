/*
 * Public API of the Chat module for other modules (docs/chat.md). Chat is an
 * optional link for everyone (manifest `enhances`), so modules reach it at
 * run time, never by import:
 *
 *   import { modules } from '../../platform/registry.js';
 *   modules.whenLoaded('chat', (chat) => chat.registerChatEntity('task', adapter));
 *   await modules.loaded('chat')?.api.postSystem('task', id, { actorId, data });
 *
 * Everything else in this folder is internal.
 */

export { registerChatEntity, entityAdapter, entityTypes } from './entities.js';
export { postSystem, importHistory } from './service.js';
export { removeStored } from './files.js';
