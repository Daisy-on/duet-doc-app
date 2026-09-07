import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Transaction } from 'dexie';
import { db, deleteDocumentsCascadeInTx, type DocumentVersion, type SyncOperation } from '../db';
import { useFavoritesStore } from './favoritesStore';
import { saveCoordinator, type SaveUpdates, type DeleteHandle } from '../utils/SaveCoordinator';
import { extractAssetIds } from '../utils/assetUtils';
import { runAssetGC } from '../assets/runAssetGC';
import { useEditorStore } from './index';
import { scheduleDocumentIndex } from '../rag/documentIndexer';
import { updateDocumentChunkScope } from '../rag/chunkRepository';
import { enqueueMutationInTx, detectContentFormat } from '../sync/syncOutboxHelper';
import { cloudSyncService } from '../sync/CloudSyncService';
import { useSyncStore } from './syncStore';

export const MEMO_KB_ID = 'kb-memo-system';

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  icon: string; // Background color class or Hex color code
  createdAt: number;
  updatedAt: number;
}

export interface Group {
  id: string;
  kbId: string;
  parentGroupId: string | null; // null = 知识库根级分组
  depth: number; // 0 = 根级，1 = 二级，最大 5
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Document {
  id: string;
  kbId: string;
  groupId: string | null;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface KnowledgeBaseStore {
  knowledgeBases: KnowledgeBase[];
  groups: Group[];
  documents: Document[];

  initStore: () => Promise<void>;
  reloadFromDb: () => Promise<void>;

  // Knowledge Base CRUD
  createKnowledgeBase: (name: string, description: string, icon?: string) => string;
  updateKnowledgeBase: (id: string, data: Partial<KnowledgeBase>) => void;
  deleteKnowledgeBase: (id: string) => Promise<void>;

  // Group CRUD
  createGroup: (kbId: string, parentGroupId: string | null, name?: string) => string;
  updateGroup: (id: string, data: Partial<Group>) => void;
  deleteGroup: (id: string) => Promise<void>;

  // Document CRUD
  createDocument: (kbId: string, groupId?: string | null, title?: string) => string;
  updateDocument: (id: string, data: Partial<Document>) => void;
  scheduleDocumentAutosave: (id: string, updates: SaveUpdates) => void;
  persistDocumentNow: (id: string, updates: SaveUpdates) => Promise<void>;
  flushDocumentAutosave: (id: string) => Promise<void>;
  flushAllDocumentAutosaves: () => Promise<void>;
  createManualVersion: (docId: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;

  // Query helpers
  getKnowledgeBase: (id: string) => KnowledgeBase | undefined;
  getGroupsByKb: (kbId: string) => Group[];
  getDocumentsByKb: (kbId: string) => Document[];
  getDocumentsByGroup: (groupId: string) => Document[];
  getRootDocuments: (kbId: string) => Document[];

  // New nested group helpers
  getChildGroups: (parentGroupId: string | null, kbId: string) => Group[];
  getGroupDepth: (groupId: string) => number;
  getGroupAncestors: (groupId: string) => Group[]; // Breadcrumb helper
  getDescendantGroupIds: (groupId: string) => string[]; // Cascade delete helper

  // Memo operations
  getMemos: () => Document[];
  createMemo: (title?: string) => Promise<string>;
  moveDocument: (id: string, targetKbId: string, targetGroupId: string | null) => void;
  moveGroup: (
    id: string,
    targetKbId: string,
    targetParentGroupId: string | null,
  ) => { success: boolean; error?: string };
  restoreVersion: (versionId: string) => Promise<{ restored: boolean; missingAssetIds?: string[] }>;
}

const generateId = () => nanoid(12);

const enforceVersionLimitInTx = async (tx: Transaction, docId: string) => {
  try {
    const versions = await tx
      .table<DocumentVersion, string>('documentVersions')
      .where('docId')
      .equals(docId)
      .toArray();
    const targetVersions = versions
      .filter((v) => v.saveType === 'auto' || v.saveType === 'manual')
      .sort((a, b) => a.createdAt - b.createdAt);
    if (targetVersions.length > 50) {
      const toDeleteCount = targetVersions.length - 50;
      const autoVersions = targetVersions.filter((v) => v.saveType === 'auto');
      const toDeleteIds = (autoVersions.length >= toDeleteCount ? autoVersions : targetVersions)
        .slice(0, toDeleteCount)
        .map((v) => v.id);
      await tx.table('documentVersions').bulkDelete(toDeleteIds);
    }
  } catch (err) {
    console.error('Failed to enforce version limit:', err);
    throw err;
  }
};

const internalPersistDocument = async (id: string, updates: SaveUpdates) => {
  const now = Date.now();
  let persistedDocument: Document | null = null;
  await db.transaction(
    'rw',
    [
      db.documents,
      db.documentVersions,
      db.assets,
      db.syncOutbox,
      db.syncEntityStatesV2,
      db.syncState,
    ],
    async (tx) => {
      const docTable = tx.table<Document, string>('documents');
      const verTable = tx.table<DocumentVersion, string>('documentVersions');

      const existingDoc = await docTable.get(id);
      if (!existingDoc) return;

      const oldContent = existingDoc.content || '';
      const newContent = updates.content !== undefined ? updates.content : oldContent;
      const newTitle = updates.title !== undefined ? updates.title : existingDoc.title;

      await docTable.update(id, {
        title: newTitle,
        content: newContent,
        updatedAt: now,
      });
      persistedDocument = {
        ...existingDoc,
        title: newTitle,
        content: newContent,
        updatedAt: now,
      };

      // 变更原子入队 syncOutbox，支持 pending 原地合并与智能格式嗅探
      await enqueueMutationInTx(tx, [
        {
          entity_type: 'document',
          entity_id: id,
          operation: 'upsert',
          base_revision: 0,
          data: {
            kb_id: existingDoc.kbId,
            group_id: existingDoc.groupId,
            title: newTitle,
            content: newContent,
            content_format: detectContentFormat(newContent),
            created_at: new Date(existingDoc.createdAt).toISOString(),
          },
        },
      ]);

      if (updates.content !== undefined) {
        const oldAssets = extractAssetIds(oldContent);
        const newAssets = extractAssetIds(newContent);

        let isStructuralDelete = false;
        for (const assetId of oldAssets) {
          if (!newAssets.has(assetId)) {
            isStructuralDelete = true;
            break;
          }
        }

        const versions = await verTable.where('docId').equals(id).toArray();
        const autoVersions = versions
          .filter((v) => v.saveType === 'auto')
          .sort((a, b) => a.createdAt - b.createdAt);
        const latestVersion = autoVersions[autoVersions.length - 1];
        const FIVE_MINUTES = 5 * 60 * 1000;

        if (!isStructuralDelete && latestVersion && now - latestVersion.createdAt < FIVE_MINUTES) {
          await verTable.update(latestVersion.id, {
            content: newContent,
            title: newTitle,
          });
        } else {
          if (isStructuralDelete) {
            const checkpointId = `ver-${nanoid(12)}`;
            await verTable.add({
              id: checkpointId,
              docId: id,
              title: existingDoc.title,
              content: oldContent,
              createdAt: now - 1,
              saveType: 'auto',
            });
          }

          const versionId = `ver-${nanoid(12)}`;
          await verTable.add({
            id: versionId,
            docId: id,
            title: newTitle,
            content: newContent,
            createdAt: now,
            saveType: 'auto',
          });

          await enforceVersionLimitInTx(tx, id);
        }
      }
    },
  );

  if (updates.content !== undefined) {
    runAssetGC(id).catch((err) => console.error('Asset GC error:', err));
  }
  if (persistedDocument && (updates.content !== undefined || updates.title !== undefined)) {
    scheduleDocumentIndex(persistedDocument);
  }
  void useSyncStore.getState().refreshCounts();
};

export const useKnowledgeBaseStore = create<KnowledgeBaseStore>((set, get) => ({
  knowledgeBases: [],
  groups: [],
  documents: [],

  initStore: async () => {
    try {
      try {
        await cloudSyncService.pullAll(useSyncStore.getState().workspaceId);
        window.localStorage.setItem('duet-doc:cloud-sync-enabled', 'true');
      } catch (error) {
        console.info('[CloudSync] Cloud restore unavailable, continuing locally.', error);
      }

      await get().reloadFromDb();

      // 初始化同步状态
      void useSyncStore.getState().initSyncStore();
    } catch (error) {
      console.error('Failed to initialize KnowledgeBaseStore from Dexie:', error);
    }
  },

  reloadFromDb: async () => {
    const [knowledgeBases, groups, documents] = await Promise.all([
      db.knowledgeBases.toArray(),
      db.groups.toArray(),
      db.documents.toArray(),
    ]);
    set({
      knowledgeBases,
      groups: groups.sort((a, b) => a.order - b.order),
      documents,
    });
  },

  // Knowledge Base CRUD
  createKnowledgeBase: (name, description, icon = '#3b82f6') => {
    const id = `kb-${generateId()}`;
    const newKB: KnowledgeBase = {
      id,
      name,
      description,
      icon,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.transaction(
      'rw',
      [db.knowledgeBases, db.syncOutbox, db.syncEntityStatesV2, db.syncState],
      async (tx) => {
        await tx.table('knowledgeBases').add(newKB);
        await enqueueMutationInTx(tx, [
          {
            entity_type: 'knowledge_base',
            entity_id: id,
            operation: 'upsert',
            base_revision: 0,
            data: {
              name: newKB.name,
              description: newKB.description,
              icon: newKB.icon,
              created_at: new Date(newKB.createdAt).toISOString(),
            },
          },
        ]);
      },
    )
      .then(() => useSyncStore.getState().refreshCounts())
      .catch((err) => console.error('Dexie error:', err));

    set((state) => ({
      knowledgeBases: [...state.knowledgeBases, newKB],
    }));
    return id;
  },

  updateKnowledgeBase: (id, data) => {
    const updatedAt = Date.now();
    db.transaction(
      'rw',
      [db.knowledgeBases, db.syncOutbox, db.syncEntityStatesV2, db.syncState],
      async (tx) => {
        const kbTable = tx.table<KnowledgeBase, string>('knowledgeBases');
        const existing = await kbTable.get(id);
        if (!existing) return;
        const updated = { ...existing, ...data, updatedAt };
        await kbTable.put(updated);
        await enqueueMutationInTx(tx, [
          {
            entity_type: 'knowledge_base',
            entity_id: id,
            operation: 'upsert',
            base_revision: 0,
            data: {
              name: updated.name,
              description: updated.description,
              icon: updated.icon,
              created_at: new Date(updated.createdAt).toISOString(),
            },
          },
        ]);
      },
    )
      .then(() => useSyncStore.getState().refreshCounts())
      .catch((err) => console.error('Dexie error:', err));

    set((state) => ({
      knowledgeBases: state.knowledgeBases.map((kb) =>
        kb.id === id ? { ...kb, ...data, updatedAt } : kb,
      ),
    }));
  },

  deleteKnowledgeBase: async (id) => {
    let docIds: string[] = [];
    let handle: DeleteHandle | null = null;

    try {
      // 1. 在开启写事务前预先从 DB 识别并建立保存屏障（切勿在 Dexie 事务回调内 await 非 IDB 的外部 Promise）
      const initialDocs = await db.documents.where('kbId').equals(id).toArray();
      docIds = initialDocs.map((d) => d.id);
      for (const docId of docIds) {
        useEditorStore.getState().flushPendingDocumentUpdate(docId);
      }
      handle = await saveCoordinator.prepareDelete(docIds);

      // 2. 开启原子写事务
      await db.transaction(
        'rw',
        [
          db.knowledgeBases,
          db.groups,
          db.documents,
          db.documentVersions,
          db.assets,
          db.favoriteItems,
          db.documentChunks,
          db.documentIndexStates,
          db.syncOutbox,
          db.syncEntityStatesV2,
          db.syncState,
        ],
        async (tx) => {
          const dbDocs = await tx
            .table<Document, string>('documents')
            .where('kbId')
            .equals(id)
            .toArray();
          const dbGroups = await tx
            .table<Group, string>('groups')
            .where('kbId')
            .equals(id)
            .toArray();
          docIds = dbDocs.map((d) => d.id);
          const groupIds = dbGroups.map((g) => g.id);

          // 构造原子变更组：按文档 -> 子分组 -> 父分组 -> 知识库的级联顺序删除
          const operations: SyncOperation[] = [];
          for (const doc of dbDocs) {
            operations.push({
              entity_type: 'document',
              entity_id: doc.id,
              operation: 'delete',
              base_revision: 0,
            });
          }

          const sortedGroups = [...dbGroups].sort((a, b) => b.depth - a.depth);
          for (const g of sortedGroups) {
            operations.push({
              entity_type: 'group',
              entity_id: g.id,
              operation: 'delete',
              base_revision: 0,
            });
          }

          operations.push({
            entity_type: 'knowledge_base',
            entity_id: id,
            operation: 'delete',
            base_revision: 0,
          });

          await enqueueMutationInTx(tx, operations);

          await tx.table('knowledgeBases').delete(id);
          if (groupIds.length > 0) {
            await tx.table('groups').bulkDelete(groupIds);
          }
          if (docIds.length > 0) {
            await deleteDocumentsCascadeInTx(tx, docIds);
          }
        },
      );
    } catch (err) {
      const h = handle as DeleteHandle | null;
      if (h) h.rollback(internalPersistDocument);
      console.error(`Failed to delete knowledge base ${id} in Dexie transaction:`, err);
      throw err;
    }

    // 数据库物理删除成功后，提交屏障并更新内存状态
    const h = handle as DeleteHandle | null;
    if (h) h.commit();
    void useSyncStore.getState().refreshCounts();

    try {
      if (docIds.length > 0) {
        const docIdSet = new Set(docIds);
        useFavoritesStore.setState((state) => ({
          items: state.items.filter((item) => !docIdSet.has(item.docId)),
        }));
      }

      set((state) => ({
        knowledgeBases: state.knowledgeBases.filter((kb) => kb.id !== id),
        groups: state.groups.filter((g) => g.kbId !== id),
        documents: state.documents.filter((d) => d.kbId !== id),
      }));
    } catch (postCommitErr) {
      console.error(
        'Post-commit state sync failed, re-initializing stores from DB:',
        postCommitErr,
      );
      await Promise.all([get().initStore(), useFavoritesStore.getState().initStore()]);
    }
  },

  // Group CRUD
  createGroup: (kbId, parentGroupId, name = '新建分组') => {
    const id = `group-${generateId()}`;
    const groups = get().groups;

    let depth = 0;
    if (parentGroupId) {
      const parent = groups.find((g) => g.id === parentGroupId);
      if (parent) {
        depth = parent.depth + 1;
      }
    }

    const siblingCount = groups.filter(
      (g) => g.kbId === kbId && g.parentGroupId === parentGroupId,
    ).length;

    const newGroup: Group = {
      id,
      kbId,
      parentGroupId,
      depth,
      name,
      order: siblingCount + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    db.transaction(
      'rw',
      [db.groups, db.syncOutbox, db.syncEntityStatesV2, db.syncState],
      async (tx) => {
        await tx.table('groups').add(newGroup);
        await enqueueMutationInTx(tx, [
          {
            entity_type: 'group',
            entity_id: id,
            operation: 'upsert',
            base_revision: 0,
            data: {
              kb_id: newGroup.kbId,
              parent_group_id: newGroup.parentGroupId,
              name: newGroup.name,
              sort_order: newGroup.order,
              depth: newGroup.depth,
              created_at: new Date(newGroup.createdAt).toISOString(),
            },
          },
        ]);
      },
    )
      .then(() => useSyncStore.getState().refreshCounts())
      .catch((err) => console.error('Dexie error:', err));

    set((state) => ({
      groups: [...state.groups, newGroup],
    }));
    return id;
  },

  updateGroup: (id, data) => {
    const updatedAt = Date.now();
    db.transaction(
      'rw',
      [db.groups, db.syncOutbox, db.syncEntityStatesV2, db.syncState],
      async (tx) => {
        const grpTable = tx.table<Group, string>('groups');
        const existing = await grpTable.get(id);
        if (!existing) return;
        const updated = { ...existing, ...data, updatedAt };
        await grpTable.put(updated);
        await enqueueMutationInTx(tx, [
          {
            entity_type: 'group',
            entity_id: id,
            operation: 'upsert',
            base_revision: 0,
            data: {
              kb_id: updated.kbId,
              parent_group_id: updated.parentGroupId,
              name: updated.name,
              sort_order: updated.order,
              depth: updated.depth,
              created_at: new Date(updated.createdAt).toISOString(),
            },
          },
        ]);
      },
    )
      .then(() => useSyncStore.getState().refreshCounts())
      .catch((err) => console.error('Dexie error:', err));

    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, ...data, updatedAt } : g)),
    }));
  },

  deleteGroup: async (id) => {
    let docIds: string[] = [];
    let deleteGroupIdsSet = new Set<string>([id]);
    let handle: DeleteHandle | null = null;

    try {
      // 1. 事务前收集分组与文档并建立屏障
      const allGroupsInit = await db.groups.toArray();
      deleteGroupIdsSet = new Set<string>([id]);
      let addedInit = true;
      while (addedInit) {
        addedInit = false;
        for (const g of allGroupsInit) {
          if (
            g.parentGroupId &&
            deleteGroupIdsSet.has(g.parentGroupId) &&
            !deleteGroupIdsSet.has(g.id)
          ) {
            deleteGroupIdsSet.add(g.id);
            addedInit = true;
          }
        }
      }
      const initialDocs = await db.documents.toArray();
      docIds = initialDocs
        .filter((d) => d.groupId && deleteGroupIdsSet.has(d.groupId))
        .map((d) => d.id);
      for (const docId of docIds) {
        useEditorStore.getState().flushPendingDocumentUpdate(docId);
      }
      handle = await saveCoordinator.prepareDelete(docIds);

      // 2. 开启原子写事务
      await db.transaction(
        'rw',
        [
          db.groups,
          db.documents,
          db.documentVersions,
          db.assets,
          db.favoriteItems,
          db.documentChunks,
          db.documentIndexStates,
          db.syncOutbox,
          db.syncEntityStatesV2,
          db.syncState,
        ],
        async (tx) => {
          const allGroups = await tx.table<Group, string>('groups').toArray();
          deleteGroupIdsSet = new Set<string>([id]);

          let added = true;
          while (added) {
            added = false;
            for (const g of allGroups) {
              if (
                g.parentGroupId &&
                deleteGroupIdsSet.has(g.parentGroupId) &&
                !deleteGroupIdsSet.has(g.id)
              ) {
                deleteGroupIdsSet.add(g.id);
                added = true;
              }
            }
          }

          const deleteGroupsList = allGroups.filter((g) => deleteGroupIdsSet.has(g.id));
          // 按深度从深到浅排序分组（子先父后）
          deleteGroupsList.sort((a, b) => b.depth - a.depth);
          const deleteGroupIds = deleteGroupsList.map((g) => g.id);

          const dbDocs = await tx.table<Document, string>('documents').toArray();
          const targetDocs = dbDocs.filter((d) => d.groupId && deleteGroupIdsSet.has(d.groupId));
          docIds = targetDocs.map((d) => d.id);

          // 构造原子变更组：先文档，后子分组，最后根级被删分组
          const operations: SyncOperation[] = [];
          for (const doc of targetDocs) {
            operations.push({
              entity_type: 'document',
              entity_id: doc.id,
              operation: 'delete',
              base_revision: 0,
            });
          }
          for (const g of deleteGroupsList) {
            operations.push({
              entity_type: 'group',
              entity_id: g.id,
              operation: 'delete',
              base_revision: 0,
            });
          }

          await enqueueMutationInTx(tx, operations);

          await tx.table('groups').bulkDelete(deleteGroupIds);
          if (docIds.length > 0) {
            await deleteDocumentsCascadeInTx(tx, docIds);
          }
        },
      );
    } catch (err) {
      const h = handle as DeleteHandle | null;
      if (h) h.rollback(internalPersistDocument);
      console.error(`Failed to delete group ${id} in Dexie transaction:`, err);
      throw err;
    }

    const h = handle as DeleteHandle | null;
    if (h) h.commit();
    void useSyncStore.getState().refreshCounts();

    try {
      if (docIds.length > 0) {
        const docIdSet = new Set(docIds);
        useFavoritesStore.setState((state) => ({
          items: state.items.filter((item) => !docIdSet.has(item.docId)),
        }));
      }

      set((state) => ({
        groups: state.groups.filter((g) => !deleteGroupIdsSet.has(g.id)),
        documents: state.documents.filter((doc) => !deleteGroupIdsSet.has(doc.groupId || '')),
      }));
    } catch (postCommitErr) {
      console.error(
        'Post-commit state sync failed, re-initializing stores from DB:',
        postCommitErr,
      );
      await Promise.all([get().initStore(), useFavoritesStore.getState().initStore()]);
    }
  },

  // Document CRUD
  createDocument: (kbId, groupId = null, title = '无标题文档') => {
    const id = `doc-${generateId()}`;
    const newDoc: Document = {
      id,
      kbId,
      groupId,
      title,
      content: `<h1>${title}</h1><p>开始书写你的内容...</p>`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.transaction(
      'rw',
      [db.documents, db.syncOutbox, db.syncEntityStatesV2, db.syncState],
      async (tx) => {
        await tx.table('documents').add(newDoc);
        await enqueueMutationInTx(tx, [
          {
            entity_type: 'document',
            entity_id: id,
            operation: 'upsert',
            base_revision: 0,
            data: {
              kb_id: newDoc.kbId,
              group_id: newDoc.groupId,
              title: newDoc.title,
              content: newDoc.content,
              content_format: detectContentFormat(newDoc.content),
              created_at: new Date(newDoc.createdAt).toISOString(),
            },
          },
        ]);
      },
    )
      .then(() => {
        scheduleDocumentIndex(newDoc);
        void useSyncStore.getState().refreshCounts();
      })
      .catch((err) => console.error('Dexie error:', err));
    set((state) => ({
      documents: [...state.documents, newDoc],
    }));
    return id;
  },

  scheduleDocumentAutosave: (id, updates) => {
    saveCoordinator.scheduleDocumentAutosave(id, updates, internalPersistDocument);
  },

  persistDocumentNow: async (id, updates) => {
    await saveCoordinator.persistDocumentNow(id, updates, internalPersistDocument);
  },

  flushDocumentAutosave: async (id) => {
    useEditorStore.getState().flushPendingDocumentUpdate(id);
    await saveCoordinator.pauseAndFlush(id, internalPersistDocument);
    saveCoordinator.resume(id, internalPersistDocument);
  },

  flushAllDocumentAutosaves: async () => {
    await saveCoordinator.flushAll(internalPersistDocument);
  },

  createManualVersion: async (docId) => {
    useEditorStore.getState().flushPendingDocumentUpdate(docId);
    await saveCoordinator.pauseAndFlush(docId, internalPersistDocument);
    return await saveCoordinator.runExclusive(docId, async () => {
      try {
        const now = Date.now();
        await db.transaction('rw', [db.documents, db.documentVersions], async (tx) => {
          const docTable = tx.table('documents');
          const verTable = tx.table('documentVersions');

          const latestDbDoc = await docTable.get(docId);
          if (!latestDbDoc) return;

          const versionId = `ver-${nanoid(12)}`;
          await verTable.add({
            id: versionId,
            docId,
            title: latestDbDoc.title,
            content: latestDbDoc.content,
            createdAt: now,
            saveType: 'manual',
          });

          await enforceVersionLimitInTx(tx, docId);
        });
      } finally {
        saveCoordinator.resume(docId, internalPersistDocument);
      }
    });
  },

  updateDocument: (id, data) => {
    const updatedAt = Date.now();
    // 1. Synchronously update Zustand memory state for immediate UI feedback (optimistic update)
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, ...data, updatedAt } : doc,
      ),
    }));

    // 2. Schedule or persist updates
    const updates: SaveUpdates = {
      content: data.content,
      title: data.title,
    };

    if (data.content !== undefined) {
      saveCoordinator.scheduleDocumentAutosave(id, updates, internalPersistDocument);
    } else if (data.title !== undefined) {
      saveCoordinator.persistDocumentNow(id, updates, internalPersistDocument);
    }
  },

  restoreVersion: async (versionId) => {
    const version = await db.documentVersions.get(versionId);
    if (!version) throw new Error('Version not found');

    const docId = version.docId;
    useEditorStore.getState().flushPendingDocumentUpdate(docId);

    // 1. Safely pause and flush any pending autosaves for this docId
    await saveCoordinator.pauseAndFlush(docId, internalPersistDocument);

    // 2. Run inside exclusive lock for docId
    return await saveCoordinator.runExclusive(docId, async () => {
      try {
        // 3. Perform ALL operations inside a single atomic Dexie transaction!
        const result = await db.transaction(
          'rw',
          [
            db.documents,
            db.documentVersions,
            db.assets,
            db.syncOutbox,
            db.syncEntityStatesV2,
            db.syncState,
          ],
          async (tx) => {
            const docTable = tx.table<Document, string>('documents');
            const verTable = tx.table<DocumentVersion, string>('documentVersions');
            const assetTable = tx.table('assets');

            const targetVer = await verTable.get(versionId);
            if (!targetVer) throw new Error('Target version not found');

            const latestDbDoc = await docTable.get(docId);
            if (!latestDbDoc) throw new Error('Document not found in DB');

            // Pre-flight check: verify all assetIds in targetVer content exist in IndexedDB and asset.docId === docId
            const requiredAssetIds = extractAssetIds(targetVer.content);
            const missingAssetIds: string[] = [];
            for (const assetId of requiredAssetIds) {
              const asset = await assetTable.get(assetId);
              if (!asset || !asset.blob || asset.docId !== docId) {
                missingAssetIds.push(assetId);
              }
            }

            if (missingAssetIds.length > 0) {
              return { restored: false, missingAssetIds };
            }

            const now = Date.now();

            // Backup current document state into documentVersions table before restoring
            const backupVersionId = `ver-${nanoid(12)}`;
            await verTable.add({
              id: backupVersionId,
              docId: docId,
              title: latestDbDoc.title,
              content: latestDbDoc.content,
              createdAt: now - 1,
              saveType: 'auto',
            });

            await enforceVersionLimitInTx(tx, docId);

            // Update document with target version content
            await docTable.update(docId, {
              title: targetVer.title,
              content: targetVer.content,
              updatedAt: now,
            });

            // 恢复版本入队 syncOutbox
            await enqueueMutationInTx(tx, [
              {
                entity_type: 'document',
                entity_id: docId,
                operation: 'upsert',
                base_revision: 0,
                data: {
                  kb_id: latestDbDoc.kbId,
                  group_id: latestDbDoc.groupId,
                  title: targetVer.title,
                  content: targetVer.content,
                  content_format: detectContentFormat(targetVer.content),
                  created_at: new Date(latestDbDoc.createdAt).toISOString(),
                },
              },
            ]);

            return {
              restored: true,
              title: targetVer.title,
              content: targetVer.content,
              updatedAt: now,
            };
          },
        );

        if (!result.restored || !result.title || !result.content || !result.updatedAt) {
          return { restored: false, missingAssetIds: result.missingAssetIds };
        }

        const {
          title: restoredTitle,
          content: restoredContent,
          updatedAt: restoredUpdatedAt,
        } = result;

        // 4. Update Zustand after transaction succeeds
        useKnowledgeBaseStore.setState((state) => ({
          documents: state.documents.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  title: restoredTitle,
                  content: restoredContent,
                  updatedAt: restoredUpdatedAt,
                }
              : d,
          ),
        }));

        // Run Asset GC after restoring
        runAssetGC(docId).catch((err) => console.error('Asset GC error after restore:', err));
        const restoredDocument = await db.documents.get(docId);
        if (restoredDocument) scheduleDocumentIndex(restoredDocument);
        void useSyncStore.getState().refreshCounts();

        return { restored: true };
      } finally {
        saveCoordinator.resume(docId, internalPersistDocument);
      }
    });
  },

  deleteDocument: async (id) => {
    let handle: DeleteHandle | null = null;

    try {
      useEditorStore.getState().flushPendingDocumentUpdate(id);
      handle = await saveCoordinator.prepareDelete([id]);

      await db.transaction(
        'rw',
        [
          db.documents,
          db.documentVersions,
          db.assets,
          db.favoriteItems,
          db.documentChunks,
          db.documentIndexStates,
          db.syncOutbox,
          db.syncEntityStatesV2,
          db.syncState,
        ],
        async (tx) => {
          await enqueueMutationInTx(tx, [
            {
              entity_type: 'document',
              entity_id: id,
              operation: 'delete',
              base_revision: 0,
            },
          ]);
          await deleteDocumentsCascadeInTx(tx, [id]);
        },
      );
    } catch (err) {
      const h = handle as DeleteHandle | null;
      if (h) h.rollback(internalPersistDocument);
      console.error(`Failed to delete document ${id} in Dexie transaction:`, err);
      throw err;
    }

    const h = handle as DeleteHandle | null;
    if (h) h.commit();
    void useSyncStore.getState().refreshCounts();

    try {
      useFavoritesStore.setState((state) => ({
        items: state.items.filter((item) => item.docId !== id),
      }));

      set((state) => ({
        documents: state.documents.filter((doc) => doc.id !== id),
      }));
    } catch (postCommitErr) {
      console.error(
        'Post-commit state sync failed, re-initializing stores from DB:',
        postCommitErr,
      );
      await Promise.all([get().initStore(), useFavoritesStore.getState().initStore()]);
    }
  },

  // Query helpers
  getKnowledgeBase: (id) => {
    return get().knowledgeBases.find((kb) => kb.id === id);
  },

  getGroupsByKb: (kbId) => {
    return get()
      .groups.filter((g) => g.kbId === kbId)
      .sort((a, b) => a.order - b.order);
  },

  getDocumentsByKb: (kbId) => {
    return get().documents.filter((d) => d.kbId === kbId);
  },

  getDocumentsByGroup: (groupId) => {
    return get().documents.filter((d) => d.groupId === groupId);
  },

  getRootDocuments: (kbId) => {
    return get().documents.filter((d) => d.kbId === kbId && d.groupId === null);
  },

  getChildGroups: (parentGroupId, kbId) => {
    return get()
      .groups.filter((g) => g.kbId === kbId && g.parentGroupId === parentGroupId)
      .sort((a, b) => a.order - b.order);
  },

  getGroupDepth: (groupId) => {
    const group = get().groups.find((g) => g.id === groupId);
    return group ? group.depth : 0;
  },

  getGroupAncestors: (groupId) => {
    const ancestors: Group[] = [];
    let currentId: string | null = groupId;
    const groups = get().groups;
    while (currentId) {
      const currentGroup = groups.find((g) => g.id === currentId);
      if (currentGroup) {
        ancestors.unshift(currentGroup);
        currentId = currentGroup.parentGroupId;
      } else {
        break;
      }
    }
    return ancestors;
  },

  getDescendantGroupIds: (groupId) => {
    const descendants: string[] = [];
    const traverse = (id: string) => {
      const children = get().groups.filter((g) => g.parentGroupId === id);
      children.forEach((child) => {
        descendants.push(child.id);
        traverse(child.id);
      });
    };
    traverse(groupId);
    return descendants;
  },

  // Memo operations
  getMemos: () => {
    return get().documents.filter((d) => d.kbId === MEMO_KB_ID);
  },

  createMemo: async (title = '未命名小记') => {
    if (get().knowledgeBases.some((kb) => kb.id === MEMO_KB_ID)) {
      return get().createDocument(MEMO_KB_ID, null, title);
    }

    const now = Date.now();
    const memoKnowledgeBase: KnowledgeBase = {
      id: MEMO_KB_ID,
      name: '小记',
      description: '轻量化小记知识库',
      icon: '#ec4899',
      createdAt: now,
      updatedAt: now,
    };
    const memo: Document = {
      id: `doc-${generateId()}`,
      kbId: MEMO_KB_ID,
      groupId: null,
      title,
      content: `<h1>${title}</h1><p></p>`,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({
      knowledgeBases: [...state.knowledgeBases, memoKnowledgeBase],
      documents: [...state.documents, memo],
    }));

    try {
      await db.transaction(
        'rw',
        [db.knowledgeBases, db.documents, db.syncOutbox, db.syncEntityStatesV2, db.syncState],
        async (tx) => {
          await tx.table('knowledgeBases').add(memoKnowledgeBase);
          await tx.table('documents').add(memo);
          await enqueueMutationInTx(tx, [
            {
              entity_type: 'knowledge_base',
              entity_id: MEMO_KB_ID,
              operation: 'upsert',
              base_revision: 0,
              data: {
                name: memoKnowledgeBase.name,
                description: memoKnowledgeBase.description,
                icon: memoKnowledgeBase.icon,
                created_at: new Date(now).toISOString(),
              },
            },
            {
              entity_type: 'document',
              entity_id: memo.id,
              operation: 'upsert',
              base_revision: 0,
              data: {
                kb_id: MEMO_KB_ID,
                group_id: null,
                title: memo.title,
                content: memo.content,
                content_format: detectContentFormat(memo.content),
                created_at: new Date(now).toISOString(),
              },
            },
          ]);
        },
      );
    } catch (error) {
      await get().reloadFromDb();
      throw error;
    }

    scheduleDocumentIndex(memo);
    void useSyncStore.getState().refreshCounts();
    return memo.id;
  },

  moveDocument: (id, targetKbId, targetGroupId) => {
    const updatedAt = Date.now();
    db.transaction(
      'rw',
      [db.documents, db.syncOutbox, db.syncEntityStatesV2, db.syncState],
      async (tx) => {
        const docTable = tx.table<Document, string>('documents');
        const existing = await docTable.get(id);
        if (!existing) return;
        const updated = { ...existing, kbId: targetKbId, groupId: targetGroupId, updatedAt };
        await docTable.put(updated);
        await enqueueMutationInTx(tx, [
          {
            entity_type: 'document',
            entity_id: id,
            operation: 'upsert',
            base_revision: 0,
            data: {
              kb_id: targetKbId,
              group_id: targetGroupId,
              title: updated.title,
              content: updated.content,
              content_format: detectContentFormat(updated.content),
              created_at: new Date(updated.createdAt).toISOString(),
            },
          },
        ]);
      },
    )
      .then(() => {
        updateDocumentChunkScope(id, targetKbId, targetKbId === MEMO_KB_ID ? 'memo' : 'document');
        void useSyncStore.getState().refreshCounts();
      })
      .catch((err) => console.error('Dexie error:', err));

    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, kbId: targetKbId, groupId: targetGroupId, updatedAt } : doc,
      ),
    }));
  },

  moveGroup: (groupId, targetKbId, targetParentGroupId) => {
    const G = get().groups.find((g) => g.id === groupId);
    if (!G) return { success: false, error: '未找到源分组' };

    // 1. Circularity check
    const descendantIds = get().getDescendantGroupIds(groupId);
    if (
      targetParentGroupId === groupId ||
      (targetParentGroupId && descendantIds.includes(targetParentGroupId))
    ) {
      return { success: false, error: '不能将分组移动到自身或其子分组下' };
    }

    // 2. Depth check
    const descendants = descendantIds
      .map((id) => get().groups.find((g) => g.id === id)!)
      .filter(Boolean);
    const oldDepthOfG = G.depth;
    let newDepthOfG = 0;
    if (targetParentGroupId) {
      const targetParent = get().groups.find((g) => g.id === targetParentGroupId);
      if (!targetParent) return { success: false, error: '未找到目标父分组' };
      newDepthOfG = targetParent.depth + 1;
    }

    const maxSubtreeDepthDiff = descendants.reduce(
      (max, d) => Math.max(max, d.depth - oldDepthOfG),
      0,
    );
    if (newDepthOfG + maxSubtreeDepthDiff > 5) {
      return { success: false, error: '移动后层级深度超过了系统最大 6 层限制' };
    }

    // 3. Move group, descendants and all their documents
    const allGroupIds = [groupId, ...descendantIds];
    const movedDocumentIds = get()
      .documents.filter((doc) => doc.groupId && allGroupIds.includes(doc.groupId))
      .map((doc) => doc.id);

    const now = Date.now();

    // 在同一个事务中原子更新 DB 并写入 syncOutbox 变更组
    db.transaction(
      'rw',
      [db.groups, db.documents, db.syncOutbox, db.syncEntityStatesV2, db.syncState],
      async (tx) => {
        const grpTable = tx.table<Group, string>('groups');
        const docTable = tx.table<Document, string>('documents');

        // 更新并构造移动分组的变更
        const updatedGroupList: Group[] = [];
        const movedG: Group = {
          ...G,
          kbId: targetKbId,
          parentGroupId: targetParentGroupId,
          depth: newDepthOfG,
          updatedAt: now,
        };
        await grpTable.put(movedG);
        updatedGroupList.push(movedG);

        for (const descId of descendantIds) {
          const descG = get().groups.find((g) => g.id === descId);
          if (descG) {
            const updatedDescG: Group = {
              ...descG,
              kbId: targetKbId,
              depth: newDepthOfG + (descG.depth - oldDepthOfG),
              updatedAt: now,
            };
            await grpTable.put(updatedDescG);
            updatedGroupList.push(updatedDescG);
          }
        }

        // 按深度递增排序（父先子后）构造 operations
        updatedGroupList.sort((a, b) => a.depth - b.depth);
        const operations: SyncOperation[] = updatedGroupList.map((g) => ({
          entity_type: 'group',
          entity_id: g.id,
          operation: 'upsert',
          base_revision: 0,
          data: {
            kb_id: g.kbId,
            parent_group_id: g.parentGroupId,
            name: g.name,
            sort_order: g.order,
            depth: g.depth,
            created_at: new Date(g.createdAt).toISOString(),
          },
        }));

        // 更新并构造所属文档变更
        const affectedDocs = await docTable.where('groupId').anyOf(allGroupIds).toArray();
        for (const doc of affectedDocs) {
          const updatedDoc: Document = {
            ...doc,
            kbId: targetKbId,
            updatedAt: now,
          };
          await docTable.put(updatedDoc);
          operations.push({
            entity_type: 'document',
            entity_id: doc.id,
            operation: 'upsert',
            base_revision: 0,
            data: {
              kb_id: updatedDoc.kbId,
              group_id: updatedDoc.groupId,
              title: updatedDoc.title,
              content: updatedDoc.content,
              content_format: detectContentFormat(updatedDoc.content),
              created_at: new Date(updatedDoc.createdAt).toISOString(),
            },
          });
        }

        await enqueueMutationInTx(tx, operations);
      },
    )
      .then(() => {
        void Promise.all(
          movedDocumentIds.map((docId) =>
            updateDocumentChunkScope(
              docId,
              targetKbId,
              targetKbId === MEMO_KB_ID ? 'memo' : 'document',
            ),
          ),
        ).catch((err) =>
          console.error('[LocalRAG] Failed to update moved document index metadata:', err),
        );
        void useSyncStore.getState().refreshCounts();
      })
      .catch((err) => console.error('Move group transaction failed:', err));

    set((state) => {
      // Update groups in memory
      const updatedGroups = state.groups.map((g) => {
        if (g.id === groupId) {
          return {
            ...g,
            kbId: targetKbId,
            parentGroupId: targetParentGroupId,
            depth: newDepthOfG,
            updatedAt: now,
          };
        } else if (descendantIds.includes(g.id)) {
          return {
            ...g,
            kbId: targetKbId,
            depth: newDepthOfG + (g.depth - oldDepthOfG),
            updatedAt: now,
          };
        }
        return g;
      });

      // Update documents in memory
      const updatedDocs = state.documents.map((doc) => {
        if (doc.groupId && allGroupIds.includes(doc.groupId)) {
          return {
            ...doc,
            kbId: targetKbId,
            updatedAt: now,
          };
        }
        return doc;
      });

      return {
        groups: updatedGroups,
        documents: updatedDocs,
      };
    });

    return { success: true };
  },
}));
