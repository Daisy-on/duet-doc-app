import { create } from 'zustand';
import { db } from '../db';
import { cloudSyncService, type SyncConflict } from '../sync/CloudSyncService';
import {
  enqueueMutationInTx,
  detectContentFormat,
  DEFAULT_WORKSPACE_ID,
  DEFAULT_USER_ID,
} from '../sync/syncOutboxHelper';
import type { SyncEntityStateV2, SyncEntityType, SyncOperation } from '../db';
import { toChatMessageSyncData, toChatSessionSyncData } from '../sync/chatSyncMapper';

export { DEFAULT_WORKSPACE_ID, DEFAULT_USER_ID };

export type SyncUiStatus = 'idle' | 'syncing' | 'error' | 'offline';

// Version 4 normalizes legacy session activity time from the latest message
// and sends it to the server instead of using the migration upload time.
const CHAT_BACKFILL_VERSION = 4;
const MISSING_CHAT_SESSION_ERROR = 'Chat message has no active session';

interface SyncStore {
  workspaceId: string;
  userId: string;
  serverUrl: string;
  status: SyncUiStatus;
  pendingCount: number;
  errorCount: number;
  lastSyncAt: number | null;
  errorMessage: string | null;
  conflicts: SyncConflict[];
  remoteSequence: number | null;
  hasRemoteUpdates: boolean;

  initSyncStore: () => Promise<void>;
  checkRemoteUpdates: () => Promise<void>;
  refreshCounts: () => Promise<{ pending: number; error: number }>;
  enqueueExistingLocalDataIfNeeded: () => Promise<number>;
  enqueueExistingChatsIfNeeded: () => Promise<number>;
  triggerSync: () => Promise<{ success: boolean; error?: string }>;
  retryErrors: () => Promise<void>;
  resolveConflict: (
    conflict: SyncConflict,
    resolution: 'keep-local' | 'use-cloud',
  ) => Promise<void>;
}

let remoteStatusRequest: Promise<void> | null = null;

export const useSyncStore = create<SyncStore>((set, get) => ({
  workspaceId: DEFAULT_WORKSPACE_ID,
  userId: DEFAULT_USER_ID,
  serverUrl: '',
  status: 'idle',
  pendingCount: 0,
  errorCount: 0,
  lastSyncAt: null,
  errorMessage: null,
  conflicts: [],
  remoteSequence: null,
  hasRemoteUpdates: false,

  initSyncStore: async () => {
    try {
      const wid = get().workspaceId;
      const state = await db.syncState.get(wid);
      const [pending, errors, conflicts] = await Promise.all([
        db.syncOutbox.where('status').equals('pending').count(),
        db.syncOutbox.where('status').equals('error').count(),
        cloudSyncService.listConflicts(wid),
      ]);

      const firstError =
        errors > 0 ? await db.syncOutbox.where('status').equals('error').first() : null;

      set({
        lastSyncAt: state?.lastSyncAt ?? null,
        pendingCount: pending,
        errorCount: errors,
        conflicts,
        status: errors > 0 || conflicts.length > 0 ? 'error' : 'idle',
        errorMessage:
          firstError?.errorReason ||
          (errors > 0
            ? '存在未解决的同步异常'
            : conflicts.length > 0
              ? `存在 ${conflicts.length} 项云端冲突`
              : null),
      });

      // 检查并对未登记过的本地存量数据执行入队
      await get().enqueueExistingLocalDataIfNeeded();
      await get().enqueueExistingChatsIfNeeded();
      void get()
        .checkRemoteUpdates()
        .catch(() => undefined);
    } catch (err) {
      console.error('[SyncStore] Failed to initialize sync store:', err);
      set({
        status: 'offline',
        errorMessage: err instanceof Error ? err.message : '无法连接云端同步服务',
      });
    }
  },

  checkRemoteUpdates: async () => {
    if (remoteStatusRequest) return remoteStatusRequest;

    remoteStatusRequest = (async () => {
      const workspaceId = get().workspaceId;
      const [remoteSequence, state] = await Promise.all([
        cloudSyncService.getRemoteSequence(workspaceId),
        db.syncState.get(workspaceId),
      ]);
      set({
        remoteSequence,
        hasRemoteUpdates: remoteSequence > (state?.pullCursor ?? 0),
      });
    })();

    try {
      await remoteStatusRequest;
    } finally {
      remoteStatusRequest = null;
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

  enqueueExistingChatsIfNeeded: async () => {
    const workspaceId = get().workspaceId;
    const syncState = await db.syncState.get(workspaceId);
    if ((syncState?.chatBackfillVersion ?? 0) >= CHAT_BACKFILL_VERSION) return 0;

    const [sessions, messages, initialOutboxEntries] = await Promise.all([
      db.chatSessions.toArray(),
      db.chatMessages.orderBy('createdAt').toArray(),
      db.syncOutbox.where('workspaceId').equals(workspaceId).toArray(),
    ]);
    const existingSessionIds = new Set(sessions.map((session) => session.id));
    const orphanMessageIds = new Set(
      messages
        .filter((message) => !existingSessionIds.has(message.sessionId))
        .map((message) => message.id),
    );
    const messageData = new Map(
      messages
        .filter((message) => existingSessionIds.has(message.sessionId))
        .map((message) => [message, toChatMessageSyncData(message)] as const)
        .filter((entry) => entry[1] !== null),
    );
    const latestMessageAt = new Map<string, number>();
    for (const message of messageData.keys()) {
      latestMessageAt.set(
        message.sessionId,
        Math.max(latestMessageAt.get(message.sessionId) ?? 0, message.createdAt),
      );
    }
    const validSessionIds = new Set([...messageData.keys()].map((message) => message.sessionId));
    const validSessions = sessions
      .filter((session) => validSessionIds.has(session.id))
      .map((session) => ({
        ...session,
        updatedAt: Math.max(
          session.createdAt,
          latestMessageAt.get(session.id) ?? session.createdAt,
        ),
      }));

    let repairedOutboxEntries = false;
    if (orphanMessageIds.size > 0) {
      await db.transaction('rw', [db.syncOutbox, db.syncEntityStatesV2], async (tx) => {
        const outbox = tx.table('syncOutbox');
        const states = tx.table('syncEntityStatesV2');

        for (const entry of initialOutboxEntries) {
          const operations = entry.operations.filter(
            (operation) =>
              operation.entity_type !== 'chat_message' ||
              operation.operation !== 'upsert' ||
              !orphanMessageIds.has(operation.entity_id),
          );
          if (operations.length === entry.operations.length) continue;

          repairedOutboxEntries = true;
          if (operations.length === 0) {
            await outbox.delete(entry.mutationId);
          } else {
            const repairsMissingParentError =
              entry.status === 'error' && entry.errorReason === MISSING_CHAT_SESSION_ERROR;
            await outbox.update(entry.mutationId, {
              operations,
              status: repairsMissingParentError ? 'pending' : entry.status,
              errorCode: repairsMissingParentError ? undefined : entry.errorCode,
              errorReason: repairsMissingParentError ? undefined : entry.errorReason,
            });
          }
        }

        await states.bulkDelete(
          [...orphanMessageIds].map((messageId) => [workspaceId, 'chat_message', messageId]),
        );
      });

      if (import.meta.env.DEV) {
        console.warn(
          `[CloudSync] Skipped ${orphanMessageIds.size} legacy chat messages without a parent session.`,
        );
      }
    }

    const outboxEntries = repairedOutboxEntries
      ? await db.syncOutbox.where('workspaceId').equals(workspaceId).toArray()
      : initialOutboxEntries;
    const queuedEntities = new Set(
      outboxEntries
        .filter((entry) => entry.workspaceId === workspaceId)
        .flatMap((entry) =>
          entry.operations.map((operation) => `${operation.entity_type}:${operation.entity_id}`),
        ),
    );
    const sessionsToCheck = validSessions.filter(
      (session) => !queuedEntities.has(`chat_session:${session.id}`),
    );
    const messagesToCheck = [...messageData.keys()].filter(
      (message) => !queuedEntities.has(`chat_message:${message.id}`),
    );
    const hasEntitiesToCheck = sessionsToCheck.length > 0 || messagesToCheck.length > 0;
    const remoteRevisions = hasEntitiesToCheck
      ? await cloudSyncService.loadRemoteRevisions(workspaceId)
      : new Map<string, number>();

    await db.transaction(
      'rw',
      [db.chatSessions, db.syncOutbox, db.syncEntityStatesV2, db.syncState],
      async (tx) => {
        const states = tx.table<SyncEntityStateV2, [string, SyncEntityType, string]>(
          'syncEntityStatesV2',
        );
        const stateTable = tx.table('syncState');
        const current = await stateTable.get(workspaceId);
        if (!current) {
          await stateTable.put({
            workspaceId,
            pullCursor: 0,
            serverUrl: window.location.origin,
            userId: get().userId,
            lastSyncAt: null,
            nextOutboxSequence: 1,
          });
        }

        await tx.table('chatSessions').bulkPut(validSessions);

        const operations: SyncOperation[] = [];
        for (const session of sessionsToCheck) {
          const entityKey = `chat_session:${session.id}`;
          const remoteRevision = remoteRevisions.get(entityKey);
          await states.put({
            workspaceId,
            entityType: 'chat_session',
            entityId: session.id,
            serverRev: remoteRevision ?? 0,
            localMutationSeq: 0,
            updatedAt: Date.now(),
          });
          operations.push({
            entity_type: 'chat_session',
            entity_id: session.id,
            operation: 'upsert',
            base_revision: remoteRevision ?? 0,
            data: toChatSessionSyncData(session),
          });
        }
        for (const message of messagesToCheck) {
          const entityKey = `chat_message:${message.id}`;
          const remoteRevision = remoteRevisions.get(entityKey);
          await states.put({
            workspaceId,
            entityType: 'chat_message',
            entityId: message.id,
            serverRev: remoteRevision ?? 0,
            localMutationSeq: 0,
            updatedAt: Date.now(),
          });
          if (remoteRevision === undefined) {
            operations.push({
              entity_type: 'chat_message',
              entity_id: message.id,
              operation: 'upsert',
              base_revision: 0,
              data: messageData.get(message)!,
            });
          }
        }

        await enqueueMutationInTx(tx, operations, workspaceId);
        const latest = await stateTable.get(workspaceId);
        await stateTable.put({
          ...latest,
          workspaceId,
          chatBackfillVersion: CHAT_BACKFILL_VERSION,
        });
      },
    );

    const counts = await get().refreshCounts();
    if (repairedOutboxEntries && counts.error === 0) {
      set({ status: 'idle', errorMessage: null });
    }
    return counts.pending;
  },

  triggerSync: async () => {
    if (get().status === 'syncing') {
      return { success: false, error: '正在同步中' };
    }

    set({ status: 'syncing', errorMessage: null });

    try {
      await get().enqueueExistingLocalDataIfNeeded();
      await get().enqueueExistingChatsIfNeeded();
      const res = await cloudSyncService.synchronize(get().workspaceId);
      const [{ useKnowledgeBaseStore }, { useAIWritingStore }] = await Promise.all([
        import('./knowledgeBaseStore'),
        import('./aiWritingStore'),
      ]);
      await Promise.all([
        useKnowledgeBaseStore.getState().reloadFromDb(),
        useAIWritingStore.getState().reloadFromDb(),
      ]);
      const counts = await get().refreshCounts();
      const conflicts = await cloudSyncService.listConflicts(get().workspaceId);
      const now = Date.now();

      if (res.success) {
        window.localStorage.setItem('duet-doc:cloud-sync-enabled', 'true');
        set({
          status: counts.error > 0 || conflicts.length > 0 ? 'error' : 'idle',
          pendingCount: counts.pending,
          errorCount: counts.error,
          conflicts,
          lastSyncAt: now,
          errorMessage: null,
          hasRemoteUpdates: false,
        });
        void get()
          .checkRemoteUpdates()
          .catch(() => undefined);
        return { success: true };
      }

      set({
        status: 'error',
        pendingCount: counts.pending,
        errorCount: counts.error,
        conflicts,
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
      await get().triggerSync();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ status: 'error', errorMessage: message });
      await get().refreshCounts();
    }
  },

  resolveConflict: async (conflict, resolution) => {
    try {
      set({ status: 'syncing', errorMessage: null });
      await cloudSyncService.resolveConflict(conflict, resolution);
      const [{ useKnowledgeBaseStore }, { useAIWritingStore }] = await Promise.all([
        import('./knowledgeBaseStore'),
        import('./aiWritingStore'),
      ]);
      await Promise.all([
        useKnowledgeBaseStore.getState().reloadFromDb(),
        useAIWritingStore.getState().reloadFromDb(),
      ]);
      const conflicts = await cloudSyncService.listConflicts(get().workspaceId);
      set({
        conflicts,
        status: conflicts.length > 0 ? 'error' : 'idle',
        errorMessage: conflicts.length > 0 ? `仍有 ${conflicts.length} 项云端冲突` : null,
      });
      await get().refreshCounts();
      if (conflicts.length === 0) await get().triggerSync();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ status: 'error', errorMessage: message });
    }
  },
}));
