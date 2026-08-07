import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

interface KbActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  anchorEl: HTMLElement | null;
}

export default function KbActionMenu({
  isOpen,
  onClose,
  onRename,
  onDelete,
  anchorEl,
}: KbActionMenuProps) {
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

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
      const menuHeight = menuRef.current?.offsetHeight || 80;
      const menuWidth = menuRef.current?.offsetWidth || 120;

      let top = rect.bottom + 4; // 4px margin
      let left = rect.left;

      // If bottom of menu goes offscreen
      if (rect.bottom + menuHeight > window.innerHeight) {
        top = rect.top - menuHeight - 4;
      }

      // If right of menu goes offscreen
      if (rect.left + menuWidth > window.innerWidth) {
        left = rect.right - menuWidth;
      }

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
          width: '120px',
        }}
        className="z-50 bg-white border border-border-color rounded-lg shadow-lg py-1 animate-dropdown-fade-in text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            onRename();
            onClose();
          }}
          className="w-full px-3 py-2 text-text-primary hover:bg-hover-bg flex items-center gap-2 transition-colors text-left cursor-pointer font-medium"
        >
          <Pencil size={12} className="text-gray-500" />
          <span>重命名</span>
        </button>

        <button
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="w-full px-3 py-2 text-red-600 hover:bg-red-50/50 flex items-center gap-2 transition-colors text-left cursor-pointer font-medium"
        >
          <Trash2 size={12} className="text-red-500" />
          <span>删除</span>
        </button>
      </div>
    </>
  );
}
