import { useState } from 'react';
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
  CloudOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { useKnowledgeBaseStore, MEMO_KB_ID, type KnowledgeBase } from '../store/knowledgeBaseStore';
import { useAIWritingStore } from '../store/aiWritingStore';
import { useLayoutStore } from '../store';
import { useSyncStore } from '../store/syncStore';
import CreateKnowledgeBaseModal from './modals/CreateKnowledgeBaseModal';
import ConfirmDeleteModal from './modals/ConfirmDeleteModal';
import KbActionMenu from './menus/KbActionMenu';

export default function Sidebar() {
  const { kbId: activeKbId } = useParams<{ kbId?: string }>();
  const navigate = useNavigate();
  const lastVisitedSessionId = useAIWritingStore((state) => state.lastVisitedSessionId);
  const knowledgeBases = useKnowledgeBaseStore((state) => state.knowledgeBases);
  const updateKnowledgeBase = useKnowledgeBaseStore((state) => state.updateKnowledgeBase);
  const deleteKnowledgeBase = useKnowledgeBaseStore((state) => state.deleteKnowledgeBase);
  const setIsCatalogCollapsed = useLayoutStore((state) => state.setIsCatalogCollapsed);

  const syncStatus = useSyncStore((state) => state.status);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const errorCount = useSyncStore((state) => state.errorCount);
  const lastSyncAt = useSyncStore((state) => state.lastSyncAt);
  const errorMessage = useSyncStore((state) => state.errorMessage);
  const triggerPush = useSyncStore((state) => state.triggerPush);
  const retryErrors = useSyncStore((state) => state.retryErrors);

  const visibleKBs = knowledgeBases.filter((kb) => kb.id !== MEMO_KB_ID);

  // Modal & Menu states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTargetKb, setDeleteTargetKb] = useState<KnowledgeBase | null>(null);

  // Rename states
  const [renamingKbId, setRenamingKbId] = useState<string | null>(null);
  const [renamingKbName, setRenamingKbName] = useState('');

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
      <div className="flex items-center gap-3 mb-6 cursor-pointer shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-200 to-pink-200 shadow-sm" />
        <div className="font-bold text-[16px] text-text-primary">DuetDoc</div>
      </div>

      {/* Search Box */}
      <div className="flex items-center justify-between bg-bg-main border border-transparent px-3 py-2 rounded-lg text-[13px] text-text-secondary mb-6 cursor-text hover:border-border-color transition-colors shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <Search size={14} />
          <span className="truncate w-[90px]">搜索知识库...</span>
        </div>
        <span className="bg-white px-1.5 py-0.5 rounded border border-border-color text-[11px] shadow-sm">
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
                        className="w-full text-xs font-semibold text-text-primary bg-white px-1.5 py-0.5 border border-border-color rounded outline-none focus:border-accent"
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

      {/* Cloud Sync Footer */}
      <div className="pt-3 mt-auto border-t border-border-color shrink-0">
        <div className="flex items-center justify-between text-[12px] text-text-secondary mb-1.5 px-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {syncStatus === 'syncing' ? (
              <Loader2 size={13} className="animate-spin text-accent shrink-0" />
            ) : syncStatus === 'offline' ? (
              <CloudOff size={13} className="text-text-secondary shrink-0" />
            ) : errorCount > 0 || syncStatus === 'error' ? (
              <AlertCircle size={13} className="text-red-500 shrink-0" />
            ) : pendingCount > 0 ? (
              <CloudUpload size={13} className="text-amber-500 shrink-0" />
            ) : (
              <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
            )}
            <span className="font-medium truncate">
              {syncStatus === 'syncing'
                ? '正在上传...'
                : syncStatus === 'offline'
                  ? '云端暂不可用'
                  : errorCount > 0
                    ? `同步异常 (${errorCount} 项失败)`
                    : syncStatus === 'error'
                      ? '同步异常'
                      : pendingCount > 0
                        ? `待上传 (${pendingCount})`
                        : '云端已对齐'}
            </span>
          </div>
          {errorCount > 0 ? (
            <button
              onClick={() => void retryErrors()}
              disabled={syncStatus === 'syncing'}
              className="px-2 py-0.5 rounded text-[11px] font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50 cursor-pointer shadow-xs shrink-0"
              title="重新尝试失败的同步任务"
            >
              {syncStatus === 'syncing' ? '同步中' : '重试'}
            </button>
          ) : (
            <button
              onClick={() => void triggerPush()}
              disabled={syncStatus === 'syncing'}
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-bg-main hover:bg-hover-bg border border-border-color transition-colors disabled:opacity-50 cursor-pointer shadow-xs shrink-0"
              title="立即将本地修改推送到 PostgreSQL"
            >
              {syncStatus === 'syncing' ? '同步中' : '立即上传'}
            </button>
          )}
        </div>
        {errorMessage && (
          <div className="text-[11px] text-red-500 truncate px-1" title={errorMessage}>
            {errorMessage}
          </div>
        )}
        {lastSyncAt && !errorMessage && errorCount === 0 && (
          <div className="text-[10px] text-text-secondary/70 px-1 truncate">
            上次上传: {new Date(lastSyncAt).toLocaleTimeString()}
          </div>
        )}
      </div>
    </aside>
  );
}
