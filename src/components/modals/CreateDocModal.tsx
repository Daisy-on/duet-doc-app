import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronDown, FolderOpen } from 'lucide-react';
import { useKnowledgeBaseStore } from '../../store/knowledgeBaseStore';

interface CreateDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateKBClick: () => void; // Allow opening the create KB modal directly if needed
}

export default function CreateDocModal({ isOpen, onClose, onCreateKBClick }: CreateDocModalProps) {
  const { knowledgeBases, createDocument } = useKnowledgeBaseStore();
  const [selectedKbId, setSelectedKbId] = useState(knowledgeBases[0]?.id || '');
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKbId) return;

    // Create a new document in the selected KB's root level (groupId: null)
    const newDocId = createDocument(selectedKbId, null, '新建文档');
    onClose();
    navigate(`/kb/${selectedKbId}/doc/${newDocId}`);
  };

  const handleCreateKBClick = () => {
    onClose();
    onCreateKBClick();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl w-[420px] border border-border-color overflow-hidden flex flex-col p-6 animate-modal-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-5 pb-1">
          <h2 className="text-[17px] font-bold text-text-primary">新建文档</h2>
          <button 
            onClick={onClose} 
            className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded-md hover:bg-hover-bg"
          >
            <X size={18} />
          </button>
        </div>

        {knowledgeBases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center mb-3">
              <FolderOpen size={24} />
            </div>
            <div className="text-sm font-semibold text-text-primary mb-1">暂无可用知识库</div>
            <div className="text-xs text-text-secondary mb-5 max-w-[260px] leading-relaxed">
              文档必须归属于一个知识库，请先新建一个知识库。
            </div>
            <button
              onClick={handleCreateKBClick}
              className="px-4 py-2 bg-accent hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              去新建知识库
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">选择所属知识库</label>
              <div className="relative">
                <select
                  value={selectedKbId}
                  onChange={(e) => setSelectedKbId(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 border border-border-color rounded-lg text-sm text-text-primary outline-none focus:border-accent transition-colors appearance-none bg-white cursor-pointer"
                >
                  {knowledgeBases.map((kb) => (
                    <option key={kb.id} value={kb.id}>
                      {kb.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none">
                  <ChevronDown size={16} />
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-color">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-border-color rounded-lg text-[13px] font-medium text-text-secondary hover:bg-hover-bg transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-accent hover:bg-indigo-700 text-white rounded-lg text-[13px] font-semibold shadow-sm transition-colors cursor-pointer"
              >
                创建文档
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
