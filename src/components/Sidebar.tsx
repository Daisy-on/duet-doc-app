import { useEffect, useState } from 'react';
import {
  Home,
  Sparkles,
  StickyNote,
  Star,
  Folder,
  Search,
  Plus,
  MoreHorizontal,
  CloudUpload,
  CloudDownload,
  CloudOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { useKnowledgeBaseStore, MEMO_KB_ID, type KnowledgeBase } from '../store/knowledgeBaseStore';
import { useAIWritingStore } from '../store/aiWritingStore';
import { useEditorStore, useLayoutStore } from '../store';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';
import CreateKnowledgeBaseModal from './modals/CreateKnowledgeBaseModal';
import ConfirmDeleteModal from './modals/ConfirmDeleteModal';
import SyncConflictModal from './modals/SyncConflictModal';
import KbActionMenu from './menus/KbActionMenu';
import UserActionMenu from './menus/UserActionMenu';
import SyncStatusPopover from './modals/SyncStatusPopover';

export default function Sidebar() {
  const { kbId: activeKbId } = useParams<{ kbId?: string }>();
  const navigate = useNavigate();
  const lastVisitedSessionId = useAIWritingStore((state) => state.lastVisitedSessionId);
  const knowledgeBases = useKnowledgeBaseStore((state) => state.knowledgeBases);
  const updateKnowledgeBase = useKnowledgeBaseStore((state) => state.updateKnowledgeBase);
  const deleteKnowledgeBase = useKnowledgeBaseStore((state) => state.deleteKnowledgeBase);
  const flushAllDocumentAutosaves = useKnowledgeBaseStore(
    (state) => state.flushAllDocumentAutosaves,
  );
  const setIsCatalogCollapsed = useLayoutStore((state) => state.setIsCatalogCollapsed);

  const syncStatus = useSyncStore((state) => state.status);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const errorCount = useSyncStore((state) => state.errorCount);
  const lastSyncAt = useSyncStore((state) => state.lastSyncAt);
  const errorMessage = useSyncStore((state) => state.errorMessage);
  const conflicts = useSyncStore((state) => state.conflicts);
  const hasRemoteUpdates = useSyncStore((state) => state.hasRemoteUpdates);
  const triggerSync = useSyncStore((state) => state.triggerSync);
  const retryErrors = useSyncStore((state) => state.retryErrors);
  const resolveConflict = useSyncStore((state) => state.resolveConflict);

  const currentUser = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const visibleKBs = knowledgeBases.filter((kb) => kb.id !== MEMO_KB_ID);

  // Modal & Menu states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTargetKb, setDeleteTargetKb] = useState<KnowledgeBase | null>(null);
  const [isConflictOpen, setIsConflictOpen] = useState(false);

  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(null);
  const [syncPopoverAnchor, setSyncPopoverAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const checkRemoteStatus = () => {
      const sync = useSyncStore.getState();
      if (document.visibilityState === 'visible' && navigator.onLine && sync.status !== 'syncing') {
        void sync.checkRemoteUpdates().catch(() => {
          // A background status check must not replace the last known sync state.
        });
      }
    };

    checkRemoteStatus();
    const intervalId = window.setInterval(checkRemoteStatus, 45_000);
    document.addEventListener('visibilitychange', checkRemoteStatus);
    window.addEventListener('online', checkRemoteStatus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', checkRemoteStatus);
      window.removeEventListener('online', checkRemoteStatus);
    };
  }, []);

  // Rename states
  const [renamingKbId, setRenamingKbId] = useState<string | null>(null);
  const [renamingKbName, setRenamingKbName] = useState('');

  const handleSync = () => {
    useEditorStore.getState().flushPendingDocumentUpdate();
    void triggerSync();
  };

  const handleLogout = async () => {
    useEditorStore.getState().flushPendingDocumentUpdate();
    try {
      await flushAllDocumentAutosaves();
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout failed:', error);
      alert('退出登录失败，请检查网络后重试');
    }
  };

  // Dropdown states
  const [activeMenuKbId, setActiveMenuKbId] = useState<string | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);

  const handleStartRename = (id: string, name: string) => {
    setRenamingKbId(id);
    setRenamingKbName(name);
  };

  const handleFinishRename = () => {
    if (renamingKbId && renamingKbName.trim()) {
      updateKnowledgeBase(renamingKbId, { name: renamingKbName.trim() });
    }
    setRenamingKbId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetKb) return;
    try {
      const targetId = deleteTargetKb.id;
      await deleteKnowledgeBase(targetId);
      if (activeKbId === targetId) {
        navigate('/');
      }
      setDeleteTargetKb(null);
    } catch (err) {
      console.error('Delete knowledge base failed:', err);
      alert('删除知识库失败，请重试');
      throw err;
    }
  };

  return (
    <aside className="w-[220px] min-w-[220px] bg-bg-sidebar border-r border-border-color flex flex-col p-5 h-full">
      {/* Brand & User Zone */}
      <div
        className="flex items-center gap-2 mb-6 cursor-pointer hover:bg-hover-bg p-1.5 -mx-1.5 rounded-lg transition-colors shrink-0"
        onClick={(e) => setUserMenuAnchor(e.currentTarget)}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-xs font-bold text-accent shadow-sm border border-indigo-100/50">
          {(currentUser?.display_name || currentUser?.username || 'D').slice(0, 1).toUpperCase()}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="font-semibold text-[13px] text-text-primary truncate">
            {currentUser?.display_name || currentUser?.username || 'DuetDoc User'}
          </div>
          <div className="text-[11px] text-text-secondary truncate">
            {currentUser?.username ? `@${currentUser.username}` : 'DuetDoc'}
          </div>
        </div>
      </div>

      {/* Search Box */}
      <div className="flex items-center justify-between bg-bg-main border border-transparent px-3 py-2 rounded-lg text-[13px] text-text-secondary mb-6 cursor-text hover:border-border-color transition-colors shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <Search size={14} />
          <span className="truncate w-[90px]">搜索知识库...</span>
        </div>
        <span className="bg-bg-main px-1.5 py-0.5 rounded border border-border-color text-[11px] shadow-sm">
          ⌘K
        </span>
      </div>

      {/* Nav Menu */}
      <ul className="list-none mb-6 space-y-1 shrink-0">
        <li>
          <NavLink
            to="/"
            end
            tabIndex={-1}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-indigo-50 text-accent' : 'text-text-secondary hover:bg-hover-bg'}`
            }
          >
            <Home size={16} /> 开始
          </NavLink>
        </li>
        <li>
          <NavLink
            to={lastVisitedSessionId ? `/ai-writing/${lastVisitedSessionId}` : '/ai-writing'}
            tabIndex={-1}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-indigo-50 text-accent' : 'text-text-secondary hover:bg-hover-bg'}`
            }
          >
            {({ isActive }) => (
              <>
                <Sparkles size={16} className={isActive ? 'text-accent' : ''} /> Duet 助手
              </>
            )}
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/memo"
            tabIndex={-1}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-indigo-50 text-accent' : 'text-text-secondary hover:bg-hover-bg'}`
            }
          >
            <StickyNote size={16} /> 小记
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/favorites"
            tabIndex={-1}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-indigo-50 text-accent' : 'text-text-secondary hover:bg-hover-bg'}`
            }
          >
            {({ isActive }) => (
              <>
                <Star size={16} className={isActive ? 'text-yellow-400 fill-yellow-400' : ''} />{' '}
                收藏
              </>
            )}
          </NavLink>
        </li>
      </ul>

      {/* Doc Tree */}
      <div className="flex items-center justify-between mb-3 pl-3 pr-1 shrink-0 select-none">
        <span className="text-[12px] text-text-secondary font-semibold tracking-wide">
          知识库列表
        </span>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="text-text-secondary hover:text-text-primary p-0.5 hover:bg-hover-bg rounded transition-colors cursor-pointer flex font-medium"
          title="新建知识库"
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto -mx-2 px-2">
        <ul className="list-none text-[13px] text-text-secondary space-y-1">
          {visibleKBs.map((kb) => {
            const isActiveKb = activeKbId === kb.id;
            const isRenaming = renamingKbId === kb.id;

            return (
              <li key={kb.id} className="space-y-0.5 group/row">
                <div
                  className={`flex items-center justify-between rounded-md transition-colors ${
                    isActiveKb ? 'bg-indigo-50/80' : 'hover:bg-hover-bg'
                  } ${activeMenuKbId === kb.id ? 'bg-hover-bg' : ''}`}
                >
                  {isRenaming ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 w-full">
                      <Folder size={14} className="shrink-0" style={{ color: kb.icon }} />
                      <input
                        type="text"
                        value={renamingKbName}
                        onChange={(e) => setRenamingKbName(e.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleFinishRename();
                          else if (e.key === 'Escape') setRenamingKbId(null);
                        }}
                        className="w-full text-xs font-semibold text-text-primary bg-bg-main px-1.5 py-0.5 border border-border-color rounded outline-none focus:border-accent"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  ) : (
                    <>
                      <NavLink
                        to={`/kb/${kb.id}`}
                        onClick={() => {
                          setIsCatalogCollapsed(false);
                        }}
                        className={`flex items-center gap-2.5 truncate flex-1 px-3 py-2 min-w-0 ${
                          isActiveKb
                            ? 'text-accent font-semibold'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <Folder
                          size={14}
                          className="shrink-0 transition-colors"
                          style={{ color: kb.icon }}
                        />
                        <span className="truncate">{kb.name}</span>
                      </NavLink>

                      {/* Dot menu on hover */}
                      <div
                        className="flex items-center opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 mr-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => {
                            setSelectedKb(kb);
                            setActiveMenuKbId(activeMenuKbId === kb.id ? null : kb.id);
                            setMenuAnchorEl(activeMenuKbId === kb.id ? null : e.currentTarget);
                          }}
                          className={`text-text-secondary hover:text-text-primary hover:bg-black/5 p-1 rounded transition-colors flex cursor-pointer ${
                            activeMenuKbId === kb.id ? 'opacity-100 bg-black/5' : ''
                          }`}
                          title="更多操作"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Modals */}
      <CreateKnowledgeBaseModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />

      <ConfirmDeleteModal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setDeleteTargetKb(null);
        }}
        onConfirm={handleConfirmDelete}
        title="确认删除知识库"
        description={
          deleteTargetKb ? (
            <span>
              此操作将永久删除知识库
              <strong className="text-text-primary mx-1">“{deleteTargetKb.name}”</strong>
              以及该知识库下的所有文档与分组。该操作不可撤销，是否确认删除？
            </span>
          ) : (
            ''
          )
        }
      />

      {/* Action Menu */}
      <KbActionMenu
        isOpen={activeMenuKbId !== null}
        onClose={() => {
          setActiveMenuKbId(null);
          setMenuAnchorEl(null);
        }}
        onRename={() => {
          if (selectedKb) {
            handleStartRename(selectedKb.id, selectedKb.name);
          }
        }}
        onDelete={() => {
          if (selectedKb) {
            setDeleteTargetKb(selectedKb);
            setIsDeleteOpen(true);
          }
        }}
        anchorEl={menuAnchorEl}
      />

      <div className="mt-auto shrink-0 pt-3">
        <button
          onClick={(e) => setSyncPopoverAnchor(e.currentTarget)}
          className="flex items-center justify-center p-2 rounded-lg hover:bg-hover-bg transition-colors cursor-pointer"
          title="同步状态"
        >
          {syncStatus === 'syncing' ? (
            <Loader2 size={16} className="animate-spin text-accent" />
          ) : syncStatus === 'offline' ? (
            <CloudOff size={16} className="text-text-secondary" />
          ) : conflicts.length > 0 || errorCount > 0 || syncStatus === 'error' ? (
            <AlertCircle size={16} className="text-red-500" />
          ) : hasRemoteUpdates ? (
            <CloudDownload size={16} className="text-accent" />
          ) : pendingCount > 0 ? (
            <CloudUpload size={16} className="text-amber-500" />
          ) : (
            <CheckCircle2 size={16} className="text-emerald-500" />
          )}
        </button>
      </div>

      <UserActionMenu
        isOpen={userMenuAnchor !== null}
        onClose={() => setUserMenuAnchor(null)}
        onLogout={() => void handleLogout()}
        anchorEl={userMenuAnchor}
      />

      <SyncStatusPopover
        isOpen={syncPopoverAnchor !== null}
        onClose={() => setSyncPopoverAnchor(null)}
        anchorEl={syncPopoverAnchor}
        syncStatus={syncStatus}
        pendingCount={pendingCount}
        errorCount={errorCount}
        lastSyncAt={lastSyncAt}
        errorMessage={errorMessage}
        conflictsCount={conflicts.length}
        hasRemoteUpdates={hasRemoteUpdates}
        onRetry={() => void retryErrors()}
        onSync={handleSync}
        onOpenConflicts={() => {
          setSyncPopoverAnchor(null);
          setIsConflictOpen(true);
        }}
      />

      <SyncConflictModal
        conflict={isConflictOpen ? (conflicts[0] ?? null) : null}
        remainingCount={conflicts.length}
        onClose={() => setIsConflictOpen(false)}
        onResolve={(resolution) => resolveConflict(conflicts[0], resolution)}
      />
    </aside>
  );
}
