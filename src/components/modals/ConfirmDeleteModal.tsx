import React, { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';

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
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[440px] border border-border-color overflow-hidden flex flex-col p-6 animate-modal-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3.5 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 text-red-500">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-text-primary mb-1">{title}</h3>
            <div className="text-sm text-text-secondary leading-relaxed break-words">{description}</div>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded-md hover:bg-hover-bg flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border-color">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-border-color rounded-lg text-[13px] font-medium text-text-secondary hover:bg-hover-bg transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-5 py-2 rounded-lg text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 shadow-sm transition-colors cursor-pointer"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}
