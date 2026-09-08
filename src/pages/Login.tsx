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
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 size={28} className="animate-spin text-gray-900" />
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
    <main
      data-theme="light"
      className="flex min-h-screen flex-col items-center justify-center bg-white px-5 sm:bg-[#fbfbfd]"
    >
      <section className="w-full max-w-[380px] sm:rounded-2xl sm:bg-white sm:px-10 sm:py-12 sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300">
        <div className="mb-10 flex flex-col items-center justify-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm">
            <Sparkles size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">DuetDoc</h1>
        </div>

        {/* Segmented Control */}
        <div className="mb-8 flex rounded-full bg-gray-100/80 p-1" role="tablist">
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
              className={`flex-1 rounded-full py-2 text-[13px] font-semibold transition-all duration-200 ${
                mode === item
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {item === 'login' ? '登录' : '注册账号'}
            </button>
          ))}
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-4 py-3 transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-gray-900/10 focus-within:shadow-sm">
              <UserRound size={18} className="shrink-0 text-gray-400" />
              <input
                required
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]+"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal outline-none"
                placeholder="用户名 (3-32位数字或字母)"
              />
            </div>
          </div>

          {mode === 'register' && (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-4 py-3 transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-gray-900/10 focus-within:shadow-sm">
                <input
                  maxLength={50}
                  autoComplete="nickname"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal outline-none"
                  placeholder="显示名称 (可选)"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-4 py-3 transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-gray-900/10 focus-within:shadow-sm">
              <LockKeyhole size={18} className="shrink-0 text-gray-400" />
              <input
                required
                minLength={mode === 'register' ? 8 : 1}
                maxLength={128}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal outline-none"
                placeholder={mode === 'register' ? '设置密码 (至少 8 位)' : '密码'}
              />
            </div>
          </div>

          {mode === 'register' && (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-4 py-3 transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-gray-900/10 focus-within:shadow-sm">
                <LockKeyhole size={18} className="shrink-0 text-gray-400" />
                <input
                  required
                  minLength={8}
                  maxLength={128}
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal outline-none"
                  placeholder="确认密码"
                />
              </div>
            </div>
          )}

          {(localError || errorMessage) && (
            <div
              className="rounded-lg bg-red-50 p-3 text-sm text-red-600 animate-in fade-in duration-300"
              role="alert"
            >
              {localError || errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
          >
            {submitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>{mode === 'login' ? '登录' : '继续'}</>
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
