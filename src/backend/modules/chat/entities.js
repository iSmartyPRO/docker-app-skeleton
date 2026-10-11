/*
 * Entity chats: a module lets records of its own have a conversation.
 *
 *   registerChatEntity('task', {
 *     access(req, id)    → { view, write, title, subtitle, link, color } | null
 *     describe(id)       → { title, link } without a person (rooms made by the system)
 *     participants(id)   → user ids who follow the record (get unread counts and pushes)
 *     seed(roomId, id)   → optional: import history when the room is first made
 *   })
 *
 * The room's access is exactly the record's access: the chat module never
 * stores who may read an entity conversation.
 */

const adapters = new Map();

export function registerChatEntity(type, adapter) {
  adapters.set(type, adapter);
}

export function entityAdapter(type) {
  return adapters.get(type) || null;
}

export function entityTypes() {
  return [...adapters.keys()];
}
