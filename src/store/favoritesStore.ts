import { create } from 'zustand';

export const FOLDER_ALL_ID = 'folder-all';

export interface FavoriteFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface FavoriteItem {
  id: string;
  docId: string;
  /** Always includes FOLDER_ALL_ID; extra custom folder IDs are appended here */
  folderIds: string[];
  favoritedAt: number;
}

interface FavoritesStore {
  folders: FavoriteFolder[];
  items: FavoriteItem[];

  // Folder CRUD
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;

  // Favorite item ops
  addFavorite: (docId: string) => void;
  removeFavorite: (docId: string) => void;
  addToFolder: (docId: string, folderId: string) => void;
  removeFromFolder: (docId: string, folderId: string) => void;

  // Queries
  isFavorited: (docId: string) => boolean;
  getFolderIds: (docId: string) => string[];
  getItemsByFolder: (folderId: string) => FavoriteItem[];
}

const generateId = () => Math.random().toString(36).substring(2, 9);

// ── Demo initial data ───────────────────────────────────────────────────────

const initialFolders: FavoriteFolder[] = [
  {
    id: FOLDER_ALL_ID,
    name: '全部收藏',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
  },
  {
    id: 'folder-tech',
    name: '技术文档',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
  },
];

const initialItems: FavoriteItem[] = [
  {
    id: 'fav-demo-1',
    docId: 'doc-vite-analysis',
    folderIds: [FOLDER_ALL_ID, 'folder-tech'],
    favoritedAt: Date.now() - 1000 * 60 * 60 * 5,
  },
  {
    id: 'fav-demo-2',
    docId: 'doc-prd-ai',
    folderIds: [FOLDER_ALL_ID],
    favoritedAt: Date.now() - 1000 * 60 * 60 * 2,
  },
];

// ── Store ────────────────────────────────────────────────────────────────────

export const useFavoritesStore = create<FavoritesStore>((set, get) => ({
  folders: initialFolders,
  items: initialItems,

  // ── Folder ops ─────────────────────────────────────────────────────────────

  createFolder: (name) => {
    const id = `folder-${generateId()}`;
    const newFolder: FavoriteFolder = { id, name, createdAt: Date.now() };
    set((state) => ({ folders: [...state.folders, newFolder] }));
    return id;
  },

  renameFolder: (id, name) => {
    if (id === FOLDER_ALL_ID) return; // system folder – immutable
    set((state) => ({
      folders: state.folders.map((f) => (f.id === id ? { ...f, name } : f)),
    }));
  },

  deleteFolder: (id) => {
    if (id === FOLDER_ALL_ID) return; // cannot delete system folder
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
      // Remove deleted folder from every item's folderIds list
      items: state.items.map((item) => ({
        ...item,
        folderIds: item.folderIds.filter((fid) => fid !== id),
      })),
    }));
  },

  // ── Favorite item ops ──────────────────────────────────────────────────────

  addFavorite: (docId) => {
    if (get().isFavorited(docId)) return; // already favorited, no-op
    const newItem: FavoriteItem = {
      id: `fav-${generateId()}`,
      docId,
      folderIds: [FOLDER_ALL_ID],
      favoritedAt: Date.now(),
    };
    set((state) => ({ items: [...state.items, newItem] }));
  },

  removeFavorite: (docId) => {
    set((state) => ({
      items: state.items.filter((item) => item.docId !== docId),
    }));
  },

  addToFolder: (docId, folderId) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.docId === docId && !item.folderIds.includes(folderId)
          ? { ...item, folderIds: [...item.folderIds, folderId] }
          : item
      ),
    }));
  },

  removeFromFolder: (docId, folderId) => {
    if (folderId === FOLDER_ALL_ID) return; // cannot remove from "all"
    set((state) => ({
      items: state.items.map((item) =>
        item.docId === docId
          ? { ...item, folderIds: item.folderIds.filter((fid) => fid !== folderId) }
          : item
      ),
    }));
  },


  // ── Queries ────────────────────────────────────────────────────────────────

  isFavorited: (docId) => get().items.some((item) => item.docId === docId),

  getFolderIds: (docId) =>
    get().items.find((item) => item.docId === docId)?.folderIds ?? [],

  getItemsByFolder: (folderId) =>
    get()
      .items.filter((item) => item.folderIds.includes(folderId))
      .sort((a, b) => b.favoritedAt - a.favoritedAt),
}));
