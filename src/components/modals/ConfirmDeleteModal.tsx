import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
}

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
}: ConfirmDeleteModalProps) {
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
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-[420px] max-w-[90vw] p-5 animate-modal-scale-in border border-gray-100 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title line with inline orange warning icon */}
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-xs shrink-0 select-none shadow-sm">
            !
          </div>
          <h3 className="text-base font-bold text-gray-900 tracking-tight flex-1">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100 shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Description (indented to align with title text) */}
        <div className="text-sm text-gray-500 leading-relaxed pl-7.5 break-words">
          {description}
        </div>

        {/* Footer Buttons (No top border line) */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-5 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 shadow-sm transition-all cursor-pointer"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}
