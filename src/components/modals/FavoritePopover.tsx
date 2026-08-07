import { useEffect, useRef, useState } from 'react';
import { Star, Check, Plus, X } from 'lucide-react';
import { useFavoritesStore, FOLDER_ALL_ID } from '../../store/favoritesStore';

interface FavoritePopoverProps {
  docId: string;
  isOpen: boolean;
  onClose: () => void;
  /** The button element that triggered the popover — used to calculate position */
  anchorEl: HTMLElement | null;
}

export default function FavoritePopover({
  docId,
  isOpen,
  onClose,
  anchorEl,
}: FavoritePopoverProps) {
  const {
    folders,
    isFavorited,
    getFolderIds,
    removeFavorite,
    addToFolder,
    removeFromFolder,
    createFolder,
  } = useFavoritesStore();

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const favorited = isFavorited(docId);
  const activeFolderIds = getFolderIds(docId);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorEl &&
        !anchorEl.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, anchorEl, onClose]);

  // Auto-focus the new-folder input
  useEffect(() => {
    if (isCreatingFolder) {
      newFolderInputRef.current?.focus();
    }
  }, [isCreatingFolder]);

  if (!isOpen) return null;

  // ── Position relative to anchor ───────────────────────────────────────────
  let posTop = 68;
  let posRight = 16;
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    posTop = rect.bottom + 8;
    posRight = window.innerWidth - rect.right;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleFolder = (folderId: string) => {
    if (folderId === FOLDER_ALL_ID) return; // system folder – always checked
    if (activeFolderIds.includes(folderId)) {
      removeFromFolder(docId, folderId);
    } else {
      addToFolder(docId, folderId);
    }
  };

  const handleUnfavorite = () => {
    removeFavorite(docId);
    onClose();
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      const newId = createFolder(trimmed);
      addToFolder(docId, newId);
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const nonAllFolders = folders.filter((f) => f.id !== FOLDER_ALL_ID);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: posTop, right: posRight, zIndex: 9999, width: 232 }}
      className="bg-white border border-border-color rounded-xl shadow-2xl py-3 animate-dropdown-fade-in"
    >
      {/* Header row */}
      <div className="px-3 mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-text-primary">
          {favorited ? '已收藏' : '选择分组'}
        </span>
        {favorited && (
          <button
            onClick={handleUnfavorite}
            className="text-[11px] text-red-400 hover:text-red-600 transition-colors cursor-pointer font-medium"
          >
            取消收藏
          </button>
        )}
      </div>

      {/* Folder list */}
      <div className="max-h-[200px] overflow-y-auto px-2 space-y-0.5">
        {/* "全部收藏" — always checked, non-toggleable */}
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
          <div className="w-4 h-4 rounded border-2 border-accent bg-accent flex items-center justify-center shrink-0">
            <Check size={10} className="text-white" />
          </div>
          <span className="text-xs text-text-primary flex-1 truncate">全部收藏</span>
          <Star size={12} className="text-yellow-400 fill-yellow-400 shrink-0" />
        </div>

        {/* User-defined folders */}
        {nonAllFolders.map((folder) => {
          const isInFolder = activeFolderIds.includes(folder.id);
          return (
            <button
              key={folder.id}
              onClick={() => handleToggleFolder(folder.id)}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-hover-bg transition-colors cursor-pointer text-left"
            >
              <div
                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isInFolder ? 'border-accent bg-accent' : 'border-gray-300 bg-white'
                }`}
              >
                {isInFolder && <Check size={10} className="text-white" />}
              </div>
              <span className="text-xs text-text-primary flex-1 truncate">{folder.name}</span>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="mx-3 my-2 border-t border-border-color" />

      {/* New folder creation */}
      {isCreatingFolder ? (
        <div className="px-3 flex items-center gap-2">
          <input
            ref={newFolderInputRef}
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
            className="flex-1 text-xs border border-border-color rounded-lg px-2.5 py-1.5 outline-none focus:border-accent transition-colors"
          />
          <button
            onClick={handleCreateFolder}
            className="text-xs text-accent font-semibold cursor-pointer hover:underline shrink-0"
          >
            确定
          </button>
          <button
            onClick={() => {
              setIsCreatingFolder(false);
              setNewFolderName('');
            }}
            className="text-text-secondary cursor-pointer hover:text-text-primary transition-colors shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsCreatingFolder(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-hover-bg rounded-lg transition-colors cursor-pointer"
        >
          <Plus size={13} />
          新建分组
        </button>
      )}
    </div>
  );
}
