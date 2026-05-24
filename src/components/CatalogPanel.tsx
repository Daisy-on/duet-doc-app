import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Search, ChevronDown, ChevronRight, FileText, MoreHorizontal } from 'lucide-react';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import type { Group, Document } from '../store/knowledgeBaseStore';
import AddContentMenu from './AddContentMenu';
import GroupAddMenu from './menus/GroupAddMenu';
import GroupActionMenu from './menus/GroupActionMenu';
import ConfirmDeleteModal from './modals/ConfirmDeleteModal';

interface GroupTreeNodeProps {
  group: Group;
  depth: number;
  kbId: string;
  docId: string | undefined;
  documents: Document[];
  collapsedGroups: Record<string, boolean>;
  toggleGroup: (id: string) => void;
  // Creation state
  creatingParentId: string | null | undefined;
  setCreatingParentId: (id: string | null | undefined) => void;
  newGroupName: string;
  setNewGroupName: (name: string) => void;
  handleFinishCreateGroup: () => void;
  // Rename state
  renamingGroupId: string | null;
  setRenamingGroupId: (id: string | null) => void;
  renamingName: string;
  setRenamingName: (name: string) => void;
  handleFinishRename: () => void;
  handleCancelRename: () => void;
  // Delete Modal state
  setDeleteTargetGroup: (group: Group) => void;
  setDeleteDescendantsCount: (count: number) => void;
  setDeleteDocsCount: (count: number) => void;
  setIsDeleteModalOpen: (open: boolean) => void;
  // Active menus
  activeAddMenuId: string | null;
  setActiveAddMenuId: (id: string | null) => void;
  activeActionMenuId: string | null;
  setActiveActionMenuId: (id: string | null) => void;
}

function GroupTreeNode({
  group,
  depth,
  kbId,
  docId,
  documents,
  collapsedGroups,
  toggleGroup,
  creatingParentId,
  setCreatingParentId,
  newGroupName,
  setNewGroupName,
  handleFinishCreateGroup,
  renamingGroupId,
  setRenamingGroupId,
  renamingName,
  setRenamingName,
  handleFinishRename,
  handleCancelRename,
  setDeleteTargetGroup,
  setDeleteDescendantsCount,
  setDeleteDocsCount,
  setIsDeleteModalOpen,
  activeAddMenuId,
  setActiveAddMenuId,
  activeActionMenuId,
  setActiveActionMenuId,
}: GroupTreeNodeProps) {
  const navigate = useNavigate();
  const { getChildGroups, createDocument, getDescendantGroupIds } = useKnowledgeBaseStore();

  const subGroups = getChildGroups(group.id, kbId);
  const groupDocs = documents.filter((doc) => doc.groupId === group.id);
  const isExpanded = !collapsedGroups[group.id];
  const isRenaming = renamingGroupId === group.id;

  // Max out standard indentation padding at depth 3 to avoid text wrapping in narrow sidebars
  const indentLevel = Math.min(depth, 3);
  const groupPaddingLeft = indentLevel * 12 + 6;
  const docPaddingLeft = indentLevel * 12 + 24;

  const handleGroupClick = () => {
    // Only toggle if not clicking on rename input
    if (isRenaming) return;
    toggleGroup(group.id);
  };

  return (
    <div className="mb-1">
      {/* Group Row */}
      <div
        onClick={handleGroupClick}
        className={`text-xs font-semibold text-text-primary py-2 px-1.5 mt-0.5 flex items-center justify-between hover:bg-hover-bg rounded-md cursor-pointer group/row transition-colors ${
          activeAddMenuId === group.id || activeActionMenuId === group.id ? 'bg-hover-bg' : ''
        }`}
        style={{ paddingLeft: `${groupPaddingLeft}px` }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isExpanded ? (
            <ChevronDown size={14} className="shrink-0 text-text-secondary" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-text-secondary" />
          )}

          {isRenaming ? (
            <input
              type="text"
              value={renamingName}
              onChange={(e) => setRenamingName(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishRename();
                else if (e.key === 'Escape') handleCancelRename();
              }}
              className="w-full text-xs font-semibold text-text-primary bg-white px-1.5 py-0.5 border border-border-color rounded outline-none focus:border-accent"
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.target.select()}
            />
          ) : (
            <span className="truncate">{group.name}</span>
          )}
        </div>

        {/* Row Action Buttons (hover triggers) */}
        {!isRenaming && (
          <div
            className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 ml-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Plus Button Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setActiveAddMenuId(activeAddMenuId === group.id ? null : group.id);
                  setActiveActionMenuId(null);
                }}
                className="text-text-secondary hover:text-text-primary hover:bg-black/5 p-1 rounded transition-colors flex"
                title="新建内容"
              >
                <Plus size={13} />
              </button>
              {activeAddMenuId === group.id && (
                <GroupAddMenu
                  isOpen={true}
                  onClose={() => setActiveAddMenuId(null)}
                  onNewDoc={() => {
                    const newDocId = createDocument(kbId, group.id, '新建文档');
                    navigate(`/kb/${kbId}/doc/${newDocId}`);
                  }}
                  onNewSubGroup={() => {
                    setCreatingParentId(group.id);
                    setNewGroupName('新建子分组');
                  }}
                  currentDepth={group.depth}
                />
              )}
            </div>

            {/* Action Dot Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setActiveActionMenuId(activeActionMenuId === group.id ? null : group.id);
                  setActiveAddMenuId(null);
                }}
                className="text-text-secondary hover:text-text-primary hover:bg-black/5 p-1 rounded transition-colors flex"
                title="更多操作"
              >
                <MoreHorizontal size={13} />
              </button>
              {activeActionMenuId === group.id && (
                <GroupActionMenu
                  isOpen={true}
                  onClose={() => setActiveActionMenuId(null)}
                  onRename={() => {
                    setRenamingGroupId(group.id);
                    setRenamingName(group.name);
                  }}
                  onDelete={() => {
                    const descendants = getDescendantGroupIds(group.id);
                    const allGroupIds = [group.id, ...descendants];
                    const docCount = documents.filter((d) => allGroupIds.includes(d.groupId || '')).length;

                    setDeleteTargetGroup(group);
                    setDeleteDescendantsCount(descendants.length);
                    setDeleteDocsCount(docCount);
                    setIsDeleteModalOpen(true);
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Children Tree */}
      {isExpanded && (
        <div className="space-y-0.5 mt-0.5">
          {/* Sub-groups */}
          {subGroups.map((subGroup) => (
            <GroupTreeNode
              key={subGroup.id}
              group={subGroup}
              depth={depth + 1}
              kbId={kbId}
              docId={docId}
              documents={documents}
              collapsedGroups={collapsedGroups}
              toggleGroup={toggleGroup}
              creatingParentId={creatingParentId}
              setCreatingParentId={setCreatingParentId}
              newGroupName={newGroupName}
              setNewGroupName={setNewGroupName}
              handleFinishCreateGroup={handleFinishCreateGroup}
              renamingGroupId={renamingGroupId}
              setRenamingGroupId={setRenamingGroupId}
              renamingName={renamingName}
              setRenamingName={setRenamingName}
              handleFinishRename={handleFinishRename}
              handleCancelRename={handleCancelRename}
              setDeleteTargetGroup={setDeleteTargetGroup}
              setDeleteDescendantsCount={setDeleteDescendantsCount}
              setDeleteDocsCount={setDeleteDocsCount}
              setIsDeleteModalOpen={setIsDeleteModalOpen}
              activeAddMenuId={activeAddMenuId}
              setActiveAddMenuId={setActiveAddMenuId}
              activeActionMenuId={activeActionMenuId}
              setActiveActionMenuId={setActiveActionMenuId}
            />
          ))}

          {/* Inline creation input for children of this group */}
          {creatingParentId === group.id && (
            <div
              className="p-1 mt-1 flex items-center gap-1.5 border border-accent/40 bg-indigo-50/20 rounded-md"
              style={{ paddingLeft: `${(indentLevel + 1) * 12 + 6}px` }}
            >
              <ChevronDown size={14} className="text-accent shrink-0" />
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onBlur={handleFinishCreateGroup}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFinishCreateGroup();
                  else if (e.key === 'Escape') setCreatingParentId(undefined);
                }}
                className="w-full text-xs font-semibold text-text-primary bg-white px-1.5 py-0.5 border border-border-color rounded outline-none focus:border-accent"
                autoFocus
                onFocus={(e) => e.target.select()}
              />
            </div>
          )}

          {/* Group Documents */}
          {groupDocs.map((doc) => {
            const isDocActive = docId === doc.id;
            return (
              <div
                key={doc.id}
                onClick={() => navigate(`/kb/${kbId}/doc/${doc.id}`)}
                className={`text-[13px] py-1.5 px-2 pr-2 rounded-md cursor-pointer flex items-center gap-2 transition-all ${
                  isDocActive
                    ? 'text-accent font-semibold bg-white shadow-sm border-l-2 border-accent rounded-l-none pl-[22px]'
                    : 'text-text-secondary hover:bg-hover-bg'
                }`}
                style={{ paddingLeft: isDocActive ? `${docPaddingLeft - 2}px` : `${docPaddingLeft}px` }}
              >
                <FileText size={14} className={isDocActive ? 'text-accent' : 'text-text-secondary'} />
                <span className="truncate">{doc.title}</span>
              </div>
            );
          })}

          {subGroups.length === 0 && groupDocs.length === 0 && (
            <div
              className="text-[11px] text-gray-400 italic py-1 px-2 pr-2"
              style={{ paddingLeft: `${docPaddingLeft}px` }}
            >
              (空分组)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CatalogPanel() {
  const { kbId, docId } = useParams<{ kbId?: string; docId?: string }>();
  const navigate = useNavigate();

  const {
    getKnowledgeBase,
    getDocumentsByKb,
    createDocument,
    createGroup,
    updateGroup,
    deleteGroup,
    getChildGroups,
    getDescendantGroupIds,
  } = useKnowledgeBaseStore();

  const kb = kbId ? getKnowledgeBase(kbId) : undefined;
  const rootGroups = kbId ? getChildGroups(null, kbId) : [];
  const documents = kbId ? getDocumentsByKb(kbId) : [];

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Group creation states
  // undefined = not creating, null = creating at root, string = creating sub-group under that parentGroupId
  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);
  const [newGroupName, setNewGroupName] = useState('');

  // Group rename states
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState('');

  // Active floating menus
  const [activeAddMenuId, setActiveAddMenuId] = useState<string | null>(null);
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  // Delete modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTargetGroup, setDeleteTargetGroup] = useState<Group | null>(null);
  const [deleteDescendantsCount, setDeleteDescendantsCount] = useState(0);
  const [deleteDocsCount, setDeleteDocsCount] = useState(0);

  const menuTriggerRef = useRef<HTMLDivElement>(null);

  const handleFinishCreateGroup = () => {
    if (creatingParentId === undefined || !kbId) return;
    if (!newGroupName.trim()) {
      setCreatingParentId(undefined);
      return;
    }
    createGroup(kbId, creatingParentId, newGroupName.trim());
    setCreatingParentId(undefined);
  };

  const handleStartCreateGroup = () => {
    if (!kbId) return;
    const rootCount = rootGroups.length;
    const defaultName = `0${rootCount + 1}. 新建分组`;
    setNewGroupName(defaultName);
    setCreatingParentId(null);
  };

  const handleCreateDocument = () => {
    if (!kbId) return;
    const newDocId = createDocument(kbId, null, '新建文档');
    navigate(`/kb/${kbId}/doc/${newDocId}`);
  };

  const handleFinishRename = () => {
    if (!renamingGroupId) return;
    if (renamingName.trim()) {
      updateGroup(renamingGroupId, { name: renamingName.trim() });
    }
    setRenamingGroupId(null);
  };

  const handleCancelRename = () => {
    setRenamingGroupId(null);
  };

  const handleConfirmDelete = () => {
    if (!deleteTargetGroup || !kbId) return;
    const descendants = getDescendantGroupIds(deleteTargetGroup.id);
    const deleteGroupIds = [deleteTargetGroup.id, ...descendants];

    const isActiveDocDeleted = docId && documents.some(
      (d) => d.id === docId && deleteGroupIds.includes(d.groupId || '')
    );

    deleteGroup(deleteTargetGroup.id);
    setDeleteTargetGroup(null);

    if (isActiveDocDeleted) {
      navigate(`/kb/${kbId}`);
    }
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  if (!kb || !kbId) {
    return (
      <aside className="w-[220px] min-w-[220px] bg-bg-panel border-r border-border-color flex flex-col p-5 text-center text-text-secondary text-xs">
        选择一个知识库查看目录
      </aside>
    );
  }

  // Calculate back navigation path
  const backPath = docId ? `/kb/${kbId}` : '/';

  return (
    <>
      <aside className="w-[220px] min-w-[220px] bg-bg-panel border-r border-border-color flex flex-col h-full select-none">
        {/* Header */}
        <div className="p-5 pb-3 flex justify-between items-center shrink-0">
          <div
            onClick={() => navigate(backPath)}
            className="text-[14px] font-semibold text-text-primary flex items-center gap-1.5 cursor-pointer hover:text-accent transition-colors truncate max-w-[150px]"
            title={docId ? `返回 ${kb.name}` : '返回主页'}
          >
            <ChevronLeft size={16} className="shrink-0" />
            <span className="truncate">{kb.name}</span>
          </div>
          <div className="relative" ref={menuTriggerRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-text-secondary cursor-pointer hover:text-text-primary transition-colors p-1 hover:bg-hover-bg rounded-md flex"
            >
              <Plus size={16} />
            </button>

            <AddContentMenu
              isOpen={isMenuOpen}
              onClose={() => setIsMenuOpen(false)}
              onNewDoc={handleCreateDocument}
              onNewGroup={handleStartCreateGroup}
            />
          </div>
        </div>

        {/* Search Current KB */}
        <div className="mx-4 mb-3 px-2.5 py-1.5 bg-white border border-border-color rounded-md text-xs text-text-secondary flex items-center gap-1.5 shadow-sm shrink-0 cursor-text hover:border-accent transition-colors">
          <Search size={14} /> 搜索当前知识库...
        </div>

        {/* Catalog Tree Scroll Area */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {/* Render Groups and their Docs recursively */}
          {rootGroups.map((group) => (
            <GroupTreeNode
              key={group.id}
              group={group}
              depth={0}
              kbId={kbId}
              docId={docId}
              documents={documents}
              collapsedGroups={collapsedGroups}
              toggleGroup={toggleGroup}
              creatingParentId={creatingParentId}
              setCreatingParentId={setCreatingParentId}
              newGroupName={newGroupName}
              setNewGroupName={setNewGroupName}
              handleFinishCreateGroup={handleFinishCreateGroup}
              renamingGroupId={renamingGroupId}
              setRenamingGroupId={setRenamingGroupId}
              renamingName={renamingName}
              setRenamingName={setRenamingName}
              handleFinishRename={handleFinishRename}
              handleCancelRename={handleCancelRename}
              setDeleteTargetGroup={setDeleteTargetGroup}
              setDeleteDescendantsCount={setDeleteDescendantsCount}
              setDeleteDocsCount={setDeleteDocsCount}
              setIsDeleteModalOpen={setIsDeleteModalOpen}
              activeAddMenuId={activeAddMenuId}
              setActiveAddMenuId={setActiveAddMenuId}
              activeActionMenuId={activeActionMenuId}
              setActiveActionMenuId={setActiveActionMenuId}
            />
          ))}

          {/* Inline edit container for creating a new root group */}
          {creatingParentId === null && (
            <div className="p-2 mt-2 flex items-center gap-1.5 border border-accent/40 bg-indigo-50/20 rounded-md">
              <ChevronDown size={14} className="text-accent shrink-0" />
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onBlur={handleFinishCreateGroup}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFinishCreateGroup();
                  else if (e.key === 'Escape') setCreatingParentId(undefined);
                }}
                className="w-full text-xs font-semibold text-text-primary bg-white px-1.5 py-0.5 border border-border-color rounded outline-none focus:border-accent"
                autoFocus
                onFocus={(e) => e.target.select()}
              />
            </div>
          )}

          {/* Render Root Level Documents */}
          {documents.filter((doc) => doc.groupId === null).length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-[11px] font-bold text-text-secondary uppercase tracking-wider px-2 mb-1.5">
                未分组文档
              </div>
              <div className="space-y-0.5">
                {documents
                  .filter((doc) => doc.groupId === null)
                  .map((doc) => {
                    const isDocActive = docId === doc.id;
                    return (
                      <div
                        key={doc.id}
                        onClick={() => navigate(`/kb/${kbId}/doc/${doc.id}`)}
                        className={`text-[13px] py-1.5 px-2 pr-2 pl-6 rounded-md cursor-pointer flex items-center gap-2 transition-all ${
                          isDocActive
                            ? 'text-accent font-semibold bg-white shadow-sm border-l-2 border-accent rounded-l-none pl-[22px]'
                            : 'text-text-secondary hover:bg-hover-bg'
                        }`}
                      >
                        <FileText size={14} className={isDocActive ? 'text-accent' : 'text-text-secondary'} />
                        <span className="truncate">{doc.title}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Cascading Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteTargetGroup(null);
        }}
        onConfirm={handleConfirmDelete}
        title="确认删除分组"
        description={
          deleteTargetGroup ? (
            <span>
              此操作将永久删除分组
              <strong className="text-text-primary mx-1">“{deleteTargetGroup.name}”</strong>
              以及该分组下的
              {deleteDescendantsCount > 0 && (
                <>
                  <strong className="text-text-primary mx-1">{deleteDescendantsCount} 个子分组</strong>
                  和
                </>
              )}
              <strong className="text-text-primary mx-1">{deleteDocsCount} 篇文档</strong>
              。删除后不可恢复，是否确认删除？
            </span>
          ) : (
            ''
          )
        }
      />
    </>
  );
}
