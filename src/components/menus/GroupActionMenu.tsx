import { useEffect } from 'react';
import { Pencil, Trash2, ArrowRightLeft } from 'lucide-react';

interface GroupActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export default function GroupActionMenu({
  isOpen,
  onClose,
  onRename,
  onDelete,
}: GroupActionMenuProps) {
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

  if (!isOpen) return null;

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-40 bg-transparent" onClick={onClose} />

      {/* Menu dropdown */}
      <div
        className="absolute left-0 mt-1 z-50 w-44 bg-white border border-border-color rounded-lg shadow-lg py-1.5 animate-dropdown-fade-in"
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
          title="移动层级功能即将上线"
        >
          <div className="flex items-center gap-2.5">
            <ArrowRightLeft size={14} />
            <span>移动层级</span>
          </div>
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-semibold border border-gray-200">
            即将上线
          </span>
        </div>
      </div>
    </>
  );
}
