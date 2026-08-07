import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronDown, FolderOpen, Folder, Check } from 'lucide-react';
import { useKnowledgeBaseStore } from '../../store/knowledgeBaseStore';

interface CreateDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateKBClick: () => void; // Allow opening the create KB modal directly if needed
}

export default function CreateDocModal({ isOpen, onClose, onCreateKBClick }: CreateDocModalProps) {
  const { knowledgeBases, createDocument } = useKnowledgeBaseStore();
  const [selectedKbId, setSelectedKbId] = useState(knowledgeBases[0]?.id || '');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const selectedKb = knowledgeBases.find((kb) => kb.id === selectedKbId) || knowledgeBases[0];
  const effectiveKbId = selectedKb?.id || '';

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveKbId) return;

    // Create a new document in the selected KB's root level (groupId: null)
    const newDocId = createDocument(effectiveKbId, null, '新建文档');
    onClose();
    navigate(`/kb/${effectiveKbId}/doc/${newDocId}`);
  };

  const handleCreateKBClick = () => {
    onClose();
    onCreateKBClick();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[420px] min-h-[320px] border border-border-color flex flex-col p-5 animate-modal-scale-in relative"
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
          <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
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
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                选择所属知识库
              </label>
              <div className="relative" ref={dropdownRef}>
                {/* Trigger Button */}
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className={`w-full flex items-center justify-between pl-3.5 pr-3.5 py-2.5 border rounded-lg text-sm text-text-primary outline-none transition-all bg-white cursor-pointer select-none ${
                    dropdownOpen
                      ? 'border-accent ring-2 ring-indigo-100 shadow-sm'
                      : 'border-border-color hover:border-text-ghost shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {selectedKb ? (
                      <>
                        <Folder
                          size={15}
                          className="shrink-0 transition-colors"
                          style={{ color: selectedKb.icon }}
                        />
                        <span className="truncate font-medium">{selectedKb.name}</span>
                      </>
                    ) : (
                      <span className="text-text-ghost">选择知识库...</span>
                    )}
                  </div>
                  <ChevronDown
                    size={15}
                    className={`text-text-secondary shrink-0 transition-transform duration-200 ${
                      dropdownOpen ? 'transform rotate-180 text-text-primary' : ''
                    }`}
                  />
                </button>

                {/* Dropdown Options List */}
                {dropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1.5 bg-white border border-border-color rounded-lg shadow-xl py-1.5 max-h-[172px] overflow-y-auto z-50 animate-dropdown-fade-in custom-scrollbar">
                    {knowledgeBases.map((kb) => {
                      const isSelected = kb.id === effectiveKbId;
                      return (
                        <div
                          key={kb.id}
                          onClick={() => {
                            setSelectedKbId(kb.id);
                            setDropdownOpen(false);
                          }}
                          className={`flex items-center justify-between px-3.5 py-2.5 text-sm transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50/50 text-accent font-semibold'
                              : 'text-text-primary hover:bg-hover-bg'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Folder size={15} className="shrink-0" style={{ color: kb.icon }} />
                            <span className="truncate">{kb.name}</span>
                          </div>
                          {isSelected && <Check size={14} className="text-accent shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-color">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-border-color rounded-xl text-[13px] font-medium text-text-secondary hover:bg-hover-bg transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-accent hover:bg-indigo-700 text-white rounded-xl text-[13px] font-semibold shadow-sm transition-colors cursor-pointer"
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
