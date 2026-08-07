import { useEffect, useRef, useState } from 'react';
import { Trash2, FolderInput, Check, Plus, X, ChevronLeft } from 'lucide-react';
import { useFavoritesStore, FOLDER_ALL_ID } from '../../store/favoritesStore';

interface FavoriteItemMenuProps {
  docId: string;
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}

export default function FavoriteItemMenu({
  docId,
  isOpen,
  onClose,
  anchorEl,
}: FavoriteItemMenuProps) {
  const { folders, getFolderIds, removeFavorite, addToFolder, removeFromFolder, createFolder } =
    useFavoritesStore();

  const [view, setView] = useState<'main' | 'move'>('main');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const popoverRef = useRef<HTMLDivElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

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

  // Focus new folder input
  useEffect(() => {
    if (isCreatingFolder) {
      newFolderInputRef.current?.focus();
    }
  }, [isCreatingFolder]);

  if (!isOpen) return null;

  // Position calculation relative to viewport (fixed)
  let posTop = 0;
  let posLeft = 0;
  const menuWidth = view === 'main' ? 140 : 200;

  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    posTop = rect.bottom + 6;
    posLeft = rect.right - menuWidth;

    // Safety check for viewport bounds
    if (posLeft < 10) posLeft = 10;
    if (posTop + 240 > window.innerHeight) {
      // Show above if it exceeds viewport bottom
      posTop = rect.top - 6 - (view === 'main' ? 80 : 220);
    }
  }

  const handleToggleFolder = (folderId: string) => {
    if (folderId === FOLDER_ALL_ID) return;
    if (activeFolderIds.includes(folderId)) {
      removeFromFolder(docId, folderId);
    } else {
      addToFolder(docId, folderId);
    }
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

  const handleUnfavorite = () => {
    removeFavorite(docId);
    onClose();
  };

  const nonAllFolders = folders.filter((f) => f.id !== FOLDER_ALL_ID);

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: posTop,
        left: posLeft,
        zIndex: 9999,
        width: menuWidth,
      }}
      className="bg-white border border-border-color rounded-xl shadow-2xl py-1.5 animate-dropdown-fade-in text-xs"
    >
      {view === 'main' ? (
        <div className="flex flex-col">
          <button
            onClick={() => setView('move')}
            className="flex items-center gap-2 px-3 py-2 text-text-primary hover:bg-hover-bg transition-colors cursor-pointer text-left w-full font-medium"
          >
            <FolderInput size={13} className="text-text-secondary" />
            移动收藏夹
          </button>

          <div className="border-t border-border-color my-1" />

          <button
            onClick={handleUnfavorite}
            className="flex items-center gap-2 px-3 py-2 text-red-500 hover:bg-red-50 transition-colors cursor-pointer text-left w-full font-medium"
          >
            <Trash2 size={13} className="text-red-400" />
            取消收藏
          </button>
        </div>
      ) : (
        <div>
          {/* Header */}
          <div className="px-2 pb-1.5 mb-1.5 border-b border-border-color flex items-center gap-1">
            <button
              onClick={() => setView('main')}
              className="p-1 rounded hover:bg-hover-bg text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="font-bold text-text-primary flex-1 truncate">选择收藏夹</span>
          </div>

          {/* Folder List */}
          <div className="max-h-[160px] overflow-y-auto px-1 space-y-0.5">
            {/* 全部收藏 */}
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg opacity-70">
              <div className="w-3.5 h-3.5 rounded border border-accent bg-accent flex items-center justify-center shrink-0">
                <Check size={9} className="text-white" />
              </div>
              <span className="text-[11px] text-text-primary flex-1 truncate font-medium">
                全部收藏
              </span>
            </div>

            {/* Custom Folders */}
            {nonAllFolders.map((folder) => {
              const isChecked = activeFolderIds.includes(folder.id);
              return (
                <button
                  key={folder.id}
                  onClick={() => handleToggleFolder(folder.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-hover-bg transition-colors cursor-pointer text-left font-medium"
                >
                  <div
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isChecked ? 'border-accent bg-accent' : 'border-gray-300 bg-white'
                    }`}
                  >
                    {isChecked && <Check size={9} className="text-white" />}
                  </div>
                  <span className="text-[11px] text-text-primary flex-1 truncate">
                    {folder.name}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-border-color my-1.5 mx-2" />

          {/* Create Folder */}
          {isCreatingFolder ? (
            <div className="px-2 flex items-center gap-1.5">
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
                placeholder="分组名称"
                className="flex-1 text-[11px] border border-border-color rounded px-1.5 py-1 outline-none focus:border-accent min-w-0"
              />
              <button
                onClick={handleCreateFolder}
                className="text-[11px] text-accent font-semibold cursor-pointer hover:underline shrink-0"
              >
                确定
              </button>
              <button
                onClick={() => {
                  setIsCreatingFolder(false);
                  setNewFolderName('');
                }}
                className="text-text-secondary cursor-pointer hover:text-text-primary shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="w-full flex items-center gap-1.5 px-3 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-hover-bg rounded transition-colors cursor-pointer font-medium"
            >
              <Plus size={12} />
              新建分组
            </button>
          )}
        </div>
      )}
    </div>
  );
}
