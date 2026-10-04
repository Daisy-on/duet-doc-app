import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { ChevronRight, HardDriveDownload, LogOut, Sun, Moon, Laptop } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { MODEL_DEFINITIONS } from '../../models/catalog';
import { useModelStore } from '../../store/modelStore';
import { buildApiUrl } from '../../utils/apiUtils';

interface UserActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onOpenModelManager: () => void;
  anchorEl: HTMLElement | null;
}

export default function UserActionMenu({
  isOpen,
  onClose,
  onLogout,
  onOpenModelManager,
  anchorEl,
}: UserActionMenuProps) {
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const currentUser = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const models = useModelStore((state) => state.models);
  const initializeModels = useModelStore((state) => state.initialize);
  const installedModelCount = MODEL_DEFINITIONS.filter(
    (definition) => models[definition.id].status === 'installed',
  ).length;

  const [serverStatus, setServerStatus] = useState<'checking' | 'connected' | 'disconnected'>(
    'checking',
  );

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/v1/health'));
        if (isMounted) {
          setServerStatus(res.ok ? 'connected' : 'disconnected');
        }
      } catch {
        if (isMounted) {
          setServerStatus('disconnected');
        }
      }
    };

    void checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const checkNow = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/v1/health'));
        if (isMounted) {
          setServerStatus(res.ok ? 'connected' : 'disconnected');
        }
      } catch {
        if (isMounted) {
          setServerStatus('disconnected');
        }
      }
    };
    void checkNow();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) void initializeModels();
  }, [initializeModels, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useLayoutEffect(() => {
    if (isOpen && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const top = rect.bottom + 4; // 4px margin
      const left = rect.left;

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCoords({ top, left });
    }
  }, [isOpen, anchorEl]);

  if (!isOpen) return null;

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-40 bg-transparent" onClick={onClose} />

      {/* Menu dropdown */}
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          top: `${coords.top}px`,
          left: `${coords.left}px`,
          width: '232px',
        }}
        className="z-50 bg-bg-main border border-border-color/80 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.35)] animate-dropdown-fade-in flex flex-col p-1.5 gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-active-bg text-xs font-bold text-active-fg shadow-sm border border-active-border/50">
            {(currentUser?.display_name || currentUser?.username || 'D').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="truncate text-[13px] font-semibold text-text-primary">
              {currentUser?.display_name || currentUser?.username}
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  serverStatus === 'connected'
                    ? 'bg-emerald-500'
                    : serverStatus === 'disconnected'
                      ? 'bg-gray-400'
                      : authStatus === 'authenticated'
                        ? 'bg-emerald-500'
                        : 'bg-gray-400'
                }`}
              />
              <span className="truncate text-[10px] text-text-secondary">
                {serverStatus === 'connected'
                  ? '已登录'
                  : serverStatus === 'disconnected'
                    ? '离线模式'
                    : authStatus === 'offline-authenticated'
                      ? '离线模式'
                      : '已登录'}
              </span>
            </div>
          </div>
        </div>

        <div className="px-1 py-0.5">
          <div className="text-[11px] font-medium text-text-secondary/80 px-1 pb-1">界面外观</div>
          <div className="grid grid-cols-3 gap-1 bg-hover-bg/70 p-1 rounded-xl">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-bg-main text-text-primary shadow-xs font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-main/50'
              }`}
              title="浅色模式"
            >
              <Sun size={12} />
              <span>浅色</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'bg-bg-main text-text-primary shadow-xs font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-main/50'
              }`}
              title="深色模式"
            >
              <Moon size={12} />
              <span>深色</span>
            </button>
            <button
              onClick={() => setTheme('system')}
              className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                theme === 'system'
                  ? 'bg-bg-main text-text-primary shadow-xs font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-main/50'
              }`}
              title="跟随系统"
            >
              <Laptop size={12} />
              <span>系统</span>
            </button>
          </div>
        </div>

        <div className="px-0.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenModelManager();
            }}
            className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] font-medium text-text-primary transition-colors hover:bg-hover-bg cursor-pointer"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-accent dark:bg-indigo-950/60 shrink-0 transition-transform group-hover:scale-105">
              <HardDriveDownload size={14} />
            </div>
            <span className="flex-1 text-[13px]">端侧模型</span>
            <span className="font-mono text-[10px] text-text-secondary bg-hover-bg px-1.5 py-0.5 rounded-lg border border-border-color/50">
              {installedModelCount}/2
            </span>
            <ChevronRight
              size={13}
              className="text-text-ghost transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </div>

        <div className="h-[1px] bg-border-color/50 mx-1 my-0.5" />

        <div className="px-0.5">
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full px-2 py-1.5 rounded-xl text-red-500/85 hover:text-red-600 hover:bg-red-50/70 dark:hover:bg-red-950/30 flex items-center gap-2.5 transition-colors text-left cursor-pointer text-[13px] font-medium"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50/60 dark:bg-red-950/40 text-red-500 shrink-0">
              <LogOut size={13} />
            </div>
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </>
  );
}
