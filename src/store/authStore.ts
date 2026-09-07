import { create } from 'zustand';
import {
  AuthApiError,
  clearAccessToken,
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
  register as registerRequest,
  setAuthFailureHandler,
} from '../auth/authClient';
import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '../auth/types';
import { closeUserDatabase, openUserDatabase } from '../db';
import { useSyncStore } from './syncStore';
import { useAIWritingStore } from './aiWritingStore';
import { useFavoritesStore } from './favoritesStore';
import { useKnowledgeBaseStore } from './knowledgeBaseStore';

export type AuthStatus = 'initializing' | 'authenticated' | 'anonymous' | 'offline-authenticated';

interface CachedSession {
  user: AuthUser;
  workspaceId: string;
}

interface AuthStore {
  status: AuthStatus;
  user: AuthUser | null;
  workspaceId: string | null;
  errorMessage: string | null;
  initialize: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const CACHE_KEY = 'duet-doc:last-authenticated-session';
let initializeRequest: Promise<void> | null = null;

function readCachedSession(): CachedSession | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedSession>;
    if (!parsed.user?.id || !parsed.workspaceId) return null;
    return parsed as CachedSession;
  } catch {
    return null;
  }
}

function cacheSession(session: CachedSession) {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(session));
}

function clearCachedSession() {
  window.localStorage.removeItem(CACHE_KEY);
}

function isAuthenticationRejection(error: unknown) {
  return error instanceof AuthApiError && (error.status === 401 || error.status === 403);
}

async function prepareLocalSession(user: AuthUser, workspaceId: string) {
  await openUserDatabase(user.id);
  useSyncStore.getState().setIdentity(user.id, workspaceId);
}

function resetLocalSession() {
  useSyncStore.getState().clearIdentity();
  closeUserDatabase();
  useKnowledgeBaseStore.setState({ knowledgeBases: [], groups: [], documents: [] });
  useFavoritesStore.setState({ folders: [], items: [] });
  useAIWritingStore.setState({
    sessions: [],
    messages: [],
    activeSessionId: null,
    lastVisitedSessionId: null,
  });
}

export const useAuthStore = create<AuthStore>((set, get) => {
  const establishSession = async (response: AuthResponse) => {
    await prepareLocalSession(response.user, response.workspace_id);
    cacheSession({ user: response.user, workspaceId: response.workspace_id });
    set({
      status: 'authenticated',
      user: response.user,
      workspaceId: response.workspace_id,
      errorMessage: null,
    });
  };

  return {
    status: 'initializing',
    user: null,
    workspaceId: null,
    errorMessage: null,

    initialize: async () => {
      if (get().status !== 'initializing') return;
      if (initializeRequest) return initializeRequest;

      initializeRequest = (async () => {
        try {
          const refreshed = await refreshSession();
          const me = await getMe();
          const workspace = me.workspaces.find((item) => item.id === refreshed.workspace_id);
          if (!workspace) throw new Error('当前账号没有可用工作区');
          await establishSession({ ...refreshed, user: me.user });
        } catch (error) {
          const cached = readCachedSession();
          if (!isAuthenticationRejection(error) && cached) {
            clearAccessToken();
            await prepareLocalSession(cached.user, cached.workspaceId);
            set({
              status: 'offline-authenticated',
              user: cached.user,
              workspaceId: cached.workspaceId,
              errorMessage: null,
            });
            return;
          }

          clearAccessToken();
          clearCachedSession();
          resetLocalSession();
          set({ status: 'anonymous', user: null, workspaceId: null, errorMessage: null });
        }
      })().finally(() => {
        initializeRequest = null;
      });
      return initializeRequest;
    },

    login: async (input) => {
      set({ errorMessage: null });
      try {
        await establishSession(await loginRequest(input));
      } catch (error) {
        const message = error instanceof Error ? error.message : '登录失败，请稍后重试';
        set({ status: 'anonymous', errorMessage: message });
        throw error;
      }
    },

    register: async (input) => {
      set({ errorMessage: null });
      try {
        await establishSession(await registerRequest(input));
      } catch (error) {
        const message = error instanceof Error ? error.message : '注册失败，请稍后重试';
        set({ status: 'anonymous', errorMessage: message });
        throw error;
      }
    },

    logout: async () => {
      await logoutRequest();
      clearCachedSession();
      resetLocalSession();
      set({ status: 'anonymous', user: null, workspaceId: null, errorMessage: null });
    },
  };
});

setAuthFailureHandler(() => {
  clearCachedSession();
  resetLocalSession();
  useAuthStore.setState({
    status: 'anonymous',
    user: null,
    workspaceId: null,
    errorMessage: '登录状态已过期，请重新登录',
  });
});
