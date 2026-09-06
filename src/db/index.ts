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

export type SyncEntityType =
  'knowledge_base' | 'group' | 'document' | 'chat_session' | 'chat_message';

export interface KnowledgeBaseSyncData {
  name: string;
  description: string;
  icon: string;
  created_at: string;
}

export interface GroupSyncData {
  kb_id: string;
  parent_group_id: string | null;
  name: string;
  sort_order: number;
  depth: number;
  created_at: string;
}

export interface DocumentSyncData {
  kb_id: string;
  group_id: string | null;
  title: string;
  content: string;
  content_format: 'html' | 'tiptap_json';
  created_at: string;
}

export interface ChatSessionSyncData {
  title: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageSyncData {
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'stopped' | 'error';
  web_search_urls: Array<{ title: string; url: string }>;
  referenced_docs: Array<{ id: string; title: string }>;
  knowledge_sources: Array<{
    source_id: string;
    source_type: 'document' | 'memo';
    title: string;
    chunk_index: number;
    heading_path: string[];
  }>;
  ai_metadata: Record<string, unknown> | null;
  created_at: string;
}

export type SyncEntityData =
  | KnowledgeBaseSyncData
  | GroupSyncData
  | DocumentSyncData
  | ChatSessionSyncData
  | ChatMessageSyncData;

export interface SyncOperation {
  entity_type: SyncEntityType;
  entity_id: string;
  operation: 'upsert' | 'delete';
  base_revision: number;
  data?: SyncEntityData;
}

export interface SyncState {
  workspaceId: string;
  pullCursor: number;
  serverUrl: string;
  userId: string;
  lastSyncAt: number | null;
  nextOutboxSequence?: number;
  chatBackfillVersion?: number;
}

export interface SyncEntityState {
  workspaceId: string;
  entityId: string;
  entityType: SyncEntityType;
  serverRev: number;
  localMutationSeq: number;
  updatedAt: number;
}

export interface SyncEntityStateV2 {
  workspaceId: string;
  entityType: SyncEntityType;
  entityId: string;
  serverRev: number;
  localMutationSeq: number;
  updatedAt: number;
  conflict?: SyncConflictData;
}

export interface SyncRemoteSnapshot extends Record<string, unknown> {
  revision: number;
  deleted_at: string | null;
}

export interface SyncConflictData {
  remoteRevision: number;
  snapshot: SyncRemoteSnapshot;
  detectedAt: number;
}

export interface SyncOutboxEntry {
  mutationId: string;
  workspaceId: string;
  queueSequence: number;
  operations: SyncOperation[];
  status: 'pending' | 'pushing' | 'error';
  errorCode?: string;
  errorReason?: string;
  createdAt: number;
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
  syncState!: Table<SyncState, string>;
  syncEntityStates!: Table<SyncEntityState, [string, string]>;
  syncEntityStatesV2!: Table<SyncEntityStateV2, [string, SyncEntityType, string]>;
  syncOutbox!: Table<SyncOutboxEntry, string>;

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
    this.version(6).stores({
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
      syncState: 'workspaceId',
      syncEntityStates: '[workspaceId+entityId], workspaceId, entityId, entityType',
      syncOutbox: 'mutationId, workspaceId, status, createdAt',
    });
    this.version(7)
      .stores({
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
        syncState: 'workspaceId',
        syncEntityStates: '[workspaceId+entityId], workspaceId, entityId, entityType',
        syncEntityStatesV2: '[workspaceId+entityType+entityId], workspaceId, entityType, entityId',
        syncOutbox:
          'mutationId, workspaceId, status, queueSequence, [workspaceId+status+queueSequence]',
      })
      .upgrade(async (tx) => {
        // 1. 安全平滑迁移旧表数据至 syncEntityStatesV2
        const oldRows = await tx.table<SyncEntityState>('syncEntityStates').toArray();
        if (oldRows.length > 0) {
          const v2Rows: SyncEntityStateV2[] = oldRows.map((r) => ({
            workspaceId: r.workspaceId,
            entityType: r.entityType,
            entityId: r.entityId,
            serverRev: r.serverRev,
            localMutationSeq: r.localMutationSeq,
            updatedAt: r.updatedAt,
          }));
          await tx.table('syncEntityStatesV2').bulkPut(v2Rows);
        }

        // 2. 为遗留的 syncOutbox 记录补齐 queueSequence
        const outboxTable = tx.table<SyncOutboxEntry>('syncOutbox');
        const outboxEntries = await outboxTable.toArray();
        outboxEntries.sort((a, b) => a.createdAt - b.createdAt);
        let seq = 1;
        for (const entry of outboxEntries) {
          if (typeof entry.queueSequence !== 'number') {
            await outboxTable.update(entry.mutationId, { queueSequence: seq++ });
          }
        }
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
