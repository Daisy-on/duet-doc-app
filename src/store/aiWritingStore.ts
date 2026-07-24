import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { db } from '../db';
import type { AIResponseMetadata } from '../ai/types';

export interface ReferencedDoc {
  id: string;
  title: string;
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

  // Actions
  createSession: (title?: string) => Promise<string>;
  updateSession: (id: string, updates: Partial<ChatSession>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  setActiveSessionId: (id: string | null) => void;
  setIsThinkingEnabled: (enabled: boolean) => void;
  
  addMessage: (msg: ChatMessage) => Promise<void>;
  updateMessageStream: (
    id: string,
    updates: { content?: string; thinkingContent?: string; status?: 'streaming' | 'complete' | 'stopped' | 'error' }
  ) => void;
  commitMessage: (msg: ChatMessage) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;
}

const generateId = () => nanoid(12);

const sortSessions = (sessions: ChatSession[]) => {
  return [...sessions].sort((a, b) => {
    if (!!a.isPinned !== !!b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });
};

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
      const validSessions = dbSessions.filter((s) => messageSessionIds.has(s.id));
      const emptySessionIds = dbSessions.filter((s) => !messageSessionIds.has(s.id)).map((s) => s.id);
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

  createSession: async (title = '新对话') => {
    const state = get();
    // 检查是否已经存在未发送消息的空 Session，直接复用，避免创建多个空的“新对话”
    const existingEmpty = state.sessions.find(
      (s) => s.title === '新对话' && !state.messages.some((m) => m.sessionId === s.id)
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
    await db.chatSessions.update(id, updates);
    set((state) => {
      const updated = state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s));
      return { sessions: sortSessions(updated) };
    });
  },

  deleteSession: async (id) => {
    await db.transaction('rw', [db.chatSessions, db.chatMessages], async () => {
      await db.chatSessions.delete(id);
      await db.chatMessages.where('sessionId').equals(id).delete();
    });

    set((state) => {
      const filteredSessions = state.sessions.filter((s) => s.id !== id);
      const newActiveId = state.activeSessionId === id ? filteredSessions[0]?.id || null : state.activeSessionId;
      const newLastVisited = state.lastVisitedSessionId === id ? filteredSessions[0]?.id || null : state.lastVisitedSessionId;
      return {
        sessions: filteredSessions,
        messages: state.messages.filter((m) => m.sessionId !== id),
        activeSessionId: newActiveId,
        lastVisitedSessionId: newLastVisited,
      };
    });
  },

  setActiveSessionId: (id) => {
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
    await db.chatMessages.add(msg);
    await db.chatSessions.update(msg.sessionId, { updatedAt: now });

    set((state) => {
      const updatedSessions = state.sessions.map((s) =>
        s.id === msg.sessionId ? { ...s, updatedAt: now } : s
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
    await db.chatMessages.put(msg);
    await db.chatSessions.update(msg.sessionId, { updatedAt: now });

    set((state) => {
      const updatedSessions = state.sessions.map((s) =>
        s.id === msg.sessionId ? { ...s, updatedAt: now } : s
      );
      return {
        messages: state.messages.map((m) => (m.id === msg.id ? msg : m)),
        sessions: sortSessions(updatedSessions),
      };
    });
  },

  removeMessage: async (id) => {
    await db.chatMessages.delete(id);
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    }));
  },
}));
