import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { LogOut, Sun, Moon, Laptop } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';

interface UserActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  anchorEl: HTMLElement | null;
}

export default function UserActionMenu({
  isOpen,
  onClose,
  onLogout,
  anchorEl,
}: UserActionMenuProps) {
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const currentUser = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

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
          width: '216px',
        }}
        className="z-50 bg-bg-main border border-border-color rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] animate-dropdown-fade-in flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-3 border-b border-border-color bg-bg-panel">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-sm font-bold text-accent shadow-sm border border-indigo-100/80 dark:border-indigo-900/50">
            {(currentUser?.display_name || currentUser?.username || 'D').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="truncate text-[13px] font-semibold text-text-primary">
              {currentUser?.display_name || currentUser?.username}
            </span>
            <span className="truncate text-[11px] text-text-secondary">
              {authStatus === 'offline-authenticated' ? '离线模式' : '已登录'}
            </span>
          </div>
        </div>

        <div className="p-2.5 border-b border-border-color">
          <div className="text-[11px] font-medium text-text-secondary px-1 pb-1.5 flex items-center justify-between">
            <span>界面外观</span>
          </div>
          <div className="grid grid-cols-3 gap-1 bg-hover-bg p-1 rounded-lg">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center justify-center gap-1 py-1 px-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-bg-main text-text-primary shadow-xs font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="浅色模式"
            >
              <Sun size={12} />
              <span>浅色</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center justify-center gap-1 py-1 px-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'bg-bg-main text-text-primary shadow-xs font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="深色模式"
            >
              <Moon size={12} />
              <span>深色</span>
            </button>
            <button
              onClick={() => setTheme('system')}
              className={`flex items-center justify-center gap-1 py-1 px-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                theme === 'system'
                  ? 'bg-bg-main text-text-primary shadow-xs font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="跟随系统"
            >
              <Laptop size={12} />
              <span>系统</span>
            </button>
          </div>
        </div>

        <div className="py-1">
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2.5 transition-colors text-left cursor-pointer text-[13px] font-medium"
          >
            <LogOut size={14} className="text-red-500/80" />
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </>
  );
}
