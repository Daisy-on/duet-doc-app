import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { db } from '../db';

export const FOLDER_ALL_ID = 'folder-all';

export interface FavoriteFolder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface FavoriteItem {
  id: string;
  docId: string;
  /** Always includes FOLDER_ALL_ID; extra custom folder IDs are appended here */
  folderIds: string[];
  favoritedAt: number;
  createdAt: number;
  updatedAt: number;
}

interface FavoritesStore {
  folders: FavoriteFolder[];
  items: FavoriteItem[];

  initStore: () => Promise<void>;

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

const generateId = () => nanoid(12);

// ── Demo initial data ───────────────────────────────────────────────────────

const initialFolders: FavoriteFolder[] = [
  {
    id: FOLDER_ALL_ID,
    name: '全部收藏',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
  },
  {
    id: 'folder-tech',
    name: '技术文档',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
  },
];

const initialItems: FavoriteItem[] = [
  {
    id: 'fav-demo-1',
    docId: 'doc-vite-analysis',
    folderIds: [FOLDER_ALL_ID, 'folder-tech'],
    favoritedAt: Date.now() - 1000 * 60 * 60 * 5,
    createdAt: Date.now() - 1000 * 60 * 60 * 5,
    updatedAt: Date.now() - 1000 * 60 * 60 * 5,
  },
  {
    id: 'fav-demo-2',
    docId: 'doc-prd-ai',
    folderIds: [FOLDER_ALL_ID],
    favoritedAt: Date.now() - 1000 * 60 * 60 * 2,
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
    updatedAt: Date.now() - 1000 * 60 * 60 * 2,
  },
];

// ── Store ────────────────────────────────────────────────────────────────────

export const useFavoritesStore = create<FavoritesStore>((set, get) => ({
  folders: [],
  items: [],

  initStore: async () => {
    try {
      const folderCount = await db.favoriteFolders.count();
      if (folderCount === 0) {
        await db.favoriteFolders.bulkAdd(initialFolders);
        await db.favoriteItems.bulkAdd(initialItems);
      }
      const folders = await db.favoriteFolders.toArray();
      const items = await db.favoriteItems.toArray();
      set({ folders, items });
    } catch (error) {
      console.error('Failed to initialize FavoritesStore from Dexie:', error);
    }
  },

  // ── Folder ops ─────────────────────────────────────────────────────────────

  createFolder: (name) => {
    const id = `folder-${generateId()}`;
    const newFolder: FavoriteFolder = { id, name, createdAt: Date.now(), updatedAt: Date.now() };
    db.favoriteFolders.add(newFolder).catch((err) => console.error('Dexie error:', err));
    set((state) => ({ folders: [...state.folders, newFolder] }));
    return id;
  },

  renameFolder: (id, name) => {
    if (id === FOLDER_ALL_ID) return; // system folder – immutable
    const updatedAt = Date.now();
    db.favoriteFolders
      .update(id, { name, updatedAt })
      .catch((err) => console.error('Dexie error:', err));
    set((state) => ({
      folders: state.folders.map((f) => (f.id === id ? { ...f, name, updatedAt } : f)),
    }));
  },

  deleteFolder: (id) => {
    if (id === FOLDER_ALL_ID) return; // cannot delete system folder
    db.favoriteFolders.delete(id).catch((err) => console.error('Dexie error:', err));
    db.favoriteItems
      .toCollection()
      .modify((item) => {
        item.folderIds = item.folderIds.filter((fid) => fid !== id);
        item.updatedAt = Date.now();
      })
      .catch((err) => console.error('Dexie error:', err));

    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
      // Remove deleted folder from every item's folderIds list
      items: state.items.map((item) => ({
        ...item,
        folderIds: item.folderIds.filter((fid) => fid !== id),
        updatedAt: Date.now(),
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.favoriteItems.add(newItem).catch((err) => console.error('Dexie error:', err));
    set((state) => ({ items: [...state.items, newItem] }));
  },

  removeFavorite: (docId) => {
    db.favoriteItems
      .where('docId')
      .equals(docId)
      .delete()
      .catch((err) => console.error('Dexie error:', err));
    set((state) => ({
      items: state.items.filter((item) => item.docId !== docId),
    }));
  },

  addToFolder: (docId, folderId) => {
    db.favoriteItems
      .where('docId')
      .equals(docId)
      .modify((item) => {
        if (!item.folderIds.includes(folderId)) {
          item.folderIds.push(folderId);
          item.updatedAt = Date.now();
        }
      })
      .catch((err) => console.error('Dexie error:', err));

    set((state) => ({
      items: state.items.map((item) =>
        item.docId === docId && !item.folderIds.includes(folderId)
          ? { ...item, folderIds: [...item.folderIds, folderId], updatedAt: Date.now() }
          : item,
      ),
    }));
  },

  removeFromFolder: (docId, folderId) => {
    if (folderId === FOLDER_ALL_ID) return; // cannot remove from "all"
    db.favoriteItems
      .where('docId')
      .equals(docId)
      .modify((item) => {
        item.folderIds = item.folderIds.filter((fid) => fid !== folderId);
        item.updatedAt = Date.now();
      })
      .catch((err) => console.error('Dexie error:', err));

    set((state) => ({
      items: state.items.map((item) =>
        item.docId === docId
          ? {
              ...item,
              folderIds: item.folderIds.filter((fid) => fid !== folderId),
              updatedAt: Date.now(),
            }
          : item,
      ),
    }));
  },

  // ── Queries ────────────────────────────────────────────────────────────────

  isFavorited: (docId) => get().items.some((item) => item.docId === docId),

  getFolderIds: (docId) => get().items.find((item) => item.docId === docId)?.folderIds ?? [],

  getItemsByFolder: (folderId) =>
    get()
      .items.filter((item) => item.folderIds.includes(folderId))
      .sort((a, b) => b.favoritedAt - a.favoritedAt),
}));
