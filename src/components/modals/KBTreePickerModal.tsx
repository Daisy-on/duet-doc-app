import React, { useState, useEffect } from 'react';
import { X, Search, Folder, ChevronDown, ChevronRight, FileText, Check } from 'lucide-react';
import { useKnowledgeBaseStore, MEMO_KB_ID } from '../../store/knowledgeBaseStore';
import type { Group, Document, KnowledgeBase } from '../../store/knowledgeBaseStore';

export interface KBTreePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  mode: 'document' | 'folder';
  subtitle?: React.ReactNode;
  showSearch?: boolean;
  confirmText?: string;
  onSelectDoc?: (doc: { id: string; title: string }) => void;
  onSelectFolder?: (targetKbId: string, targetGroupId: string | null) => void;
}

export default function KBTreePickerModal({
  isOpen,
  onClose,
  title,
  mode,
  subtitle,
  showSearch = mode === 'document',
  confirmText = mode === 'document' ? '确认引用' : '确认移动',
  onSelectDoc,
  onSelectFolder,
}: KBTreePickerModalProps) {
  const { knowledgeBases, documents, groups, getChildGroups } = useKnowledgeBaseStore();

  // Mode: document selection states
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocTitle, setSelectedDocTitle] = useState<string>('');

  // Mode: folder selection states
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Search query
  const [searchQuery, setSearchQuery] = useState('');

  // Track expanded nodes
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

      // Reset selection states
      setSelectedDocId(null);
      setSelectedDocTitle('');
      setSelectedKbId(null);
      setSelectedGroupId(null);
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

  const handleSelectKbRoot = (kb: KnowledgeBase, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedKbId(kb.id);
    setSelectedGroupId(null);
  };

  const handleSelectGroup = (group: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedKbId(group.kbId);
    setSelectedGroupId(group.id);
  };

  const handleConfirm = () => {
    if (mode === 'document') {
      if (selectedDocId && selectedDocTitle && onSelectDoc) {
        onSelectDoc({ id: selectedDocId, title: selectedDocTitle });
        onClose();
      }
    } else {
      if (selectedKbId && onSelectFolder) {
        onSelectFolder(selectedKbId, selectedGroupId);
        onClose();
      }
    }
  };

  const isConfirmDisabled =
    mode === 'document' ? !selectedDocId : !selectedKbId;

  // Filtered documents when search is active (document mode)
  const filteredDocs = searchQuery.trim()
    ? documents.filter(
        (doc) =>
          doc.kbId !== MEMO_KB_ID &&
          doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Find target names for folder mode confirmation info
  const targetKb = knowledgeBases.find((kb) => kb.id === selectedKbId);
  const targetGroup = groups.find((g) => g.id === selectedGroupId);

  // Group Node rendering for tree
  const GroupNode = ({ group, depth }: { group: Group; depth: number }) => {
    const isExpanded = !!expandedNodes[group.id];
    const subGroups = getChildGroups(group.id, group.kbId);
    const groupDocs = documents.filter((doc) => doc.groupId === group.id);
    const hasFolderChildren = subGroups.length > 0;
    const hasChildren = mode === 'document' ? hasFolderChildren || groupDocs.length > 0 : hasFolderChildren;
    const isFolderSelected = mode === 'folder' && selectedGroupId === group.id;

    return (
      <div className="space-y-1">
        {/* Folder Row */}
        <div
          onClick={(e) => {
            if (mode === 'folder') {
              handleSelectGroup(group, e);
            } else if (hasChildren) {
              toggleNode(group.id, e);
            }
          }}
          className={`flex items-center justify-between py-1.5 px-2 hover:bg-hover-bg rounded text-xs cursor-pointer ${
            isFolderSelected
              ? 'bg-indigo-50/70 text-accent font-semibold'
              : 'text-text-primary font-medium'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleNode(group.id, e)}
                className="p-0.5 hover:bg-gray-200 rounded text-text-secondary shrink-0"
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <Folder size={14} className={`shrink-0 ${isFolderSelected ? 'text-accent' : 'text-indigo-400'}`} />
            <span className="truncate">{group.name}</span>
          </div>
          {isFolderSelected && <Check size={14} className="text-accent shrink-0" />}
        </div>

        {/* Children (Subgroups & Documents in document mode) */}
        {isExpanded && hasChildren && (
          <div className="space-y-1">
            {subGroups.map((sub) => (
              <GroupNode key={sub.id} group={sub} depth={depth + 1} />
            ))}
            {mode === 'document' &&
              groupDocs.map((doc) => {
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
                      <FileText
                        size={14}
                        className={isSelected ? 'text-accent shrink-0' : 'text-text-secondary shrink-0'}
                      />
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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-[480px] h-[540px] max-w-[92vw] border border-gray-100 overflow-hidden flex flex-col p-6 animate-modal-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-3 pb-2 border-b border-border-color/60 shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900 tracking-tight">{title}</h3>
            {subtitle && (
              <div className="text-[11px] text-text-secondary mt-0.5">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="relative mb-3 shrink-0">
            <Search size={14} className="absolute left-3 top-2.5 text-text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索文档标题..."
              className="w-full text-xs text-text-primary bg-bg-panel pl-9 pr-4 py-2 border border-border-color rounded-xl outline-none focus:border-accent focus:bg-white transition-colors"
            />
          </div>
        )}

        {/* Tree Selector Content Area */}
        <div className="flex-1 overflow-y-auto border border-border-color/70 rounded-xl bg-bg-panel p-3">
          {showSearch && searchQuery.trim() ? (
            // Search Results View (Document Mode)
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
                        <FileText
                          size={14}
                          className={isSelected ? 'text-accent shrink-0' : 'text-text-secondary shrink-0'}
                        />
                        <span className="truncate">{doc.title}</span>
                      </div>
                      {isSelected && <Check size={14} className="text-accent shrink-0" />}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            // Full Tree View
            <div className="space-y-3">
              {visibleKBs.map((kb) => {
                const isExpanded = !!expandedNodes[kb.id];
                const kbRootGroups = getChildGroups(null, kb.id);
                const kbDocs = documents.filter((doc) => doc.kbId === kb.id);
                const rootDocs = kbDocs.filter((doc) => doc.groupId === null);
                const hasFolderContent = kbRootGroups.length > 0;
                const hasContent = mode === 'document' ? hasFolderContent || rootDocs.length > 0 : hasFolderContent;
                const isKbSelected = mode === 'folder' && selectedKbId === kb.id && selectedGroupId === null;

                return (
                  <div key={kb.id} className="space-y-1">
                    {/* KB Row */}
                    <div
                      onClick={(e) => {
                        if (mode === 'folder') {
                          handleSelectKbRoot(kb, e);
                        } else if (hasContent) {
                          toggleNode(kb.id, e);
                        }
                      }}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg border cursor-pointer hover:bg-hover-bg transition-all ${
                        isKbSelected
                          ? 'bg-indigo-50/70 border-accent/60 text-accent font-semibold'
                          : 'bg-white border-border-color/50 text-text-primary font-bold'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {hasContent ? (
                          <button
                            type="button"
                            onClick={(e) => toggleNode(kb.id, e)}
                            className="p-0.5 hover:bg-gray-200 rounded text-text-secondary shrink-0"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </button>
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <Folder
                          size={14}
                          style={{ color: kb.icon }}
                          className="shrink-0"
                        />
                        <span className="truncate">
                          {kb.name}
                          {mode === 'folder' && (
                            <span className="text-[10px] text-text-secondary font-normal ml-1">(根目录)</span>
                          )}
                        </span>
                      </div>
                      {isKbSelected && <Check size={14} className="text-accent shrink-0" />}
                    </div>

                    {/* KB Tree Children */}
                    {isExpanded && hasContent && (
                      <div className="ml-3 pl-2.5 border-l border-border-color/60 space-y-1 py-1">
                        {kbRootGroups.map((group) => (
                          <GroupNode key={group.id} group={group} depth={0} />
                        ))}
                        {mode === 'document' &&
                          rootDocs.map((doc) => {
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
                                  <FileText
                                    size={14}
                                    className={isSelected ? 'text-accent shrink-0' : 'text-text-secondary shrink-0'}
                                  />
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

        {/* Folder mode selected target info banner */}
        {mode === 'folder' && selectedKbId && (
          <div className="mt-3 px-3 py-2 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs text-text-secondary shrink-0">
            准备移动至：
            <span className="font-semibold text-accent mx-1">{targetKb?.name}</span>
            {targetGroup && (
              <>
                /
                <span className="font-semibold text-accent mx-1">{targetGroup.name}</span>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-4 pt-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 border border-border-color rounded-xl text-xs font-medium text-text-secondary hover:bg-hover-bg transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
            className={`px-6 py-2.5 rounded-xl text-xs font-semibold text-white shadow-sm transition-all cursor-pointer ${
              isConfirmDisabled
                ? 'bg-indigo-300 cursor-not-allowed'
                : 'bg-accent hover:bg-indigo-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
