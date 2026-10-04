import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Star,
  BookmarkPlus,
  Trash2,
  Pencil,
  Check,
  X,
  FileText,
  ArrowUpRight,
  BookOpen,
  MoreHorizontal,
} from 'lucide-react';
import { useFavoritesStore, FOLDER_ALL_ID } from '../store/favoritesStore';
import { useKnowledgeBaseStore, MEMO_KB_ID } from '../store/knowledgeBaseStore';
import FavoriteItemMenu from '../components/modals/FavoriteItemMenu';
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal';

// ── FolderCard (left panel item) ─────────────────────────────────────────────

interface FolderCardProps {
  id: string;
  name: string;
  count: number;
  isSelected: boolean;
  isSystem?: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

function FolderCard({
  name,
  count,
  isSelected,
  isSystem = false,
  onClick,
  onRename,
  onDelete,
}: FolderCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex items-center justify-between px-3 h-[38px] rounded-lg border cursor-pointer select-none transition-colors ${
        isSelected
          ? 'bg-bg-main shadow-xs border-border-color/40 text-text-primary font-semibold'
          : 'border-transparent text-text-secondary hover:bg-hover-bg/70'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Star
          size={14}
          className={`shrink-0 transition-colors ${
            isSelected ? 'text-yellow-400 fill-yellow-400' : 'text-text-secondary'
          }`}
        />
        <span className="text-[13px] truncate">{name}</span>
      </div>

      {/* Actions (rename / delete) — only on non-system folders when hovered */}
      <div className="h-5 flex items-center justify-end shrink-0 ml-1">
        {!isSystem && hovered ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onRename}
              title="重命名"
              className="p-1 text-text-secondary hover:text-text-primary hover:bg-black/5 rounded transition-colors cursor-pointer"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              title="删除收藏夹"
              className="p-1 text-text-secondary hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold transition-colors ${
              isSelected ? 'bg-hover-bg text-text-primary' : 'bg-hover-bg/70 text-text-secondary'
            }`}
          >
            {count}
          </span>
        )}
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full pt-16 select-none">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-200 to-amber-300 flex items-center justify-center shadow-lg mb-5">
        <BookOpen size={28} className="text-white" />
      </div>
      <h3 className="text-sm font-bold text-text-primary mb-2">此收藏夹暂无内容</h3>
      <p className="text-xs text-text-secondary text-center max-w-[240px] leading-relaxed">
        在文档编辑页点击右上角的 ☆ 星形图标，即可快速收藏到该分组
      </p>
    </div>
  );
}

// ── Favorites (main page) ─────────────────────────────────────────────────────

export default function Favorites() {
  const navigate = useNavigate();

  const {
    folders,
    items,
    createFolder,
    renameFolder,
    deleteFolder,
    getItemsByFolder,
    removeFavorite,
  } = useFavoritesStore();
  const { documents, knowledgeBases, groups } = useKnowledgeBaseStore();

  const [now] = useState(() => Date.now());
  const [selectedFolderId, setSelectedFolderId] = useState<string>(FOLDER_ALL_ID);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);

  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const allFolder = folders.find((f) => f.id === FOLDER_ALL_ID);
  const userFolders = folders.filter((f) => f.id !== FOLDER_ALL_ID);
  const selectedItems = getItemsByFolder(selectedFolderId);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getDocInfo = (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return null;
    const kb = knowledgeBases.find((kb) => kb.id === doc.kbId);
    const group = doc.groupId ? groups.find((g) => g.id === doc.groupId) : null;
    return { doc, kb, group };
  };

  const handleDocClick = (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;
    if (doc.kbId === MEMO_KB_ID) {
      navigate(`/memo/${docId}`);
    } else {
      navigate(`/kb/${doc.kbId}/doc/${docId}`);
    }
  };

  const formatTime = (ts: number, now: number) => {
    const diff = now - ts;
    if (diff < 1000 * 60 * 60 * 24) {
      return '今天 ' + new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  };

  // ── Folder rename ──────────────────────────────────────────────────────────

  const startRename = (id: string, currentName: string) => {
    setEditingFolderId(id);
    setEditingName(currentName);
  };

  const confirmRename = () => {
    if (editingFolderId && editingName.trim()) {
      renameFolder(editingFolderId, editingName.trim());
    }
    setEditingFolderId(null);
    setEditingName('');
  };

  // ── Folder delete ──────────────────────────────────────────────────────────

  const handleConfirmDeleteFolder = () => {
    if (!folderToDelete) return;
    deleteFolder(folderToDelete.id);
    if (selectedFolderId === folderToDelete.id) setSelectedFolderId(FOLDER_ALL_ID);
    setFolderToDelete(null);
  };

  // ── New folder create ──────────────────────────────────────────────────────

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      const newId = createFolder(newFolderName.trim());
      setSelectedFolderId(newId);
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── Left panel — folder list ────────────────────────────────────────── */}
      <aside className="w-[240px] min-w-[240px] bg-bg-panel border-r border-border-color flex flex-col h-full">
        {/* Panel header */}
        <div className="h-[60px] flex items-center px-5 shrink-0">
          <h2 className="text-[14px] font-bold text-text-primary flex items-center gap-2">
            <Star size={15} className="text-yellow-400 fill-yellow-400" />
            我的收藏夹
          </h2>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {/* 全部收藏 */}
          {allFolder && (
            <FolderCard
              id={allFolder.id}
              name={allFolder.name}
              count={items.length}
              isSelected={selectedFolderId === allFolder.id}
              isSystem
              onClick={() => setSelectedFolderId(allFolder.id)}
            />
          )}

          {/* Section label */}
          <p className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider px-2 pt-3 pb-1">
            我的收藏夹
          </p>

          {/* Inline new-folder creation / New folder button */}
          {isCreatingFolder ? (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-bg-main border border-accent rounded-lg">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') {
                    setIsCreatingFolder(false);
                    setNewFolderName('');
                  }
                }}
                placeholder="输入收藏夹名称"
                className="flex-1 text-xs outline-none bg-transparent text-text-primary placeholder-text-ghost"
              />
              <button onClick={handleCreateFolder} className="text-accent cursor-pointer shrink-0">
                <Check size={13} />
              </button>
              <button
                onClick={() => {
                  setIsCreatingFolder(false);
                  setNewFolderName('');
                }}
                className="text-text-secondary cursor-pointer shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-hover-bg rounded-lg transition-colors cursor-pointer"
            >
              <BookmarkPlus size={13} />
              新建收藏夹
            </button>
          )}

          {/* User folders */}
          {userFolders.map((folder) => {
            const count = getItemsByFolder(folder.id).length;

            // Inline rename input
            if (editingFolderId === folder.id) {
              return (
                <div
                  key={folder.id}
                  className="flex items-center gap-1.5 px-3 py-2 bg-bg-main border border-accent rounded-lg"
                >
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename();
                      if (e.key === 'Escape') setEditingFolderId(null);
                    }}
                    className="flex-1 text-xs outline-none bg-transparent text-text-primary"
                  />
                  <button onClick={confirmRename} className="text-accent cursor-pointer shrink-0">
                    <Check size={13} />
                  </button>
                  <button
                    onClick={() => setEditingFolderId(null)}
                    className="text-text-secondary cursor-pointer shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            }

            return (
              <FolderCard
                key={folder.id}
                id={folder.id}
                name={folder.name}
                count={count}
                isSelected={selectedFolderId === folder.id}
                onClick={() => setSelectedFolderId(folder.id)}
                onRename={() => startRename(folder.id, folder.name)}
                onDelete={() => setFolderToDelete({ id: folder.id, name: folder.name })}
              />
            );
          })}
        </div>
      </aside>

      {/* ── Right panel — document list ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-main">
        {/* Header */}
        <header className="h-[60px] flex items-center px-6 shrink-0 bg-bg-main gap-3">
          <Star size={16} className="text-yellow-400 fill-yellow-400 shrink-0" />
          <h1 className="text-[15px] font-bold text-text-primary truncate">
            {folders.find((f) => f.id === selectedFolderId)?.name ?? '收藏'}
          </h1>
          <span className="text-[11px] text-text-secondary bg-hover-bg px-2 py-0.5 rounded-full font-semibold shrink-0">
            {selectedItems.length} 篇
          </span>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedItems.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-w-5xl mx-auto px-8 py-6">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_220px_160px_44px] gap-4 px-5 py-3 text-sm font-semibold text-text-secondary border-b border-border-color mb-1.5">
                <span>名称</span>
                <span>归属知识库</span>
                <span>收藏时间</span>
                <span></span>
              </div>

              {/* Table rows */}
              {selectedItems.map((item) => {
                const info = getDocInfo(item.docId);

                // Deleted / orphan item
                if (!info) {
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[1fr_220px_160px_44px] gap-4 px-5 py-3.5 rounded-xl text-sm text-text-ghost italic items-center"
                    >
                      <span className="flex items-center gap-3">
                        <FileText size={16} className="text-gray-300 shrink-0" />
                        文档已删除
                      </span>
                      <span>—</span>
                      <span>{formatTime(item.favoritedAt, now)}</span>
                      <div className="flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFavorite(item.docId);
                          }}
                          title="移除收藏"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                }

                const { doc, kb, group } = info;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleDocClick(item.docId)}
                    className="w-full grid grid-cols-[1fr_220px_160px_44px] gap-4 px-5 py-3.5 rounded-xl hover:bg-hover-bg transition-colors group text-left cursor-pointer items-center"
                  >
                    {/* Title */}
                    <span className="flex items-center gap-3 min-w-0">
                      <FileText
                        size={16}
                        className="text-accent shrink-0 group-hover:text-indigo-600 transition-colors"
                      />
                      <span className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                        {doc.title}
                      </span>
                      <ArrowUpRight
                        size={14}
                        className="text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      />
                    </span>

                    {/* KB / Group breadcrumb */}
                    <span className="text-sm text-text-secondary truncate">
                      {kb?.name ?? '—'}
                      {group ? ` / ${group.name}` : ''}
                    </span>

                    {/* Favorited time */}
                    <span className="text-sm text-text-secondary">
                      {formatTime(item.favoritedAt, now)}
                    </span>

                    {/* Action dropdown trigger */}
                    <div className="flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDocId(item.docId);
                          setMenuAnchorEl(e.currentTarget);
                        }}
                        className={`p-1.5 rounded-lg hover:bg-gray-200 text-text-secondary hover:text-text-primary transition-colors cursor-pointer ${
                          activeDocId === item.docId
                            ? 'opacity-100 bg-gray-200'
                            : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Popover Menu */}
      {activeDocId && (
        <FavoriteItemMenu
          key={activeDocId}
          docId={activeDocId}
          isOpen={Boolean(activeDocId)}
          onClose={() => {
            setActiveDocId(null);
            setMenuAnchorEl(null);
          }}
          anchorEl={menuAnchorEl}
        />
      )}

      {/* Folder delete confirmation modal */}
      <ConfirmDeleteModal
        isOpen={folderToDelete !== null}
        onClose={() => setFolderToDelete(null)}
        onConfirm={handleConfirmDeleteFolder}
        title="删除收藏夹"
        description={
          folderToDelete ? (
            <span>
              确定要删除收藏夹
              <strong className="text-text-primary mx-1">“{folderToDelete.name}”</strong>
              吗？该操作不可撤销，收藏夹内的文档仍将保留在“全部收藏”中。
            </span>
          ) : (
            ''
          )
        }
      />
    </div>
  );
}
