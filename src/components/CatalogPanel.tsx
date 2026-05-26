import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Search, ChevronDown, ChevronRight, FileText, MoreHorizontal } from 'lucide-react';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import { useLayoutStore } from '../store';
import type { Group, Document } from '../store/knowledgeBaseStore';
import AddContentMenu from './AddContentMenu';
import GroupAddMenu from './menus/GroupAddMenu';
import GroupActionMenu from './menus/GroupActionMenu';
import DocActionMenu from './menus/DocActionMenu';
import ConfirmDeleteModal from './modals/ConfirmDeleteModal';
import MoveToKBModal from './modals/MoveToKBModal';
import MoveGroupModal from './modals/MoveGroupModal';

interface DocTreeItemProps {
  doc: Document;
  kbId: string;
  docId: string | undefined;
  paddingLeft: number;
  
  renamingDocId: string | null;
  renamingDocTitle: string;
  setRenamingDocTitle: (title: string) => void;
  handleFinishRenameDoc: () => void;
  handleCancelRenameDoc: () => void;
  
  activeDocActionMenuId: string | null;
  setActiveDocActionMenuId: (id: string | null) => void;
  setDocActionMenuAnchorEl: (el: HTMLElement | null) => void;
  
  // Clear any group menu states
  clearGroupMenus: () => void;
}

function DocTreeItem({
  doc,
  kbId,
  docId,
  paddingLeft,
  renamingDocId,
  renamingDocTitle,
  setRenamingDocTitle,
  handleFinishRenameDoc,
  handleCancelRenameDoc,
  activeDocActionMenuId,
  setActiveDocActionMenuId,
  setDocActionMenuAnchorEl,
  clearGroupMenus,
}: DocTreeItemProps) {
  const navigate = useNavigate();
  const isDocActive = docId === doc.id;
  const isRenamingDoc = renamingDocId === doc.id;

  const handleDocClick = () => {
    if (isRenamingDoc) return;
    navigate(`/kb/${kbId}/doc/${doc.id}`);
  };

  return (
    <div
      onClick={handleDocClick}
      className={`text-[13px] py-1.5 px-2 pr-2 rounded-md cursor-pointer flex items-center justify-between group/row hover:bg-hover-bg transition-all ${
        isDocActive
          ? 'text-accent font-semibold bg-white shadow-sm border-l-2 border-accent rounded-l-none pl-[22px]'
          : 'text-text-secondary'
      } ${
        activeDocActionMenuId === doc.id ? 'bg-hover-bg' : ''
      }`}
      style={{ paddingLeft: isDocActive ? `${paddingLeft - 2}px` : `${paddingLeft}px` }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <FileText size={14} className={isDocActive ? 'text-accent' : 'text-text-secondary'} />
        {isRenamingDoc ? (
          <input
            type="text"
            value={renamingDocTitle}
            onChange={(e) => setRenamingDocTitle(e.target.value)}
            onBlur={handleFinishRenameDoc}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFinishRenameDoc();
              else if (e.key === 'Escape') handleCancelRenameDoc();
            }}
            className="w-full text-xs font-semibold text-text-primary bg-white px-1.5 py-0.5 border border-border-color rounded outline-none focus:border-accent"
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.target.select()}
          />
        ) : (
          <span className="truncate">{doc.title}</span>
        )}
      </div>

      {/* Row Action Buttons (hover triggers) */}
      {!isRenamingDoc && (
        <div
          className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 ml-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Action Dot Menu */}
          <button
            onClick={(e) => {
              clearGroupMenus();
              setActiveDocActionMenuId(activeDocActionMenuId === doc.id ? null : doc.id);
              setDocActionMenuAnchorEl(activeDocActionMenuId === doc.id ? null : e.currentTarget);
            }}
            className="text-text-secondary hover:text-text-primary hover:bg-black/5 p-1 rounded transition-colors flex"
            title="更多操作"
          >
            <MoreHorizontal size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

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
  
  // Set Menu Active and Anchors
  activeAddMenuId: string | null;
  setActiveAddMenuId: (id: string | null) => void;
  setAddMenuAnchorEl: (el: HTMLElement | null) => void;
  activeActionMenuId: string | null;
  setActiveActionMenuId: (id: string | null) => void;
  setActionMenuAnchorEl: (el: HTMLElement | null) => void;
  
  // Delete Modal state
  setDeleteTargetGroup: (group: Group) => void;
  setDeleteDescendantsCount: (count: number) => void;
  setDeleteDocsCount: (count: number) => void;
  setIsDeleteModalOpen: (open: boolean) => void;
  
  // Document actions props
  renamingDocId: string | null;
  renamingDocTitle: string;
  setRenamingDocTitle: (title: string) => void;
  handleFinishRenameDoc: () => void;
  handleCancelRenameDoc: () => void;
  activeDocActionMenuId: string | null;
  setActiveDocActionMenuId: (id: string | null) => void;
  setDocActionMenuAnchorEl: (el: HTMLElement | null) => void;
  
  clearGroupMenus: () => void;
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
  activeAddMenuId,
  setActiveAddMenuId,
  setAddMenuAnchorEl,
  activeActionMenuId,
  setActiveActionMenuId,
  setActionMenuAnchorEl,
  setDeleteTargetGroup,
  setDeleteDescendantsCount,
  setDeleteDocsCount,
  setIsDeleteModalOpen,
  
  renamingDocId,
  renamingDocTitle,
  setRenamingDocTitle,
  handleFinishRenameDoc,
  handleCancelRenameDoc,
  activeDocActionMenuId,
  setActiveDocActionMenuId,
  setDocActionMenuAnchorEl,
  clearGroupMenus,
}: GroupTreeNodeProps) {
  const { getChildGroups } = useKnowledgeBaseStore();

  const subGroups = getChildGroups(group.id, kbId);
  const groupDocs = documents.filter((doc) => doc.groupId === group.id);
  const isExpanded = !collapsedGroups[group.id];
  const isRenaming = renamingGroupId === group.id;

  // 8px indentation per level without visual capping
  const groupPaddingLeft = depth * 8 + 6;
  const docPaddingLeft = depth * 8 + 24;

  const handleGroupClick = () => {
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
              className="w-full text-xs font-semibold text-text-primary bg-white px-1.5 py-0.5 border border-border-color rounded outline-none focus:border-accent"
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.target.select()}
              onBlur={handleFinishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishRename();
                else if (e.key === 'Escape') handleCancelRename();
              }}
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
            <button
              onClick={(e) => {
                setActiveAddMenuId(activeAddMenuId === group.id ? null : group.id);
                setAddMenuAnchorEl(activeAddMenuId === group.id ? null : e.currentTarget);
                setActiveActionMenuId(null);
                setActionMenuAnchorEl(null);
                setActiveDocActionMenuId(null);
                setDocActionMenuAnchorEl(null);
              }}
              className="text-text-secondary hover:text-text-primary hover:bg-black/5 p-1 rounded transition-colors flex"
              title="新建内容"
            >
              <Plus size={13} />
            </button>

            {/* Action Dot Menu */}
            <button
              onClick={(e) => {
                setActiveActionMenuId(activeActionMenuId === group.id ? null : group.id);
                setActionMenuAnchorEl(activeActionMenuId === group.id ? null : e.currentTarget);
                setActiveAddMenuId(null);
                setAddMenuAnchorEl(null);
                setActiveDocActionMenuId(null);
                setDocActionMenuAnchorEl(null);
              }}
              className="text-text-secondary hover:text-text-primary hover:bg-black/5 p-1 rounded transition-colors flex"
              title="更多操作"
            >
              <MoreHorizontal size={13} />
            </button>
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
              activeAddMenuId={activeAddMenuId}
              setActiveAddMenuId={setActiveAddMenuId}
              setAddMenuAnchorEl={setAddMenuAnchorEl}
              activeActionMenuId={activeActionMenuId}
              setActiveActionMenuId={setActiveActionMenuId}
              setActionMenuAnchorEl={setActionMenuAnchorEl}
              setDeleteTargetGroup={setDeleteTargetGroup}
              setDeleteDescendantsCount={setDeleteDescendantsCount}
              setDeleteDocsCount={setDeleteDocsCount}
              setIsDeleteModalOpen={setIsDeleteModalOpen}
              
              renamingDocId={renamingDocId}
              renamingDocTitle={renamingDocTitle}
              setRenamingDocTitle={setRenamingDocTitle}
              handleFinishRenameDoc={handleFinishRenameDoc}
              handleCancelRenameDoc={handleCancelRenameDoc}
              activeDocActionMenuId={activeDocActionMenuId}
              setActiveDocActionMenuId={setActiveDocActionMenuId}
              setDocActionMenuAnchorEl={setDocActionMenuAnchorEl}
              clearGroupMenus={clearGroupMenus}
            />
          ))}

          {/* Inline creation input for children of this group */}
          {creatingParentId === group.id && (
            <div
              className="p-1 mt-1 flex items-center gap-1.5 border border-accent/40 bg-indigo-50/20 rounded-md"
              style={{ paddingLeft: `${(depth + 1) * 8 + 6}px` }}
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
          {groupDocs.map((doc) => (
            <DocTreeItem
              key={doc.id}
              doc={doc}
              kbId={kbId}
              docId={docId}
              paddingLeft={docPaddingLeft}
              renamingDocId={renamingDocId}
              renamingDocTitle={renamingDocTitle}
              setRenamingDocTitle={setRenamingDocTitle}
              handleFinishRenameDoc={handleFinishRenameDoc}
              handleCancelRenameDoc={handleCancelRenameDoc}
              activeDocActionMenuId={activeDocActionMenuId}
              setActiveDocActionMenuId={setActiveDocActionMenuId}
              setDocActionMenuAnchorEl={setDocActionMenuAnchorEl}
              clearGroupMenus={clearGroupMenus}
            />
          ))}

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
    updateDocument,
    deleteDocument,
    getChildGroups,
    getDescendantGroupIds,
    moveDocument,
    moveGroup,
    getGroupAncestors,
    groups,
  } = useKnowledgeBaseStore();

  const {
    catalogWidth,
    isCatalogCollapsed,
    setCatalogWidth,
    setIsCatalogCollapsed,
  } = useLayoutStore();

  const kb = kbId ? getKnowledgeBase(kbId) : undefined;
  const rootGroups = kbId ? getChildGroups(null, kbId) : [];
  const documents = kbId ? getDocumentsByKb(kbId) : [];

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Document move states
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [selectedDocForMove, setSelectedDocForMove] = useState<Document | null>(null);

  const handleConfirmMove = (targetKbId: string, targetGroupId: string | null) => {
    if (selectedDocForMove) {
      moveDocument(selectedDocForMove.id, targetKbId, targetGroupId);
      setIsMoveModalOpen(false);
      navigate(`/kb/${targetKbId}/doc/${selectedDocForMove.id}`);
      setSelectedDocForMove(null);
    }
  };

  // Group move states
  const [isMoveGroupModalOpen, setIsMoveGroupModalOpen] = useState(false);
  const [selectedGroupForMove, setSelectedGroupForMove] = useState<Group | null>(null);

  const handleConfirmMoveGroup = (targetKbId: string, targetGroupId: string | null) => {
    if (selectedGroupForMove) {
      const res = moveGroup(selectedGroupForMove.id, targetKbId, targetGroupId);
      if (res.success) {
        setIsMoveGroupModalOpen(false);
        if (targetGroupId) {
          const ancestors = getGroupAncestors(targetGroupId);
          setCollapsedGroups((prev) => {
            const next = { ...prev };
            next[targetGroupId] = false;
            ancestors.forEach((a) => {
              next[a.id] = false;
            });
            return next;
          });
        }
        navigate(`/kb/${targetKbId}`);
        setSelectedGroupForMove(null);
      } else {
        alert(res.error || '移动分组失败');
      }
    }
  };

  // Group creation states
  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);
  const [newGroupName, setNewGroupName] = useState('');

  // Group rename states
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState('');

  // Group active floating menus & anchors
  const [activeAddMenuId, setActiveAddMenuId] = useState<string | null>(null);
  const [addMenuAnchorEl, setAddMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);
  const [actionMenuAnchorEl, setActionMenuAnchorEl] = useState<HTMLElement | null>(null);

  // Group Delete modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTargetGroup, setDeleteTargetGroup] = useState<Group | null>(null);
  const [deleteDescendantsCount, setDeleteDescendantsCount] = useState(0);
  const [deleteDocsCount, setDeleteDocsCount] = useState(0);

  // Document action states & anchors
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renamingDocTitle, setRenamingDocTitle] = useState('');
  const [activeDocActionMenuId, setActiveDocActionMenuId] = useState<string | null>(null);
  const [docActionMenuAnchorEl, setDocActionMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [isDeleteDocModalOpen, setIsDeleteDocModalOpen] = useState(false);
  const [deleteTargetDoc, setDeleteTargetDoc] = useState<Document | null>(null);

  const menuTriggerRef = useRef<HTMLDivElement>(null);

  const clearGroupMenus = () => {
    setActiveAddMenuId(null);
    setAddMenuAnchorEl(null);
    setActiveActionMenuId(null);
    setActionMenuAnchorEl(null);
  };

  const clearDocMenus = () => {
    setActiveDocActionMenuId(null);
    setDocActionMenuAnchorEl(null);
  };

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
    setIsDeleteModalOpen(false);

    if (isActiveDocDeleted) {
      navigate(`/kb/${kbId}`);
    }
  };

  // Document action handlers
  const handleFinishRenameDoc = () => {
    if (!renamingDocId) return;
    if (renamingDocTitle.trim()) {
      updateDocument(renamingDocId, { title: renamingDocTitle.trim() });
    }
    setRenamingDocId(null);
  };

  const handleCancelRenameDoc = () => {
    setRenamingDocId(null);
  };

  const handleConfirmDeleteDoc = () => {
    if (!deleteTargetDoc || !kbId) return;
    deleteDocument(deleteTargetDoc.id);
    const wasActiveDoc = docId === deleteTargetDoc.id;
    setDeleteTargetDoc(null);
    setIsDeleteDocModalOpen(false);
    if (wasActiveDoc) {
      navigate(`/kb/${kbId}`);
    }
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Drag resize handler
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = catalogWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = startWidth + deltaX;
      const minWidth = 220;
      const maxWidth = Math.floor(window.innerWidth / 3);

      if (newWidth < minWidth) {
        const overflow = minWidth - newWidth;
        if (overflow > minWidth / 2) {
          setIsCatalogCollapsed(true);
        } else {
          setIsCatalogCollapsed(false);
          setCatalogWidth(minWidth);
        }
      } else if (newWidth > maxWidth) {
        setCatalogWidth(maxWidth);
        setIsCatalogCollapsed(false);
      } else {
        setCatalogWidth(newWidth);
        setIsCatalogCollapsed(false);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
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
      <aside
        style={{ width: isCatalogCollapsed ? 0 : `${catalogWidth}px` }}
        className={`relative bg-bg-panel border-r border-border-color flex flex-col h-full select-none transition-all duration-150 ease-out ${
          isCatalogCollapsed ? 'overflow-visible' : 'overflow-hidden'
        }`}
      >
        {/* Render content only when not collapsed */}
        {!isCatalogCollapsed && (
          <div className="flex flex-col h-full w-full min-w-[220px]">
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
              <div className="relative flex items-center gap-1.5" ref={menuTriggerRef}>
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
                  activeAddMenuId={activeAddMenuId}
                  setActiveAddMenuId={setActiveAddMenuId}
                  setAddMenuAnchorEl={setAddMenuAnchorEl}
                  activeActionMenuId={activeActionMenuId}
                  setActiveActionMenuId={setActiveActionMenuId}
                  setActionMenuAnchorEl={setActionMenuAnchorEl}
                  setDeleteTargetGroup={setDeleteTargetGroup}
                  setDeleteDescendantsCount={setDeleteDescendantsCount}
                  setDeleteDocsCount={setDeleteDocsCount}
                  setIsDeleteModalOpen={setIsDeleteModalOpen}
                  
                  renamingDocId={renamingDocId}
                  renamingDocTitle={renamingDocTitle}
                  setRenamingDocTitle={setRenamingDocTitle}
                  handleFinishRenameDoc={handleFinishRenameDoc}
                  handleCancelRenameDoc={handleCancelRenameDoc}
                  activeDocActionMenuId={activeDocActionMenuId}
                  setActiveDocActionMenuId={setActiveDocActionMenuId}
                  setDocActionMenuAnchorEl={setDocActionMenuAnchorEl}
                  clearGroupMenus={clearGroupMenus}
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
                      .map((doc) => (
                        <DocTreeItem
                          key={doc.id}
                          doc={doc}
                          kbId={kbId}
                          docId={docId}
                          paddingLeft={24}
                          renamingDocId={renamingDocId}
                          renamingDocTitle={renamingDocTitle}
                          setRenamingDocTitle={setRenamingDocTitle}
                          handleFinishRenameDoc={handleFinishRenameDoc}
                          handleCancelRenameDoc={handleCancelRenameDoc}
                          activeDocActionMenuId={activeDocActionMenuId}
                          setActiveDocActionMenuId={setActiveDocActionMenuId}
                          setDocActionMenuAnchorEl={setDocActionMenuAnchorEl}
                          clearGroupMenus={clearGroupMenus}
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Drag handle resize line */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 -right-[2px] w-[4px] h-full cursor-col-resize hover:bg-accent/40 active:bg-accent/80 transition-colors z-30"
        />
      </aside>

      {/* Floating Menus (Landed outside aside with overflow-hidden to prevent container clipping) */}
      {/* 1. Group Add Menu */}
      {activeAddMenuId && (
        (() => {
          const group = groups.find((g) => g.id === activeAddMenuId);
          if (!group) return null;
          return (
            <GroupAddMenu
              isOpen={true}
              onClose={clearGroupMenus}
              onNewDoc={() => {
                const newDocId = createDocument(kbId, group.id, '新建文档');
                navigate(`/kb/${kbId}/doc/${newDocId}`);
              }}
              onNewSubGroup={() => {
                setCreatingParentId(group.id);
                setNewGroupName('新建子分组');
              }}
              currentDepth={group.depth}
              anchorEl={addMenuAnchorEl}
            />
          );
        })()
      )}

      {/* 2. Group Action Menu */}
      {activeActionMenuId && (
        (() => {
          const group = groups.find((g) => g.id === activeActionMenuId);
          if (!group) return null;
          return (
            <GroupActionMenu
              isOpen={true}
              onClose={clearGroupMenus}
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
              onMove={() => {
                setSelectedGroupForMove(group);
                setIsMoveGroupModalOpen(true);
              }}
              anchorEl={actionMenuAnchorEl}
            />
          );
        })()
      )}

      {/* 3. Doc Action Menu */}
      {activeDocActionMenuId && (
        (() => {
          const doc = documents.find((d) => d.id === activeDocActionMenuId);
          if (!doc) return null;
          return (
            <DocActionMenu
              isOpen={true}
              onClose={clearDocMenus}
              onRename={() => {
                setRenamingDocId(doc.id);
                setRenamingDocTitle(doc.title);
              }}
              onDelete={() => {
                setDeleteTargetDoc(doc);
                setIsDeleteDocModalOpen(true);
              }}
              onMove={() => {
                setSelectedDocForMove(doc);
                setIsMoveModalOpen(true);
              }}
              anchorEl={docActionMenuAnchorEl}
            />
          );
        })()
      )}

      {/* Cascading Group Delete Confirmation Modal */}
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

      {/* Document Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={isDeleteDocModalOpen}
        onClose={() => {
          setIsDeleteDocModalOpen(false);
          setDeleteTargetDoc(null);
        }}
        onConfirm={handleConfirmDeleteDoc}
        title="确认删除文档"
        description={
          deleteTargetDoc ? (
            <span>
              此操作将永久删除文档
              <strong className="text-text-primary mx-1">“{deleteTargetDoc.title}”</strong>
              。删除后不可恢复，是否确认删除？
            </span>
          ) : (
            ''
          )
        }
      />

      {/* Document Move Modal */}
      {selectedDocForMove && (
        <MoveToKBModal
          isOpen={isMoveModalOpen}
          onClose={() => {
            setIsMoveModalOpen(false);
            setSelectedDocForMove(null);
          }}
          documentId={selectedDocForMove.id}
          documentTitle={selectedDocForMove.title}
          onConfirm={handleConfirmMove}
        />
      )}

      {/* Group Move Modal */}
      {selectedGroupForMove && (
        <MoveGroupModal
          isOpen={isMoveGroupModalOpen}
          onClose={() => {
            setIsMoveGroupModalOpen(false);
            setSelectedGroupForMove(null);
          }}
          groupId={selectedGroupForMove.id}
          groupName={selectedGroupForMove.name}
          onConfirm={handleConfirmMoveGroup}
        />
      )}
    </>
  );
}
