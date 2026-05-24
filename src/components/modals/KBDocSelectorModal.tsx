import React, { useState, useEffect } from 'react';
import { X, Search, Folder, ChevronDown, ChevronRight, FileText, Check } from 'lucide-react';
import { useKnowledgeBaseStore, MEMO_KB_ID } from '../../store/knowledgeBaseStore';
import type { Document, Group } from '../../store/knowledgeBaseStore';

interface KBDocSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (doc: { id: string; title: string }) => void;
}

export default function KBDocSelectorModal({
  isOpen,
  onClose,
  onSelect,
}: KBDocSelectorModalProps) {
  const { knowledgeBases, documents, getChildGroups } = useKnowledgeBaseStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocTitle, setSelectedDocTitle] = useState<string>('');
  
  // Track expanded state for KBs and Groups
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Filter out system memo KB
  const visibleKBs = knowledgeBases.filter((kb) => kb.id !== MEMO_KB_ID);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      // Auto-expand all KBs by default
      const defaultExpanded: Record<string, boolean> = {};
      visibleKBs.forEach((kb) => {
        defaultExpanded[kb.id] = true;
      });
      setExpandedNodes(defaultExpanded);
      // Reset selection
      setSelectedDocId(null);
      setSelectedDocTitle('');
      setSearchQuery('');
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const handleDocClick = (doc: Document) => {
    setSelectedDocId(doc.id);
    setSelectedDocTitle(doc.title);
  };

  const handleConfirm = () => {
    if (selectedDocId && selectedDocTitle) {
      onSelect({ id: selectedDocId, title: selectedDocTitle });
      onClose();
    }
  };

  // Filtered documents when search is active
  const filteredDocs = searchQuery.trim()
    ? documents.filter(
        (doc) =>
          doc.kbId !== MEMO_KB_ID &&
          doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Recursive component to render groups and their documents
  const GroupNode = ({ group, depth }: { group: Group; depth: number }) => {
    const isExpanded = !!expandedNodes[group.id];
    const subGroups = getChildGroups(group.id, group.kbId);
    const groupDocs = documents.filter((doc) => doc.groupId === group.id);
    const hasChildren = subGroups.length > 0 || groupDocs.length > 0;

    return (
      <div className="space-y-1">
        {/* Folder row */}
        <div
          onClick={(e) => hasChildren && toggleNode(group.id, e)}
          className="flex items-center gap-2 py-1 px-2 hover:bg-hover-bg rounded text-xs text-text-primary font-medium cursor-pointer"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={14} className="text-text-secondary shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-text-secondary shrink-0" />
            )
          ) : (
            <span className="w-3.5" />
          )}
          <Folder size={14} className="text-indigo-400 shrink-0" />
          <span className="truncate">{group.name}</span>
        </div>

        {/* Children */}
        {isExpanded && hasChildren && (
          <div className="space-y-1">
            {subGroups.map((sub) => (
              <GroupNode key={sub.id} group={sub} depth={depth + 1} />
            ))}
            {groupDocs.map((doc) => {
              const isSelected = selectedDocId === doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={() => handleDocClick(doc)}
                  className={`flex items-center justify-between py-1 px-2 hover:bg-hover-bg rounded text-xs cursor-pointer ${
                    isSelected ? 'bg-indigo-50/70 text-accent font-medium' : 'text-text-secondary'
                  }`}
                  style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className={isSelected ? 'text-accent shrink-0' : 'text-text-secondary shrink-0'} />
                    <span className="truncate">{doc.title}</span>
                  </div>
                  {isSelected && <Check size={14} className="text-accent shrink-0" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[500px] h-[550px] border border-border-color overflow-hidden flex flex-col p-6 animate-modal-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-border-color shrink-0">
          <h3 className="text-base font-bold text-text-primary">选择知识库文档</h3>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded-md hover:bg-hover-bg"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4 shrink-0">
          <Search size={14} className="absolute left-3 top-2.5 text-text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文档标题..."
            className="w-full text-xs text-text-primary bg-bg-panel pl-9 pr-4 py-2 border border-border-color rounded-lg outline-none focus:border-accent focus:bg-white transition-colors"
          />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto border border-border-color rounded-lg bg-bg-panel p-3">
          {searchQuery.trim() ? (
            // Search results view
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2 px-1">
                搜索结果 ({filteredDocs.length})
              </div>
              {filteredDocs.length === 0 ? (
                <div className="text-center py-8 text-xs text-text-secondary">
                  没有找到匹配的文档
                </div>
              ) : (
                filteredDocs.map((doc) => {
                  const isSelected = selectedDocId === doc.id;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => handleDocClick(doc)}
                      className={`flex items-center justify-between py-2 px-3 hover:bg-hover-bg rounded-lg text-xs cursor-pointer ${
                        isSelected ? 'bg-indigo-50/70 text-accent font-medium' : 'text-text-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={14} className={isSelected ? 'text-accent shrink-0' : 'text-text-secondary shrink-0'} />
                        <span className="truncate">{doc.title}</span>
                      </div>
                      {isSelected && <Check size={14} className="text-accent shrink-0" />}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            // Full tree view
            <div className="space-y-3">
              {visibleKBs.map((kb) => {
                const isExpanded = !!expandedNodes[kb.id];
                const kbRootGroups = getChildGroups(null, kb.id);
                const kbDocs = documents.filter((doc) => doc.kbId === kb.id);
                const rootDocs = kbDocs.filter((doc) => doc.groupId === null);
                const hasContent = kbRootGroups.length > 0 || rootDocs.length > 0;

                return (
                  <div key={kb.id} className="space-y-1">
                    {/* KB Row */}
                    <div
                      onClick={(e) => hasContent && toggleNode(kb.id, e)}
                      className="flex items-center gap-2 py-1.5 px-2 hover:bg-hover-bg rounded text-xs text-text-primary font-bold cursor-pointer bg-white border border-border-color/50 shadow-sm"
                    >
                      {hasContent ? (
                        isExpanded ? (
                          <ChevronDown size={14} className="text-text-secondary shrink-0" />
                        ) : (
                          <ChevronRight size={14} className="text-text-secondary shrink-0" />
                        )
                      ) : (
                        <span className="w-3.5" />
                      )}
                      <Folder
                        size={14}
                        style={{ color: kb.icon }}
                        className="shrink-0 animate-pulse"
                      />
                      <span className="truncate">{kb.name}</span>
                    </div>

                    {/* KB Tree Children */}
                    {isExpanded && hasContent && (
                      <div className="ml-3 pl-2.5 border-l border-border-color/60 space-y-1 py-1">
                        {kbRootGroups.map((group) => (
                          <GroupNode key={group.id} group={group} depth={0} />
                        ))}
                        {rootDocs.map((doc) => {
                          const isSelected = selectedDocId === doc.id;
                          return (
                            <div
                              key={doc.id}
                              onClick={() => handleDocClick(doc)}
                              className={`flex items-center justify-between py-1 px-2 hover:bg-hover-bg rounded text-xs cursor-pointer ${
                                isSelected ? 'bg-indigo-50/70 text-accent font-medium' : 'text-text-secondary'
                              }`}
                              style={{ paddingLeft: '8px' }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText size={14} className={isSelected ? 'text-accent shrink-0' : 'text-text-secondary shrink-0'} />
                                <span className="truncate">{doc.title}</span>
                              </div>
                              {isSelected && <Check size={14} className="text-accent shrink-0" />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border-color shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-border-color rounded-lg text-xs font-medium text-text-secondary hover:bg-hover-bg transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!selectedDocId}
            onClick={handleConfirm}
            className={`px-5 py-2 rounded-lg text-xs font-semibold text-white shadow-sm transition-colors cursor-pointer ${
              selectedDocId
                ? 'bg-accent hover:bg-indigo-700'
                : 'bg-indigo-300 cursor-not-allowed'
            }`}
          >
            确认引用
          </button>
        </div>
      </div>
    </div>
  );
}
