import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { FileText, FolderPlus, AlertCircle } from 'lucide-react';

interface GroupAddMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNewDoc: () => void;
  onNewSubGroup: () => void;
  currentDepth: number; // Current group's depth (0-indexed: 0=root-group)
  anchorEl: HTMLElement | null;
}

export default function GroupAddMenu({
  isOpen,
  onClose,
  onNewDoc,
  onNewSubGroup,
  currentDepth,
  anchorEl,
}: GroupAddMenuProps) {
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
      const menuWidth = menuRef.current?.offsetWidth || 192;

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

  const showWarning = currentDepth >= 2;
  const isDisable = currentDepth >= 5;

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
        className="z-50 w-48 bg-white border border-border-color rounded-lg shadow-lg py-1.5 animate-dropdown-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            onNewDoc();
            onClose();
          }}
          className="w-full px-3.5 py-2 text-[13px] font-medium text-text-primary hover:bg-hover-bg flex items-center gap-2.5 transition-colors text-left cursor-pointer"
        >
          <FileText size={15} className="text-indigo-500" />
          <span>新建文档</span>
        </button>

        <button
          disabled={isDisable}
          onClick={() => {
            if (isDisable) return;
            onNewSubGroup();
            onClose();
          }}
          className={`w-full px-3.5 py-2 text-[13px] font-medium flex items-center justify-between gap-2.5 transition-colors text-left ${
            isDisable
              ? 'text-text-secondary opacity-50 cursor-not-allowed'
              : 'text-text-primary hover:bg-hover-bg cursor-pointer'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <FolderPlus size={15} className={isDisable ? 'text-gray-400' : 'text-emerald-500'} />
            <span>新建子分组</span>
          </div>
          {isDisable && (
            <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded font-semibold border border-red-100">
              层级达上限
            </span>
          )}
        </button>

        {showWarning && !isDisable && (
          <div className="px-3.5 py-1.5 mt-1 border-t border-border-color bg-amber-50/50 flex gap-1.5 items-start">
            <AlertCircle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <span className="text-[10px] text-amber-600 leading-tight">层级较深，建议整理结构</span>
          </div>
        )}
      </div>
    </>
  );
}
