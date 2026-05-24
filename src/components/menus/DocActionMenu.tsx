import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { Pencil, Trash2, ArrowRightLeft } from 'lucide-react';

interface DocActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  anchorEl: HTMLElement | null;
}

export default function DocActionMenu({
  isOpen,
  onClose,
  onRename,
  onDelete,
  anchorEl,
}: DocActionMenuProps) {
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
      const menuHeight = menuRef.current?.offsetHeight || 120;
      const menuWidth = menuRef.current?.offsetWidth || 176; // w-44 is 176px
      
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
        }}
        className="z-50 w-44 bg-white border border-border-color rounded-lg shadow-lg py-1.5 animate-dropdown-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            onRename();
            onClose();
          }}
          className="w-full px-3.5 py-2 text-[13px] font-medium text-text-primary hover:bg-hover-bg flex items-center gap-2.5 transition-colors text-left cursor-pointer"
        >
          <Pencil size={14} className="text-gray-500" />
          <span>重命名</span>
        </button>

        <button
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="w-full px-3.5 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50/50 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
        >
          <Trash2 size={14} className="text-red-500" />
          <span>删除</span>
        </button>

        <div className="h-[1px] bg-border-color my-1" />

        <div
          className="w-full px-3.5 py-2 text-[13px] font-medium text-text-secondary opacity-50 flex items-center justify-between gap-2.5 cursor-not-allowed select-none"
          title="移动目录功能即将上线"
        >
          <div className="flex items-center gap-2.5">
            <ArrowRightLeft size={14} />
            <span>移动目录</span>
          </div>
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-semibold border border-gray-200">
            即将上线
          </span>
        </div>
      </div>
    </>
  );
}
