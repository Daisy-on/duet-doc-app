import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

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
          width: '200px',
        }}
        className="z-50 bg-white border border-border-color rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] animate-dropdown-fade-in flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-3 border-b border-border-color bg-[#fcfcfd]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-accent shadow-sm">
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

        <div className="py-1">
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full px-3 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors text-left cursor-pointer text-[13px] font-medium"
          >
            <LogOut size={14} className="text-red-500/80" />
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </>
  );
}
