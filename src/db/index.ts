import Dexie, { type Table, type Transaction } from 'dexie';
import type { KnowledgeBase, Group, Document } from '../store/knowledgeBaseStore';
import type { FavoriteFolder, FavoriteItem } from '../store/favoritesStore';
import type { ChatSession, ChatMessage } from '../store/aiWritingStore';
import type { DocumentChunk, DocumentIndexState } from '../rag/types';

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
  documentChunks!: Table<DocumentChunk, string>;
  documentIndexStates!: Table<DocumentIndexState, string>;

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
    this.version(5).stores({
      knowledgeBases: 'id, createdAt',
      groups: 'id, kbId, parentGroupId, createdAt',
      documents: 'id, kbId, groupId, createdAt',
      favoriteFolders: 'id, createdAt',
      favoriteItems: 'id, docId, favoritedAt',
      chatSessions: 'id, createdAt',
      chatMessages: 'id, sessionId, createdAt',
      documentVersions: 'id, docId, createdAt, [docId+createdAt]',
      assets: 'id, docId, createdAt',
      documentChunks:
        'id, sourceId, kbId, sourceType, contentHash, indexedAt, [sourceId+chunkIndex]',
      documentIndexStates: 'sourceId, kbId, status, sourceUpdatedAt',
    });
  }
}

export const db = new DuetDocDB();

/**
 * 在给定 Dexie 事务内，级联删除指定文档列表对应的全套记录
 */
export async function deleteDocumentsCascadeInTx(tx: Transaction, docIds: string[]) {
  if (!docIds || docIds.length === 0) return;
  await tx.table('documents').bulkDelete(docIds);
  await tx.table('documentVersions').where('docId').anyOf(docIds).delete();
  await tx.table('assets').where('docId').anyOf(docIds).delete();
  await tx.table('favoriteItems').where('docId').anyOf(docIds).delete();
  await tx.table('documentChunks').where('sourceId').anyOf(docIds).delete();
  await tx.table('documentIndexStates').bulkDelete(docIds);
}

/**
 * 独立开启事务进行级联删除
 */
export async function deleteDocumentsCascade(docIds: string[]) {
  if (!docIds || docIds.length === 0) return;
  await db.transaction(
    'rw',
    [
      db.documents,
      db.documentVersions,
      db.assets,
      db.favoriteItems,
      db.documentChunks,
      db.documentIndexStates,
    ],
    async (tx) => {
      await deleteDocumentsCascadeInTx(tx, docIds);
    },
  );
}

export default db;
