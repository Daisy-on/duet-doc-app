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
} from 'lucide-react';
import { useFavoritesStore, FOLDER_ALL_ID } from '../store/favoritesStore';
import { useKnowledgeBaseStore, MEMO_KB_ID } from '../store/knowledgeBaseStore';

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
      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border cursor-pointer transition-all select-none ${
        isSelected
          ? 'border-accent bg-indigo-50 shadow-sm'
          : 'border-transparent hover:border-border-color hover:bg-white'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Star
          size={13}
          className={`shrink-0 transition-colors ${
            isSelected ? 'text-yellow-400 fill-yellow-400' : 'text-text-secondary'
          }`}
        />
        <span
          className={`text-xs font-medium truncate ${
            isSelected ? 'text-accent' : 'text-text-primary'
          }`}
        >
          {name}
        </span>
      </div>

      {/* Actions (rename / delete) — only on non-system folders when hovered */}
      {!isSystem && hovered ? (
        <div
          className="flex items-center gap-1 shrink-0 ml-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onRename}
            title="重命名"
            className="p-0.5 text-text-secondary hover:text-text-primary rounded transition-colors cursor-pointer"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={onDelete}
            title="删除收藏夹"
            className="p-0.5 text-text-secondary hover:text-red-500 rounded transition-colors cursor-pointer"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ) : (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-semibold ${
            isSelected ? 'bg-indigo-100 text-accent' : 'bg-gray-100 text-text-secondary'
          }`}
        >
          {count}
        </span>
      )}
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

  const { folders, items, createFolder, renameFolder, deleteFolder, getItemsByFolder } =
    useFavoritesStore();
  const { documents, knowledgeBases, groups } = useKnowledgeBaseStore();

  const [selectedFolderId, setSelectedFolderId] = useState<string>(FOLDER_ALL_ID);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

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

  const formatTime = (ts: number) => {
    const now = Date.now();
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

  const handleDeleteFolder = (id: string) => {
    deleteFolder(id);
    if (selectedFolderId === id) setSelectedFolderId(FOLDER_ALL_ID);
  };

  // ── New folder create ──────────────────────────────────────────────────────

  const handleCreateFolder = () => {
    if (newFolderName.trim()) createFolder(newFolderName.trim());
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── Left panel — folder list ────────────────────────────────────────── */}
      <aside className="w-[240px] min-w-[240px] bg-bg-panel border-r border-border-color flex flex-col h-full">
        {/* Panel header */}
        <div className="px-5 py-4 shrink-0 border-b border-border-color">
          <h2 className="text-[14px] font-bold text-text-primary flex items-center gap-2">
            <Star size={15} className="text-yellow-400 fill-yellow-400" />
            我的收藏
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
          {userFolders.length > 0 && (
            <p className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider px-2 pt-3 pb-1">
              我的分组
            </p>
          )}

          {/* User folders */}
          {userFolders.map((folder) => {
            const count = getItemsByFolder(folder.id).length;

            // Inline rename input
            if (editingFolderId === folder.id) {
              return (
                <div
                  key={folder.id}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-accent rounded-xl"
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
                  <button
                    onClick={confirmRename}
                    className="text-accent cursor-pointer shrink-0"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={() => setEditingFolderId(null)}
                    className="text-text-secondary cursor-pointer shrink-0"
                  >
                    <X size={12} />
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
                onDelete={() => handleDeleteFolder(folder.id)}
              />
            );
          })}

          {/* Inline new-folder creation */}
          {isCreatingFolder ? (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-accent rounded-xl">
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
                placeholder="输入分组名称"
                className="flex-1 text-xs outline-none bg-transparent text-text-primary placeholder-text-ghost"
              />
              <button
                onClick={handleCreateFolder}
                className="text-accent cursor-pointer shrink-0"
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => {
                  setIsCreatingFolder(false);
                  setNewFolderName('');
                }}
                className="text-text-secondary cursor-pointer shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-hover-bg rounded-xl transition-colors cursor-pointer"
            >
              <BookmarkPlus size={13} />
              新建收藏夹
            </button>
          )}
        </div>
      </aside>

      {/* ── Right panel — document list ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-main">
        {/* Header */}
        <header className="h-[60px] border-b border-border-color flex items-center px-6 shrink-0 bg-white gap-3">
          <Star size={16} className="text-yellow-400 fill-yellow-400 shrink-0" />
          <h1 className="text-[15px] font-bold text-text-primary truncate">
            {folders.find((f) => f.id === selectedFolderId)?.name ?? '收藏'}
          </h1>
          <span className="text-[11px] text-text-secondary bg-gray-100 px-2 py-0.5 rounded-full font-semibold shrink-0">
            {selectedItems.length} 篇
          </span>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedItems.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-w-4xl mx-auto px-6 py-5">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_180px_130px] gap-4 px-4 py-2 text-[11px] font-bold text-text-secondary uppercase tracking-wider border-b border-border-color mb-1">
                <span>名称</span>
                <span>归属知识库</span>
                <span>收藏时间</span>
              </div>

              {/* Table rows */}
              {selectedItems.map((item) => {
                const info = getDocInfo(item.docId);

                // Deleted / orphan item
                if (!info) {
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[1fr_180px_130px] gap-4 px-4 py-3 rounded-xl text-xs text-text-ghost italic"
                    >
                      <span className="flex items-center gap-2">
                        <FileText size={14} className="text-gray-300 shrink-0" />
                        文档已删除
                      </span>
                      <span>—</span>
                      <span>{formatTime(item.favoritedAt)}</span>
                    </div>
                  );
                }

                const { doc, kb, group } = info;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleDocClick(item.docId)}
                    className="w-full grid grid-cols-[1fr_180px_130px] gap-4 px-4 py-3 rounded-xl hover:bg-hover-bg transition-colors group text-left cursor-pointer"
                  >
                    {/* Title */}
                    <span className="flex items-center gap-2.5 min-w-0">
                      <FileText
                        size={14}
                        className="text-accent shrink-0 group-hover:text-indigo-600 transition-colors"
                      />
                      <span className="text-xs font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                        {doc.title}
                      </span>
                      <ArrowUpRight
                        size={12}
                        className="text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      />
                    </span>

                    {/* KB / Group breadcrumb */}
                    <span className="text-xs text-text-secondary truncate self-center">
                      {kb?.name ?? '—'}
                      {group ? ` / ${group.name}` : ''}
                    </span>

                    {/* Favorited time */}
                    <span className="text-xs text-text-secondary self-center">
                      {formatTime(item.favoritedAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
