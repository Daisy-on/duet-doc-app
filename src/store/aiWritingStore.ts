import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { db } from '../db';

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
  webSearchUrls?: { title: string; url: string }[];
  referencedDocs?: ReferencedDoc[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface AIWritingStore {
  sessions: ChatSession[];
  messages: ChatMessage[];
  activeSessionId: string | null;
  isThinkingEnabled: boolean;

  initStore: () => Promise<void>;

  // Actions
  createSession: (title?: string) => Promise<string>;
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

export const useAIWritingStore = create<AIWritingStore>((set, get) => ({
  sessions: [],
  messages: [],
  activeSessionId: null,
  isThinkingEnabled: true,

  initStore: async () => {
    try {
      const dbSessions = await db.chatSessions.toArray();
      dbSessions.sort((a, b) => b.updatedAt - a.updatedAt);
      const dbMessages = await db.chatMessages.orderBy('createdAt').toArray();
      set({ 
        sessions: dbSessions, 
        messages: dbMessages,
        activeSessionId: dbSessions[0]?.id || null,
      });
    } catch (err) {
      console.error('Failed to init AI Writing Store:', err);
    }
  },

  createSession: async (title = '新对话') => {
    const id = `session-${generateId()}`;
    const newSession: ChatSession = {
      id,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.chatSessions.add(newSession);
    set((state) => ({
      sessions: [newSession, ...state.sessions],
      activeSessionId: id,
    }));
    return id;
  },

  deleteSession: async (id) => {
    await db.transaction('rw', [db.chatSessions, db.chatMessages], async () => {
      await db.chatSessions.delete(id);
      await db.chatMessages.where('sessionId').equals(id).delete();
    });

    set((state) => {
      const filteredSessions = state.sessions.filter((s) => s.id !== id);
      const newActiveId = state.activeSessionId === id ? filteredSessions[0]?.id || null : state.activeSessionId;
      return {
        sessions: filteredSessions,
        messages: state.messages.filter((m) => m.sessionId !== id),
        activeSessionId: newActiveId,
      };
    });
  },

  setActiveSessionId: (id) => {
    set({ activeSessionId: id });
  },

  setIsThinkingEnabled: (enabled) => {
    set({ isThinkingEnabled: enabled });
  },

  addMessage: async (msg) => {
    await db.chatMessages.add(msg);
    set((state) => ({
      messages: [...state.messages, msg],
    }));

    // 如果是首条用户消息，自动更新 Session 标题
    const session = get().sessions.find((s) => s.id === msg.sessionId);
    if (session && session.title === '新对话' && msg.role === 'user') {
      const newTitle = msg.content.length > 15 ? msg.content.substring(0, 15) + '...' : msg.content;
      const updatedAt = Date.now();
      await db.chatSessions.update(msg.sessionId, { title: newTitle, updatedAt });
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === msg.sessionId ? { ...s, title: newTitle, updatedAt } : s)),
      }));
    }
  },

  updateMessageStream: (id, updates) => {
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
  },

  commitMessage: async (msg) => {
    await db.chatMessages.put(msg);
    set((state) => ({
      messages: state.messages.map((m) => (m.id === msg.id ? msg : m)),
    }));
  },

  removeMessage: async (id) => {
    await db.chatMessages.delete(id);
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    }));
  },
}));
