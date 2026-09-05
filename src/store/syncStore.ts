import { create } from 'zustand';
import { db } from '../db';
import { cloudSyncService } from '../sync/CloudSyncService';
import {
  enqueueMutationInTx,
  detectContentFormat,
  DEFAULT_WORKSPACE_ID,
  DEFAULT_USER_ID,
} from '../sync/syncOutboxHelper';
import type { SyncEntityStateV2, SyncEntityType, SyncOperation } from '../db';

export { DEFAULT_WORKSPACE_ID, DEFAULT_USER_ID };

export type SyncUiStatus = 'idle' | 'syncing' | 'error' | 'offline';

interface SyncStore {
  workspaceId: string;
  userId: string;
  serverUrl: string;
  status: SyncUiStatus;
  pendingCount: number;
  errorCount: number;
  lastSyncAt: number | null;
  errorMessage: string | null;

  initSyncStore: () => Promise<void>;
  refreshCounts: () => Promise<{ pending: number; error: number }>;
  enqueueExistingLocalDataIfNeeded: () => Promise<number>;
  triggerPush: () => Promise<{ success: boolean; error?: string }>;
  retryErrors: () => Promise<void>;
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  workspaceId: DEFAULT_WORKSPACE_ID,
  userId: DEFAULT_USER_ID,
  serverUrl: '',
  status: 'idle',
  pendingCount: 0,
  errorCount: 0,
  lastSyncAt: null,
  errorMessage: null,

  initSyncStore: async () => {
    try {
      const wid = get().workspaceId;
      const state = await db.syncState.get(wid);
      const [pending, errors] = await Promise.all([
        db.syncOutbox.where('status').equals('pending').count(),
        db.syncOutbox.where('status').equals('error').count(),
      ]);

      const firstError =
        errors > 0 ? await db.syncOutbox.where('status').equals('error').first() : null;

      set({
        lastSyncAt: state?.lastSyncAt ?? null,
        pendingCount: pending,
        errorCount: errors,
        status: errors > 0 ? 'error' : 'idle',
        errorMessage: firstError?.errorReason || (errors > 0 ? '存在未解决的同步异常' : null),
      });

      // 检查并对未登记过的本地存量数据执行入队
      await get().enqueueExistingLocalDataIfNeeded();
    } catch (err) {
      console.error('[SyncStore] Failed to initialize sync store:', err);
      set({
        status: 'offline',
        errorMessage: err instanceof Error ? err.message : '无法连接云端同步服务',
      });
    }
  },

  refreshCounts: async () => {
    try {
      const [pending, errors] = await Promise.all([
        db.syncOutbox.where('status').equals('pending').count(),
        db.syncOutbox.where('status').equals('error').count(),
      ]);
      set((state) => ({
        pendingCount: pending,
        errorCount: errors,
        status: errors > 0 && state.status !== 'syncing' ? 'error' : state.status,
      }));
      return { pending, error: errors };
    } catch {
      return { pending: 0, error: 0 };
    }
  },

  enqueueExistingLocalDataIfNeeded: async () => {
    const wid = get().workspaceId;
    try {
      const [kbCount, entityStateCount] = await Promise.all([
        db.knowledgeBases.count(),
        db.syncEntityStatesV2.where('workspaceId').equals(wid).count(),
      ]);

      // 若已有存量实体且 syncEntityStatesV2 为空，执行首次全量入队
      if (kbCount > 0 && entityStateCount === 0) {
        // A browser may have lost its local sync metadata while the same data is
        // already present in PostgreSQL. Read remote revisions before creating
        // the first outbox batch so existing entities are updated, not recreated.
        const remoteRevisions = await cloudSyncService.loadRemoteRevisions(wid);
        const [kbs, rawGroups, docs] = await Promise.all([
          db.knowledgeBases.toArray(),
          db.groups.toArray(),
          db.documents.toArray(),
        ]);

        // 按深度递增排序分组，保证父分组先于子分组
        const groups = rawGroups.sort((a, b) => a.depth - b.depth);

        const operations: SyncOperation[] = [];

        // 1. 知识库
        for (const kb of kbs) {
          operations.push({
            entity_type: 'knowledge_base',
            entity_id: kb.id,
            operation: 'upsert',
            base_revision: 0,
            data: {
              name: kb.name,
              description: kb.description,
              icon: kb.icon,
              created_at: new Date(kb.createdAt).toISOString(),
            },
          });
        }

        // 2. 分组
        for (const g of groups) {
          operations.push({
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
          });
        }

        // 3. 文档（使用 detectContentFormat 智能嗅探格式）
        for (const d of docs) {
          operations.push({
            entity_type: 'document',
            entity_id: d.id,
            operation: 'upsert',
            base_revision: 0,
            data: {
              kb_id: d.kbId,
              group_id: d.groupId,
              title: d.title,
              content: d.content,
              content_format: detectContentFormat(d.content),
              created_at: new Date(d.createdAt).toISOString(),
            },
          });
        }

        if (operations.length > 0) {
          await db.transaction(
            'rw',
            [db.syncOutbox, db.syncEntityStatesV2, db.syncState],
            async (tx) => {
              const entityStates = tx.table<SyncEntityStateV2, [string, SyncEntityType, string]>(
                'syncEntityStatesV2',
              );
              for (const operation of operations) {
                await entityStates.put({
                  workspaceId: wid,
                  entityType: operation.entity_type,
                  entityId: operation.entity_id,
                  serverRev:
                    remoteRevisions.get(`${operation.entity_type}:${operation.entity_id}`) ?? 0,
                  localMutationSeq: 0,
                  updatedAt: Date.now(),
                });
              }
              await enqueueMutationInTx(tx, operations, wid);
            },
          );
        }

        const counts = await get().refreshCounts();
        return counts.pending;
      }
    } catch (err) {
      console.error('[SyncStore] Failed to enqueue existing local data:', err);
      throw err;
    }
    return 0;
  },

  triggerPush: async () => {
    if (get().status === 'syncing') {
      return { success: false, error: '正在同步中' };
    }

    set({ status: 'syncing', errorMessage: null });

    try {
      await get().enqueueExistingLocalDataIfNeeded();
      const res = await cloudSyncService.pushAll();
      const counts = await get().refreshCounts();
      const now = Date.now();

      if (res.success) {
        set({
          status: counts.error > 0 ? 'error' : 'idle',
          pendingCount: counts.pending,
          errorCount: counts.error,
          lastSyncAt: now,
          errorMessage: null,
        });
        return { success: true };
      }

      set({
        status: 'error',
        pendingCount: counts.pending,
        errorCount: counts.error,
        errorMessage: res.error || '同步失败',
      });
      return { success: false, error: res.error };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ status: 'error', errorMessage: msg });
      await get().refreshCounts();
      return { success: false, error: msg };
    }
  },

  retryErrors: async () => {
    try {
      set({ status: 'syncing', errorMessage: null });
      const result = await cloudSyncService.retryErrors();
      await get().refreshCounts();
      if (result.unresolved > 0) {
        set({
          status: 'error',
          errorMessage: `${result.unresolved} 个冲突需要手动处理，未自动覆盖云端数据。`,
        });
        return;
      }
      set({ status: 'idle' });
      await get().triggerPush();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ status: 'error', errorMessage: message });
      await get().refreshCounts();
    }
  },
}));
