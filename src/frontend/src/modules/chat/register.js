/*
 * Frontend entry of the Chat module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazy } from 'react';
import { contribute, provideModule } from '../../platform/extensions';
import { ChatProvider } from './ChatContext';
import { chatApi } from './api';

// Live state of conversations for the whole app (unread counts, the header button).
contribute('app.providers', { id: 'chat', order: 10, Component: ChatProvider });

// The chat button in the top bar.
contribute('header.actions', { id: 'chat', module: 'chat', order: 10, Component: lazy(() => import('./components/ChatButton')) });

// What other modules may use when Chat is installed (manifest «enhances»): a record's conversation.
provideModule('chat', {
  Conversation: lazy(() => import('./components/Conversation')),
  chatApi,
});
