import { useEffect, useRef } from 'react';
import { Upload, FileText } from 'lucide-react';

interface AIAttachMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onAttachFile: (fileName: string) => void;
  onOpenDocSelector: () => void;
  anchorEl: HTMLElement | null;
}

export default function AIAttachMenu({
  isOpen,
  onClose,
  onAttachFile,
  onOpenDocSelector,
  anchorEl,
}: AIAttachMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (isOpen) onClose();
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();
  
  // Position menu above the button since the button is at the bottom of the viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    bottom: `${window.innerHeight - rect.top + 8}px`,
    left: `${rect.left}px`,
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onAttachFile(files[0].name);
      onClose();
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-[110] bg-transparent" onClick={onClose} />

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Dropdown container */}
      <div
        style={style}
        className="z-[115] w-48 bg-white border border-border-color rounded-xl shadow-xl py-1.5 animate-dropdown-fade-in"
      >
        <button
          type="button"
          onClick={triggerFileUpload}
          className="w-full px-6 py-3 text-xs font-semibold text-text-primary hover:bg-hover-bg flex items-center gap-2.5 transition-colors text-left cursor-pointer"
        >
          <Upload size={14} className="text-indigo-500" />
          <span>上传本地文件</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onOpenDocSelector();
            onClose();
          }}
          className="w-full px-6 py-3 text-xs font-semibold text-text-primary hover:bg-hover-bg flex items-center gap-2.5 transition-colors text-left cursor-pointer"
        >
          <FileText size={14} className="text-emerald-500" />
          <span>引用知识库文档</span>
        </button>
      </div>
    </>
  );
}
