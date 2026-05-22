import { FileText, FolderPlus, Download, LayoutTemplate } from 'lucide-react';

interface AddContentMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNewDoc: () => void;
  onNewGroup: () => void;
}

export default function AddContentMenu({ isOpen, onClose, onNewDoc, onNewGroup }: AddContentMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Click-away backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-transparent" 
        onClick={onClose} 
      />

      {/* Menu dropdown */}
      <div className="absolute right-0 top-8 z-50 w-44 bg-white border border-border-color rounded-lg shadow-lg py-1.5 animate-dropdown-fade-in">
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
          onClick={() => {
            onNewGroup();
            onClose();
          }}
          className="w-full px-3.5 py-2 text-[13px] font-medium text-text-primary hover:bg-hover-bg flex items-center gap-2.5 transition-colors text-left cursor-pointer"
        >
          <FolderPlus size={15} className="text-emerald-500" />
          <span>新建分组</span>
        </button>

        <div className="h-[1px] bg-border-color my-1" />

        {/* Disabled option: Import */}
        <div 
          className="group/item relative w-full px-3.5 py-2 text-[13px] font-medium text-text-secondary opacity-60 flex items-center justify-between gap-2.5 cursor-not-allowed select-none"
          title="导入功能即将上线"
        >
          <div className="flex items-center gap-2.5">
            <Download size={15} />
            <span>导入</span>
          </div>
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-semibold border border-gray-200">即将上线</span>
        </div>

        {/* Disabled option: From template */}
        <div 
          className="group/item relative w-full px-3.5 py-2 text-[13px] font-medium text-text-secondary opacity-60 flex items-center justify-between gap-2.5 cursor-not-allowed select-none"
          title="从模板创建功能即将上线"
        >
          <div className="flex items-center gap-2.5">
            <LayoutTemplate size={15} />
            <span>从模板创建</span>
          </div>
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-semibold border border-gray-200">即将上线</span>
        </div>
      </div>
    </>
  );
}
