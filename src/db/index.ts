import Dexie, { type Table } from 'dexie';
import type { KnowledgeBase, Group, Document } from '../store/knowledgeBaseStore';
import type { FavoriteFolder, FavoriteItem } from '../store/favoritesStore';
import type { ChatSession, ChatMessage } from '../store/aiWritingStore';

export interface DocumentVersion {
  id: string;
  docId: string;
  title: string;
  content: string; // TipTap JSON string
  createdAt: number;
  saveType: 'auto' | 'manual' | 'published';
}

export interface DocumentAsset {
  id: string;
  docId: string;
  kind: 'image';
  blob: Blob;
  mimeType: string;
  fileName?: string;
  size: number;
  width?: number;
  height?: number;
  createdAt: number;
  orphanedAt?: number;
}

export class DuetDocDB extends Dexie {
  knowledgeBases!: Table<KnowledgeBase, string>;
  groups!: Table<Group, string>;
  documents!: Table<Document, string>;
  favoriteFolders!: Table<FavoriteFolder, string>;
  favoriteItems!: Table<FavoriteItem, string>;
  chatSessions!: Table<ChatSession, string>;
  chatMessages!: Table<ChatMessage, string>;
  documentVersions!: Table<DocumentVersion, string>;
  assets!: Table<DocumentAsset, string>;

  constructor() {
    super('DuetDocDB');
    this.version(1).stores({
      knowledgeBases: 'id, createdAt',
      groups: 'id, kbId, parentGroupId, createdAt',
      documents: 'id, kbId, groupId, createdAt',
      favoriteFolders: 'id, createdAt',
      favoriteItems: 'id, docId, favoritedAt',
      chatSessions: 'id, createdAt',
      chatMessages: 'id, sessionId, createdAt',
    });
    this.version(2).stores({
      knowledgeBases: 'id, createdAt',
      groups: 'id, kbId, parentGroupId, createdAt',
      documents: 'id, kbId, groupId, createdAt',
      favoriteFolders: 'id, createdAt',
      favoriteItems: 'id, docId, favoritedAt',
      chatSessions: 'id, createdAt',
      chatMessages: 'id, sessionId, createdAt',
      documentVersions: 'id, docId, createdAt',
    });
    this.version(3).stores({
      knowledgeBases: 'id, createdAt',
      groups: 'id, kbId, parentGroupId, createdAt',
      documents: 'id, kbId, groupId, createdAt',
      favoriteFolders: 'id, createdAt',
      favoriteItems: 'id, docId, favoritedAt',
      chatSessions: 'id, createdAt',
      chatMessages: 'id, sessionId, createdAt',
      documentVersions: 'id, docId, createdAt, [docId+createdAt]',
    });
    this.version(4).stores({
      knowledgeBases: 'id, createdAt',
      groups: 'id, kbId, parentGroupId, createdAt',
      documents: 'id, kbId, groupId, createdAt',
      favoriteFolders: 'id, createdAt',
      favoriteItems: 'id, docId, favoritedAt',
      chatSessions: 'id, createdAt',
      chatMessages: 'id, sessionId, createdAt',
      documentVersions: 'id, docId, createdAt, [docId+createdAt]',
      assets: 'id, docId, createdAt',
    });
  }
}

export const db = new DuetDocDB();

/**
 * 级联删除指定文档列表对应的全套记录（文档主体、历史版本、关联图片资产、收藏项）
 */
export async function deleteDocumentsCascade(docIds: string[]) {
  if (!docIds || docIds.length === 0) return;
  await db.transaction('rw', [db.documents, db.documentVersions, db.assets, db.favoriteItems], async () => {
    await db.documents.bulkDelete(docIds);
    await db.documentVersions.where('docId').anyOf(docIds).delete();
    await db.assets.where('docId').anyOf(docIds).delete();
    await db.favoriteItems.where('docId').anyOf(docIds).delete();
  });
}

export default db;
