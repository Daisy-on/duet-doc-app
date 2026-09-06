import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Transaction } from 'dexie';
import { db } from '../db';
import type { SyncEntityStateV2, SyncOutboxEntry, SyncOperation } from '../db';
import type { AIResponseMetadata } from '../ai/types';
import { toChatMessageSyncData, toChatSessionSyncData } from '../sync/chatSyncMapper';
import { DEFAULT_WORKSPACE_ID, enqueueMutationInTx } from '../sync/syncOutboxHelper';

export interface ReferencedDoc {
  id: string;
  title: string;
}

export interface KnowledgeSource {
  sourceId: string;
  sourceType: 'document' | 'memo';
  title: string;
  chunkIndex: number;
  headingPath: string[];
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  status?: 'streaming' | 'complete' | 'stopped' | 'error';
  thinkingContent?: string;
  thinkingDurationMs?: number;
  webSearchUrls?: { title: string; url: string }[];
  referencedDocs?: ReferencedDoc[];
  knowledgeSources?: KnowledgeSource[];
  aiMetadata?: AIResponseMetadata;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
}

interface AIWritingStore {
  sessions: ChatSession[];
  messages: ChatMessage[];
  activeSessionId: string | null;
  lastVisitedSessionId: string | null;
  isThinkingEnabled: boolean;

  initStore: () => Promise<void>;
  reloadFromDb: () => Promise<void>;

  // Actions
  createSession: (title?: string) => Promise<string>;
  updateSession: (id: string, updates: Partial<ChatSession>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  setActiveSessionId: (id: string | null) => void;
  setIsThinkingEnabled: (enabled: boolean) => void;

  addMessage: (msg: ChatMessage) => Promise<void>;
  updateMessageStream: (
    id: string,
    updates: {
      content?: string;
      thinkingContent?: string;
      status?: 'streaming' | 'complete' | 'stopped' | 'error';
    },
  ) => void;
  commitMessage: (msg: ChatMessage) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;
}

const generateId = () => nanoid(12);

const syncTables = () => [db.syncOutbox, db.syncEntityStatesV2, db.syncState];

function refreshSyncCounts() {
  void import('./syncStore')
    .then(({ useSyncStore }) => useSyncStore.getState().refreshCounts())
    .catch(() => undefined);
}

async function removePendingSessionTree(tx: Transaction, sessionId: string, messageIds: string[]) {
  const entityKeys = new Set([
    `chat_session:${sessionId}`,
    ...messageIds.map((messageId) => `chat_message:${messageId}`),
  ]);
  const outbox = tx.table<SyncOutboxEntry, string>('syncOutbox');
  const pendingEntries = await outbox.where('status').equals('pending').toArray();

  for (const entry of pendingEntries) {
    if (entry.workspaceId !== DEFAULT_WORKSPACE_ID) continue;
    const operations = entry.operations.filter(
      (operation) =>
        !(
          (operation.entity_type === 'chat_session' || operation.entity_type === 'chat_message') &&
          entityKeys.has(`${operation.entity_type}:${operation.entity_id}`)
        ),
    );
    if (operations.length === 0) await outbox.delete(entry.mutationId);
    else if (operations.length !== entry.operations.length) {
      await outbox.update(entry.mutationId, { operations });
    }
  }

  const entityStates = tx.table<SyncEntityStateV2, [string, string, string]>('syncEntityStatesV2');
  for (const messageId of messageIds) {
    const key: [string, 'chat_message', string] = [DEFAULT_WORKSPACE_ID, 'chat_message', messageId];
    const state = await entityStates.get(key);
    if (!state || state.serverRev === 0) await entityStates.delete(key);
  }
}

const sortSessions = (sessions: ChatSession[]) => {
  return [...sessions].sort((a, b) => {
    if (!!a.isPinned !== !!b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
  });
};

function deriveSessionActivity(sessions: ChatSession[], messages: ChatMessage[]): ChatSession[] {
  const latestMessageAt = new Map<string, number>();
  for (const message of messages) {
    latestMessageAt.set(
      message.sessionId,
      Math.max(latestMessageAt.get(message.sessionId) ?? 0, message.createdAt),
    );
  }
  return sessions.map((session) => ({
    ...session,
    updatedAt: Math.max(session.createdAt, latestMessageAt.get(session.id) ?? session.createdAt),
  }));
}

export const useAIWritingStore = create<AIWritingStore>((set, get) => ({
  sessions: [],
  messages: [],
  activeSessionId: null,
  lastVisitedSessionId: null,
  isThinkingEnabled: false,

  initStore: async () => {
    try {
      const dbSessions = await db.chatSessions.toArray();
      const dbMessages = await db.chatMessages.orderBy('createdAt').toArray();
      const messageSessionIds = new Set(dbMessages.map((m) => m.sessionId));

      // 过滤并自动清理数据库里没有实际消息记录的空白历史 Session
      const validSessions = deriveSessionActivity(
        dbSessions.filter((s) => messageSessionIds.has(s.id)),
        dbMessages,
      );
      const emptySessionIds = dbSessions
        .filter((s) => !messageSessionIds.has(s.id))
        .map((s) => s.id);
      if (emptySessionIds.length > 0) {
        await db.chatSessions.bulkDelete(emptySessionIds);
      }

      const sorted = sortSessions(validSessions);
      set({
        sessions: sorted,
        messages: dbMessages,
        activeSessionId: null,
      });
    } catch (err) {
      console.error('Failed to init AI Writing Store:', err);
    }
  },

  reloadFromDb: async () => {
    const [dbSessions, dbMessages] = await Promise.all([
      db.chatSessions.toArray(),
      db.chatMessages.orderBy('createdAt').toArray(),
    ]);
    const current = get();
    const streamingMessages = current.messages.filter((message) => message.status === 'streaming');
    const persistedIds = new Set(dbMessages.map((message) => message.id));
    const messages = [
      ...dbMessages,
      ...streamingMessages.filter((message) => !persistedIds.has(message.id)),
    ].sort((a, b) => a.createdAt - b.createdAt);
    const messageSessionIds = new Set(messages.map((message) => message.sessionId));
    const sessions = sortSessions(
      deriveSessionActivity(
        dbSessions.filter((session) => messageSessionIds.has(session.id)),
        messages,
      ),
    );
    const sessionIds = new Set(sessions.map((session) => session.id));

    set({
      sessions,
      messages,
      activeSessionId:
        current.activeSessionId && sessionIds.has(current.activeSessionId)
          ? current.activeSessionId
          : null,
      lastVisitedSessionId:
        current.lastVisitedSessionId && sessionIds.has(current.lastVisitedSessionId)
          ? current.lastVisitedSessionId
          : (sessions[0]?.id ?? null),
    });
  },

  createSession: async (title = '新对话') => {
    const state = get();
    // 检查是否已经存在未发送消息的空 Session，直接复用，避免创建多个空的“新对话”
    const existingEmpty = state.sessions.find(
      (s) => s.title === '新对话' && !state.messages.some((m) => m.sessionId === s.id),
    );
    if (existingEmpty) {
      set({ activeSessionId: existingEmpty.id, lastVisitedSessionId: existingEmpty.id });
      return existingEmpty.id;
    }

    const id = `session-${generateId()}`;
    const newSession: ChatSession = {
      id,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.chatSessions.add(newSession);
    set((s) => ({
      sessions: [newSession, ...s.sessions],
      activeSessionId: id,
      lastVisitedSessionId: id,
    }));
    return id;
  },

  updateSession: async (id, updates) => {
    const currentSession = get().sessions.find((session) => session.id === id);
    if (!currentSession) return;

    const normalizedUpdates = { ...updates };
    const hasChanges = Object.entries(normalizedUpdates).some(
      ([key, value]) => currentSession[key as keyof ChatSession] !== value,
    );
    if (!hasChanges) return;

    await db.transaction('rw', [db.chatSessions, db.chatMessages, ...syncTables()], async (tx) => {
      const sessions = tx.table<ChatSession, string>('chatSessions');
      await sessions.update(id, normalizedUpdates);
      const session = await sessions.get(id);
      if (!session) return;

      const [messageCount, syncState] = await Promise.all([
        tx.table<ChatMessage, string>('chatMessages').where('sessionId').equals(id).count(),
        tx
          .table<SyncEntityStateV2, [string, string, string]>('syncEntityStatesV2')
          .get([DEFAULT_WORKSPACE_ID, 'chat_session', id]),
      ]);
      if (messageCount > 0 || syncState) {
        await enqueueMutationInTx(tx, [
          {
            entity_type: 'chat_session',
            entity_id: id,
            operation: 'upsert',
            base_revision: 0,
            data: toChatSessionSyncData(session),
          },
        ]);
      }
    });
    refreshSyncCounts();
    set((state) => {
      const updated = state.sessions.map((s) => (s.id === id ? { ...s, ...normalizedUpdates } : s));
      return { sessions: sortSessions(updated) };
    });
  },

  deleteSession: async (id) => {
    await db.transaction('rw', [db.chatSessions, db.chatMessages, ...syncTables()], async (tx) => {
      const messages = tx.table<ChatMessage, string>('chatMessages');
      const messageIds = await messages.where('sessionId').equals(id).primaryKeys();
      await removePendingSessionTree(tx, id, messageIds);
      await tx.table<ChatSession, string>('chatSessions').delete(id);
      await messages.where('sessionId').equals(id).delete();
      await enqueueMutationInTx(tx, [
        {
          entity_type: 'chat_session',
          entity_id: id,
          operation: 'delete',
          base_revision: 0,
        },
      ]);
    });
    refreshSyncCounts();

    set((state) => {
      const filteredSessions = state.sessions.filter((s) => s.id !== id);
      const newActiveId =
        state.activeSessionId === id ? filteredSessions[0]?.id || null : state.activeSessionId;
      const newLastVisited =
        state.lastVisitedSessionId === id
          ? filteredSessions[0]?.id || null
          : state.lastVisitedSessionId;
      return {
        sessions: filteredSessions,
        messages: state.messages.filter((m) => m.sessionId !== id),
        activeSessionId: newActiveId,
        lastVisitedSessionId: newLastVisited,
      };
    });
  },

  setActiveSessionId: (id) => {
    if (get().activeSessionId === id) return;
    set((state) => ({
      activeSessionId: id,
      lastVisitedSessionId: id ? id : state.lastVisitedSessionId,
    }));
  },

  setIsThinkingEnabled: (enabled) => {
    set({ isThinkingEnabled: enabled });
  },

  addMessage: async (msg) => {
    const now = Date.now();
    await db.transaction('rw', [db.chatSessions, db.chatMessages, ...syncTables()], async (tx) => {
      const sessions = tx.table<ChatSession, string>('chatSessions');
      await tx.table<ChatMessage, string>('chatMessages').add(msg);
      await sessions.update(msg.sessionId, { updatedAt: now });

      const session = await sessions.get(msg.sessionId);
      if (!session) throw new Error('消息所属会话不存在');
      const messageData = toChatMessageSyncData(msg);
      if (!messageData) return;

      const sessionState = await tx
        .table<SyncEntityStateV2, [string, string, string]>('syncEntityStatesV2')
        .get([DEFAULT_WORKSPACE_ID, 'chat_session', session.id]);
      const operations: SyncOperation[] = [
        {
          entity_type: 'chat_session',
          entity_id: session.id,
          operation: 'upsert',
          base_revision: sessionState?.serverRev ?? 0,
          data: toChatSessionSyncData(session),
        },
      ];
      operations.push({
        entity_type: 'chat_message',
        entity_id: msg.id,
        operation: 'upsert',
        base_revision: 0,
        data: messageData,
      });
      await enqueueMutationInTx(tx, operations);
    });
    refreshSyncCounts();

    set((state) => {
      const updatedSessions = state.sessions.map((s) =>
        s.id === msg.sessionId ? { ...s, updatedAt: now } : s,
      );
      return {
        messages: [...state.messages, msg],
        sessions: sortSessions(updatedSessions),
      };
    });
  },

  updateMessageStream: (id, updates) => {
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
  },

  commitMessage: async (msg) => {
    const now = Date.now();
    await db.transaction('rw', [db.chatSessions, db.chatMessages, ...syncTables()], async (tx) => {
      const sessions = tx.table<ChatSession, string>('chatSessions');
      await tx.table<ChatMessage, string>('chatMessages').put(msg);
      await sessions.update(msg.sessionId, { updatedAt: now });
      const session = await sessions.get(msg.sessionId);
      if (!session) throw new Error('消息所属会话不存在');
      const data = toChatMessageSyncData(msg);
      if (data) {
        await enqueueMutationInTx(tx, [
          {
            entity_type: 'chat_session',
            entity_id: session.id,
            operation: 'upsert',
            base_revision: 0,
            data: toChatSessionSyncData(session),
          },
          {
            entity_type: 'chat_message',
            entity_id: msg.id,
            operation: 'upsert',
            base_revision: 0,
            data,
          },
        ]);
      }
    });
    refreshSyncCounts();

    set((state) => {
      const updatedSessions = state.sessions.map((s) =>
        s.id === msg.sessionId ? { ...s, updatedAt: now } : s,
      );
      return {
        messages: state.messages.map((m) => (m.id === msg.id ? msg : m)),
        sessions: sortSessions(updatedSessions),
      };
    });
  },

  removeMessage: async (id) => {
    await db.transaction('rw', [db.chatMessages, ...syncTables()], async (tx) => {
      const messages = tx.table<ChatMessage, string>('chatMessages');
      const message = await messages.get(id);
      await messages.delete(id);
      if (message && toChatMessageSyncData(message)) {
        await enqueueMutationInTx(tx, [
          {
            entity_type: 'chat_message',
            entity_id: id,
            operation: 'delete',
            base_revision: 0,
          },
        ]);
      }
    });
    refreshSyncCounts();
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    }));
  },
}));
