import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Folder, ChevronDown, ChevronRight, FileText, Check, AlertCircle } from 'lucide-react';
import { useKnowledgeBaseStore, MEMO_KB_ID } from '../../store/knowledgeBaseStore';
import type { Group, Document, KnowledgeBase } from '../../store/knowledgeBaseStore';

export interface KBTreePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  mode: 'document' | 'folder' | 'create-doc';
  defaultTitle?: string;
  subtitle?: React.ReactNode;
  showSearch?: boolean;
  confirmText?: string;
  forbiddenGroupIds?: string[];
  validateSelection?: (kbId: string, groupId: string | null) => string | null;
  onSelectDoc?: (doc: { id: string; title: string }) => void;
  onSelectFolder?: (targetKbId: string, targetGroupId: string | null) => void;
  onCreateDoc?: (targetKbId: string, targetGroupId: string | null, title: string) => void;
}

export default function KBTreePickerModal({
  isOpen,
  onClose,
  title,
  mode,
  defaultTitle = '',
  subtitle,
  showSearch = true, // 统一默认开启搜索，保持场景展现 100% 一致
  confirmText = mode === 'document' ? '确认引用' : mode === 'create-doc' ? '确认创建' : '确认移动',
  forbiddenGroupIds = [],
  validateSelection,
  onSelectDoc,
  onSelectFolder,
  onCreateDoc,
}: KBTreePickerModalProps) {
  const { knowledgeBases, documents, groups, getChildGroups } = useKnowledgeBaseStore();

  // Mode: document title state (for create-doc mode)
  const [docTitle, setDocTitle] = useState(defaultTitle);

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
  const visibleKBs = useMemo(
    () => knowledgeBases.filter((kb) => kb.id !== MEMO_KB_ID),
    [knowledgeBases]
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      // Auto-expand all KBs by default
      const defaultExpanded: Record<string, boolean> = {};
      visibleKBs.forEach((kb) => {
        defaultExpanded[kb.id] = true;
      });
      setExpandedNodes(defaultExpanded);

      // Reset selection states
      setDocTitle(defaultTitle);
      setSelectedDocId(null);
      setSelectedDocTitle('');
      setSelectedKbId(null);
      setSelectedGroupId(null);
      setSearchQuery('');
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, defaultTitle, visibleKBs]);

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
    } else if (mode === 'create-doc') {
      if (selectedKbId && onCreateDoc) {
        onCreateDoc(selectedKbId, selectedGroupId, docTitle.trim() || '未命名文档');
        onClose();
      }
    } else {
      if (selectedKbId && onSelectFolder) {
        onSelectFolder(selectedKbId, selectedGroupId);
        onClose();
      }
    }
  };

  const validationError =
    validateSelection && selectedKbId
      ? validateSelection(selectedKbId, selectedGroupId)
      : null;

  const isConfirmDisabled =
    (mode === 'document'
      ? !selectedDocId
      : mode === 'create-doc'
      ? !selectedKbId || !docTitle.trim()
      : !selectedKbId) || !!validationError;

  // Filtered documents when search is active (document mode)
  const filteredDocs = searchQuery.trim()
    ? documents.filter(
        (doc) =>
          doc.kbId !== MEMO_KB_ID &&
          doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Filtered folders/groups when search is active (folder mode)
  const filteredGroups = searchQuery.trim()
    ? groups.filter(
        (g) =>
          g.kbId !== MEMO_KB_ID &&
          !forbiddenGroupIds.includes(g.id) &&
          g.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Find target names for confirmation info banner
  const targetKb = knowledgeBases.find((kb) => kb.id === selectedKbId);

  // Helper to build full group ancestor path names
  const getFullGroupPath = (groupId: string | null): string[] => {
    if (!groupId) return [];
    const path: string[] = [];
    let currId: string | null = groupId;
    while (currId) {
      const g = groups.find((item) => item.id === currId);
      if (!g) break;
      path.unshift(g.name);
      currId = g.parentGroupId;
    }
    return path;
  };

  const fullPathList = selectedKbId
    ? [targetKb?.name || '', ...getFullGroupPath(selectedGroupId)].filter(Boolean)
    : [];

  // Group Node rendering for tree
  const GroupNode = ({ group, depth }: { group: Group; depth: number }) => {
    if (forbiddenGroupIds.includes(group.id)) {
      return null;
    }

    const isExpanded = !!expandedNodes[group.id];
    const subGroups = getChildGroups(group.id, group.kbId).filter(
      (sub) => !forbiddenGroupIds.includes(sub.id)
    );
    const groupDocs = documents.filter((doc) => doc.groupId === group.id);
    const hasFolderChildren = subGroups.length > 0;
    const hasChildren = mode === 'document' ? hasFolderChildren || groupDocs.length > 0 : hasFolderChildren;
    const isFolderSelected = (mode === 'folder' || mode === 'create-doc') && selectedGroupId === group.id;

    return (
      <div className="space-y-1">
        {/* Folder Row */}
        <div
          onClick={(e) => {
            if (mode === 'folder' || mode === 'create-doc') {
              handleSelectGroup(group, e);
            } else if (hasChildren) {
              toggleNode(group.id, e);
            }
          }}
          className={`flex items-center justify-between py-1.5 px-2.5 hover:bg-hover-bg rounded-lg text-xs cursor-pointer transition-all ${
            isFolderSelected
              ? 'bg-indigo-50/80 border border-indigo-200/80 text-accent font-semibold shadow-xs'
              : 'text-text-primary font-medium'
          }`}
          style={{ paddingLeft: `${depth * 12 + 10}px` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleNode(group.id, e)}
                className="p-0.5 hover:bg-gray-200/70 rounded text-text-secondary shrink-0 transition-colors"
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
                    className={`flex items-center justify-between py-1.5 px-2.5 hover:bg-hover-bg rounded-lg text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-indigo-50/80 border border-indigo-200/80 text-accent font-semibold shadow-xs'
                        : 'text-text-secondary'
                    }`}
                    style={{ paddingLeft: `${(depth + 1) * 12 + 10}px` }}
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
        className="bg-white rounded-3xl shadow-xl w-[480px] h-[550px] max-w-[92vw] border border-gray-100 overflow-hidden flex flex-col p-5 animate-modal-scale-in"
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

        {/* Title Input for create-doc mode */}
        {mode === 'create-doc' && (
          <div className="mb-3 shrink-0">
            <label className="block text-[12px] font-bold text-text-secondary mb-1">
              文档标题
            </label>
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="输入文档标题..."
              className="w-full text-xs text-text-primary bg-bg-panel px-3 py-2 border border-border-color rounded-lg outline-none focus:border-accent focus:bg-white transition-colors font-medium"
            />
          </div>
        )}

        {/* Unified Search Bar */}
        {showSearch && (
          <div className="relative mb-3 shrink-0">
            <Search size={14} className="absolute left-3 top-2.5 text-text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={mode === 'document' ? '搜索文档标题...' : '搜索知识库或目录名称...'}
              className="w-full text-xs text-text-primary bg-bg-panel pl-9 pr-4 py-2 border border-border-color rounded-lg outline-none focus:border-accent focus:bg-white transition-colors"
            />
          </div>
        )}

        {/* Tree Selector Content Area */}
        <div className="flex-1 overflow-y-auto border border-border-color/70 rounded-xl bg-bg-panel p-3">
          {showSearch && searchQuery.trim() ? (
            // Search Results View
            <div className="space-y-1">
              {mode === 'document' ? (
                <>
                  <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2 px-1">
                    文档搜索结果 ({filteredDocs.length})
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
                          className={`flex items-center justify-between py-2 px-3 hover:bg-hover-bg rounded-lg text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-indigo-50/80 border border-indigo-200/80 text-accent font-semibold shadow-xs'
                              : 'text-text-secondary'
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
                </>
              ) : (
                <>
                  <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2 px-1">
                    目录搜索结果 ({filteredGroups.length})
                  </div>
                  {filteredGroups.length === 0 ? (
                    <div className="text-center py-8 text-xs text-text-secondary">
                      没有找到匹配的目录
                    </div>
                  ) : (
                    filteredGroups.map((group) => {
                      const isSelected = selectedGroupId === group.id;
                      return (
                        <div
                          key={group.id}
                          onClick={(e) => handleSelectGroup(group, e)}
                          className={`flex items-center justify-between py-2 px-3 hover:bg-hover-bg rounded-lg text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-indigo-50/80 border border-indigo-200/80 text-accent font-semibold shadow-xs'
                              : 'text-text-secondary'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Folder size={14} className={isSelected ? 'text-accent shrink-0' : 'text-indigo-400 shrink-0'} />
                            <span className="truncate">{group.name}</span>
                          </div>
                          {isSelected && <Check size={14} className="text-accent shrink-0" />}
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          ) : (
            // Full Tree View
            <div className="space-y-3">
              {visibleKBs.map((kb) => {
                const isExpanded = !!expandedNodes[kb.id];
                const kbRootGroups = getChildGroups(null, kb.id).filter(
                  (g) => !forbiddenGroupIds.includes(g.id)
                );
                const kbDocs = documents.filter((doc) => doc.kbId === kb.id);
                const rootDocs = kbDocs.filter((doc) => doc.groupId === null);
                const hasFolderContent = kbRootGroups.length > 0;
                const hasContent = mode === 'document' ? hasFolderContent || rootDocs.length > 0 : hasFolderContent;
                const isKbSelected = (mode === 'folder' || mode === 'create-doc') && selectedKbId === kb.id && selectedGroupId === null;

                return (
                  <div key={kb.id} className="space-y-1">
                    {/* KB Row */}
                    <div
                      onClick={(e) => {
                        if (mode === 'folder' || mode === 'create-doc') {
                          handleSelectKbRoot(kb, e);
                        } else if (hasContent) {
                          toggleNode(kb.id, e);
                        }
                      }}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg border cursor-pointer hover:bg-hover-bg transition-all ${
                        isKbSelected
                          ? 'bg-indigo-50/80 border-accent/60 text-accent font-semibold shadow-xs'
                          : 'bg-white border-border-color/50 text-text-primary font-bold'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {hasContent ? (
                          <button
                            type="button"
                            onClick={(e) => toggleNode(kb.id, e)}
                            className="p-0.5 hover:bg-gray-200/70 rounded text-text-secondary shrink-0 transition-colors"
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
                          {(mode === 'folder' || mode === 'create-doc') && (
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
                                className={`flex items-center justify-between py-1.5 px-2.5 hover:bg-hover-bg rounded-lg text-xs cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-indigo-50/80 border border-indigo-200/80 text-accent font-semibold shadow-xs'
                                    : 'text-text-secondary'
                                }`}
                                style={{ paddingLeft: '10px' }}
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

        {/* Selected target info banner (统一在三种场景下展示，保持 100% 结构一致) */}
        {validationError ? (
          <div className="mt-3 px-3 py-2 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs flex items-center gap-2 font-medium shrink-0">
            <AlertCircle size={14} className="shrink-0" />
            <span>{validationError}</span>
          </div>
        ) : (
          <div className="mt-3 px-3 py-2 bg-indigo-50/60 border border-indigo-100 rounded-lg text-xs text-text-secondary shrink-0">
            {mode === 'document' ? (
              selectedDocId ? (
                <>
                  已选择引用文档：<span className="font-semibold text-accent mx-1">“{selectedDocTitle}”</span>
                </>
              ) : (
                <span className="text-text-ghost">请在上方列表中选择需要引用的文档</span>
              )
            ) : selectedKbId ? (
              <>
                {mode === 'create-doc' ? '文档将生成保存至：' : '准备移动至：'}
                <span className="font-semibold text-accent ml-1">
                  {fullPathList.join(' / ')}
                </span>
              </>
            ) : (
              <span className="text-text-ghost">请在上方列表中选择目标知识库或目录</span>
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
            className={`px-5 py-2.5 rounded-xl text-xs font-semibold text-white shadow-sm transition-all cursor-pointer ${
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
