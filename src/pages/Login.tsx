import { useState, type FormEvent } from 'react';
import { Loader2, LockKeyhole, Sparkles, UserRound } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

type Mode = 'login' | 'register';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const errorMessage = useAuthStore((state) => state.errorMessage);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (status === 'authenticated' || status === 'offline-authenticated') {
    return <Navigate to="/" replace />;
  }

  if (status === 'initializing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa]">
        <Loader2 size={28} className="animate-spin text-accent" />
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    if (mode === 'register' && password !== confirmation) {
      setLocalError('两次输入的密码不一致');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login({ username, password });
      } else {
        await register({
          username,
          password,
          ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
        });
      }
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch {
      // The store exposes the server-safe error message.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-5 py-10">
      <section className="w-full max-w-[400px] rounded-xl border border-border-color bg-white px-9 py-10 shadow-[0_16px_48px_rgba(17,24,39,0.12)]">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-accent">
            <Sparkles size={21} />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">DuetDoc</h1>
        </div>

        <div className="mb-7 grid grid-cols-2 border-b border-border-color" role="tablist">
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={mode === item}
              onClick={() => {
                setMode(item);
                setLocalError(null);
              }}
              className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                mode === item
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {item === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-text-primary">用户名</span>
            <div className="flex items-center gap-2 rounded-md border border-border-color px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-indigo-100">
              <UserRound size={17} className="shrink-0 text-text-secondary" />
              <input
                required
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]+"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm text-text-primary outline-none"
                placeholder="3-32 位字母、数字或下划线"
              />
            </div>
          </label>

          {mode === 'register' && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-text-primary">显示名称</span>
              <input
                maxLength={50}
                autoComplete="nickname"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="h-11 w-full rounded-md border border-border-color px-3 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-indigo-100"
                placeholder="可选，可使用中文"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-text-primary">密码</span>
            <div className="flex items-center gap-2 rounded-md border border-border-color px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-indigo-100">
              <LockKeyhole size={17} className="shrink-0 text-text-secondary" />
              <input
                required
                minLength={mode === 'register' ? 8 : 1}
                maxLength={128}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm text-text-primary outline-none"
                placeholder={mode === 'register' ? '至少 8 位' : '请输入密码'}
              />
            </div>
          </label>

          {mode === 'register' && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-text-primary">确认密码</span>
              <input
                required
                minLength={8}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="h-11 w-full rounded-md border border-border-color px-3 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-indigo-100"
                placeholder="再次输入密码"
              />
            </label>
          )}

          {(localError || errorMessage) && (
            <p className="text-sm text-red-600" role="alert">
              {localError || errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 size={17} className="animate-spin" />}
            {mode === 'login' ? '登录' : '创建账号'}
          </button>
        </form>
      </section>
    </main>
  );
}
