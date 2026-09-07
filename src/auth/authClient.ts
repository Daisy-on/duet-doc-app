import { buildApiUrl } from '../utils/apiUtils';
import type { AuthResponse, LoginInput, MeResponse, RegisterInput } from './types';

export class AuthApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshRequest: Promise<AuthResponse> | null = null;
let authFailureHandler: (() => void) | null = null;

function apiUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== 'string' || /^https?:\/\//.test(input)) return input;
  return buildApiUrl(input);
}

async function errorFromResponse(response: Response): Promise<AuthApiError> {
  let message = `请求失败 (${response.status})`;
  try {
    const body = (await response.json()) as {
      detail?: string | { message?: string };
      error?: { message?: string };
    };
    if (typeof body.detail === 'string') message = body.detail;
    else if (body.detail?.message) message = body.detail.message;
    else if (body.error?.message) message = body.error.message;
  } catch {
    // Keep the HTTP status fallback when the body is not JSON.
  }
  const localizedMessages: Record<string, string> = {
    'Invalid username or password': '用户名或密码错误',
    'Username is already registered': '用户名已被注册',
    'Authentication required': '请先登录',
    'Invalid or expired access token': '登录状态已过期，请重新登录',
  };
  return new AuthApiError(localizedMessages[message] ?? message, response.status);
}

async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function storeAccessToken(response: AuthResponse) {
  accessToken = response.access_token;
  return response;
}

export function clearAccessToken() {
  accessToken = null;
}

export function setAuthFailureHandler(handler: (() => void) | null) {
  authFailureHandler = handler;
}

export async function register(input: RegisterInput) {
  return storeAccessToken(
    await authRequest<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function login(input: LoginInput) {
  return storeAccessToken(
    await authRequest<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function refreshSession(): Promise<AuthResponse> {
  if (!refreshRequest) {
    refreshRequest = authRequest<AuthResponse>('/api/v1/auth/refresh', { method: 'POST' })
      .then(storeAccessToken)
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export async function getMe(): Promise<MeResponse> {
  const response = await authFetch('/api/v1/auth/me');
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as MeResponse;
}

export async function logout(): Promise<void> {
  try {
    await authRequest<void>('/api/v1/auth/logout', { method: 'POST' });
  } finally {
    clearAccessToken();
  }
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  allowRefresh = true,
): Promise<Response> {
  const requestToken = accessToken;
  const headers = new Headers(init.headers);
  if (requestToken) headers.set('Authorization', `Bearer ${requestToken}`);
  const response = await fetch(apiUrl(input), { ...init, headers, credentials: 'include' });
  if (response.status !== 401 || !allowRefresh) return response;

  try {
    if (!accessToken || accessToken === requestToken) await refreshSession();
  } catch (error) {
    if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
      clearAccessToken();
      authFailureHandler?.();
    }
    return response;
  }

  const retryHeaders = new Headers(init.headers);
  if (accessToken) retryHeaders.set('Authorization', `Bearer ${accessToken}`);
  const retry = await fetch(apiUrl(input), {
    ...init,
    headers: retryHeaders,
    credentials: 'include',
  });
  if (retry.status === 401) {
    clearAccessToken();
    authFailureHandler?.();
  }
  return retry;
}
