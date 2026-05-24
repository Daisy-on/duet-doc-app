import React, { useState, useEffect } from 'react';
import { X, Folder, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { useKnowledgeBaseStore, MEMO_KB_ID } from '../../store/knowledgeBaseStore';
import type { Group, KnowledgeBase } from '../../store/knowledgeBaseStore';

interface MoveToKBModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  onConfirm: (targetKbId: string, targetGroupId: string | null) => void;
}

export default function MoveToKBModal({
  isOpen,
  onClose,
  documentId: _documentId,
  documentTitle,
  onConfirm,
}: MoveToKBModalProps) {
  const { knowledgeBases, groups, getChildGroups } = useKnowledgeBaseStore();
  
  // Selection states
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  
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
      // Clear selection
      setSelectedKbId(null);
      setSelectedGroupId(null);
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

  const handleConfirmAction = () => {
    if (selectedKbId) {
      onConfirm(selectedKbId, selectedGroupId);
      onClose();
    }
  };

  // Find KB and Group names for confirmation display
  const targetKb = knowledgeBases.find((kb) => kb.id === selectedKbId);
  const targetGroup = groups.find((g) => g.id === selectedGroupId);

  // Group Node rendering for tree
  const GroupNode = ({ group, depth }: { group: Group; depth: number }) => {
    const isExpanded = !!expandedNodes[group.id];
    const subGroups = getChildGroups(group.id, group.kbId);
    const hasChildren = subGroups.length > 0;
    const isSelected = selectedGroupId === group.id;

    return (
      <div className="space-y-1">
        <div
          onClick={(e) => handleSelectGroup(group, e)}
          className={`flex items-center justify-between py-1.5 px-2 hover:bg-hover-bg rounded text-xs cursor-pointer ${
            isSelected ? 'bg-indigo-50/70 text-accent font-semibold' : 'text-text-primary'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasChildren ? (
              <button
                onClick={(e) => toggleNode(group.id, e)}
                className="p-0.5 hover:bg-gray-200 rounded text-text-secondary shrink-0"
              >
                {isExpanded ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <Folder size={14} className={`shrink-0 ${isSelected ? 'text-accent' : 'text-indigo-400'}`} />
            <span className="truncate">{group.name}</span>
          </div>
          {isSelected && <Check size={14} className="text-accent shrink-0" />}
        </div>

        {/* Nested child groups */}
        {isExpanded && hasChildren && (
          <div className="space-y-1">
            {subGroups.map((sub) => (
              <GroupNode key={sub.id} group={sub} depth={depth + 1} />
            ))}
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
        className="bg-white rounded-xl shadow-2xl w-[480px] h-[520px] border border-border-color overflow-hidden flex flex-col p-6 animate-modal-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-border-color shrink-0">
          <div>
            <h3 className="text-base font-bold text-text-primary">移动文档至知识库</h3>
            <p className="text-[11px] text-text-secondary mt-0.5">
              文档：<span className="font-semibold text-text-primary">“{documentTitle}”</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded-md hover:bg-hover-bg"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tree Selector Body */}
        <div className="flex-1 overflow-y-auto border border-border-color rounded-lg bg-bg-panel p-3">
          <div className="space-y-3">
            {visibleKBs.map((kb) => {
              const isExpanded = !!expandedNodes[kb.id];
              const kbRootGroups = getChildGroups(null, kb.id);
              const hasContent = kbRootGroups.length > 0;
              const isKbSelected = selectedKbId === kb.id && selectedGroupId === null;

              return (
                <div key={kb.id} className="space-y-1">
                  {/* Knowledge Base Item */}
                  <div
                    onClick={(e) => handleSelectKbRoot(kb, e)}
                    className={`flex items-center justify-between py-2 px-3 rounded-lg border cursor-pointer hover:bg-hover-bg hover:border-border-color/80 transition-all ${
                      isKbSelected
                        ? 'bg-indigo-50/70 border-accent/60 text-accent font-semibold'
                        : 'bg-white border-border-color/50 text-text-primary'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {hasContent ? (
                        <button
                          onClick={(e) => toggleNode(kb.id, e)}
                          className="p-0.5 hover:bg-gray-200 rounded text-text-secondary shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronRight size={12} />
                          )}
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <Folder
                        size={14}
                        style={{ color: kb.icon }}
                        className="shrink-0"
                      />
                      <span className="truncate">{kb.name} <span className="text-[10px] text-text-secondary font-normal">(根目录)</span></span>
                    </div>
                    {isKbSelected && <Check size={14} className="text-accent shrink-0" />}
                  </div>

                  {/* KB Group Tree */}
                  {isExpanded && hasContent && (
                    <div className="ml-4 pl-3 border-l border-border-color/60 space-y-1 py-1">
                      {kbRootGroups.map((group) => (
                        <GroupNode key={group.id} group={group} depth={0} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected target info */}
        {selectedKbId && (
          <div className="mt-3 px-3 py-2 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-text-secondary shrink-0">
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
            disabled={!selectedKbId}
            onClick={handleConfirmAction}
            className={`px-5 py-2 rounded-lg text-xs font-semibold text-white shadow-sm transition-colors cursor-pointer ${
              selectedKbId
                ? 'bg-accent hover:bg-indigo-700'
                : 'bg-indigo-300 cursor-not-allowed'
            }`}
          >
            确认移动
          </button>
        </div>
      </div>
    </div>
  );
}
