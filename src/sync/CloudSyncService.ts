import type { Transaction } from 'dexie';
import { db, deleteDocumentsCascadeInTx } from '../db';
import type {
  SyncConflictData,
  SyncEntityStateV2,
  SyncEntityType,
  SyncOutboxEntry,
  SyncRemoteSnapshot,
  SyncState,
} from '../db';
import type { Document, Group, KnowledgeBase } from '../store/knowledgeBaseStore';
import type {
  ChatMessage,
  ChatSession,
  KnowledgeSource,
  ReferencedDoc,
} from '../store/aiWritingStore';
import type { AIResponseMetadata } from '../ai/types';
import { scheduleDocumentIndex } from '../rag/documentIndexer';

export interface PushResult {
  success: boolean;
  pushedCount?: number;
  error?: string;
  conflict?: boolean;
}

export interface SyncResult extends PushResult {
  pulledCount?: number;
  conflictCount?: number;
}

interface PullChange {
  sequence: number;
  entity_type: SyncEntityType;
  entity_id: string;
  snapshot: SyncRemoteSnapshot;
}

export interface SyncConflict {
  workspaceId: string;
  entityType: SyncEntityType;
  entityId: string;
  data: SyncConflictData;
}

export interface PullResult {
  appliedCount: number;
  conflictCount: number;
  changedDocumentIds: string[];
}

interface PullResponse {
  changes: PullChange[];
  next_cursor: number;
  has_more: boolean;
}

interface SyncStatusResponse {
  workspace_id: string;
  current_sequence: number;
}

const entityKey = (entityType: SyncEntityType, entityId: string) => `${entityType}:${entityId}`;

function readConflictCode(entry: SyncOutboxEntry): string | undefined {
  if (entry.errorCode) return entry.errorCode;
  if (!entry.errorReason) return undefined;
  try {
    return (JSON.parse(entry.errorReason) as { code?: string }).code;
  } catch {
    return undefined;
  }
}

function requiredString(snapshot: Record<string, unknown>, field: string): string {
  const value = snapshot[field];
  if (typeof value !== 'string') throw new Error(`云端快照缺少字段：${field}`);
  return value;
}

function nullableString(snapshot: Record<string, unknown>, field: string): string | null {
  const value = snapshot[field];
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`云端快照字段格式错误：${field}`);
  return value;
}

function timestamp(snapshot: Record<string, unknown>, field: string): number {
  const value = requiredString(snapshot, field);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`云端时间字段格式错误：${field}`);
  return parsed;
}

function requiredBoolean(snapshot: Record<string, unknown>, field: string): boolean {
  const value = snapshot[field];
  if (typeof value !== 'boolean') throw new Error(`云端快照字段格式错误：${field}`);
  return value;
}

function objectArray(snapshot: Record<string, unknown>, field: string): Record<string, unknown>[] {
  const value = snapshot[field];
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object')) {
    throw new Error(`云端快照字段格式错误：${field}`);
  }
  return value as Record<string, unknown>[];
}

function parseKnowledgeSources(snapshot: SyncRemoteSnapshot): KnowledgeSource[] {
  return objectArray(snapshot, 'knowledge_sources').map((source) => {
    const sourceType = requiredString(source, 'source_type');
    const chunkIndex = source.chunk_index;
    const headingPath = source.heading_path;
    if (
      (sourceType !== 'document' && sourceType !== 'memo') ||
      typeof chunkIndex !== 'number' ||
      !Array.isArray(headingPath) ||
      headingPath.some((heading) => typeof heading !== 'string')
    ) {
      throw new Error('云端知识来源格式错误');
    }
    return {
      sourceId: requiredString(source, 'source_id'),
      sourceType,
      title: requiredString(source, 'title'),
      chunkIndex,
      headingPath,
    };
  });
}

async function applyRemoteSnapshot(
  tx: Transaction,
  change: PullChange,
): Promise<'upserted-document' | 'other'> {
  const { entity_type: entityType, entity_id: entityId, snapshot } = change;
  if (snapshot.deleted_at !== null) {
    if (entityType === 'document') {
      await deleteDocumentsCascadeInTx(tx, [entityId]);
    } else if (entityType === 'group') {
      await tx.table('groups').delete(entityId);
    } else if (entityType === 'knowledge_base') {
      await tx.table('knowledgeBases').delete(entityId);
    } else if (entityType === 'chat_message') {
      await tx.table('chatMessages').delete(entityId);
    } else {
      const messageIds = await tx
        .table('chatMessages')
        .where('sessionId')
        .equals(entityId)
        .primaryKeys();
      await tx.table('chatSessions').delete(entityId);
      await tx.table('chatMessages').where('sessionId').equals(entityId).delete();
      const workspaceId = requiredString(snapshot, 'workspace_id');
      await tx
        .table('syncEntityStatesV2')
        .bulkDelete(messageIds.map((id) => [workspaceId, 'chat_message', id]));
    }
    return 'other';
  }

  if (entityType === 'knowledge_base') {
    const row: KnowledgeBase = {
      id: entityId,
      name: requiredString(snapshot, 'name'),
      description: requiredString(snapshot, 'description'),
      icon: requiredString(snapshot, 'icon'),
      createdAt: timestamp(snapshot, 'created_at'),
      updatedAt: timestamp(snapshot, 'updated_at'),
    };
    await tx.table('knowledgeBases').put(row);
    return 'other';
  }

  if (entityType === 'group') {
    const order = snapshot.sort_order;
    const depth = snapshot.depth;
    if (typeof order !== 'number' || typeof depth !== 'number') {
      throw new Error('云端分组排序字段格式错误');
    }
    const row: Group = {
      id: entityId,
      kbId: requiredString(snapshot, 'kb_id'),
      parentGroupId: nullableString(snapshot, 'parent_group_id'),
      name: requiredString(snapshot, 'name'),
      order,
      depth,
      createdAt: timestamp(snapshot, 'created_at'),
      updatedAt: timestamp(snapshot, 'updated_at'),
    };
    await tx.table('groups').put(row);
    return 'other';
  }

  if (entityType === 'chat_session') {
    const row: ChatSession = {
      id: entityId,
      title: requiredString(snapshot, 'title'),
      isPinned: requiredBoolean(snapshot, 'is_pinned'),
      createdAt: timestamp(snapshot, 'created_at'),
      updatedAt: timestamp(snapshot, 'updated_at'),
    };
    await tx.table('chatSessions').put(row);
    return 'other';
  }

  if (entityType === 'chat_message') {
    const role = requiredString(snapshot, 'role');
    const status = requiredString(snapshot, 'status');
    if (role !== 'user' && role !== 'assistant') throw new Error('云端聊天角色格式错误');
    if (status !== 'complete' && status !== 'stopped' && status !== 'error') {
      throw new Error('云端聊天状态格式错误');
    }

    const webSearchUrls = objectArray(snapshot, 'web_search_urls').map((item) => ({
      title: requiredString(item, 'title'),
      url: requiredString(item, 'url'),
    }));
    const referencedDocs: ReferencedDoc[] = objectArray(snapshot, 'referenced_docs').map(
      (item) => ({
        id: requiredString(item, 'id'),
        title: requiredString(item, 'title'),
      }),
    );
    const rawMetadata = snapshot.ai_metadata;
    if (rawMetadata !== null && (typeof rawMetadata !== 'object' || Array.isArray(rawMetadata))) {
      throw new Error('云端 AI 元数据格式错误');
    }
    const row: ChatMessage = {
      id: entityId,
      sessionId: requiredString(snapshot, 'session_id'),
      role,
      content: requiredString(snapshot, 'content'),
      status,
      webSearchUrls,
      referencedDocs,
      knowledgeSources: parseKnowledgeSources(snapshot),
      aiMetadata: (rawMetadata as AIResponseMetadata | null) ?? undefined,
      createdAt: timestamp(snapshot, 'created_at'),
    };
    const sessions = tx.table<ChatSession, string>('chatSessions');
    await tx.table('chatMessages').put(row);
    const parent = await sessions.get(row.sessionId);
    if (parent && row.createdAt > parent.updatedAt) {
      await sessions.update(row.sessionId, { updatedAt: row.createdAt });
    }
    return 'other';
  }

  const row: Document = {
    id: entityId,
    kbId: requiredString(snapshot, 'kb_id'),
    groupId: nullableString(snapshot, 'group_id'),
    title: requiredString(snapshot, 'title'),
    content: requiredString(snapshot, 'content'),
    createdAt: timestamp(snapshot, 'created_at'),
    updatedAt: timestamp(snapshot, 'updated_at'),
  };
  await tx.table('documents').put(row);
  return 'upserted-document';
}

export class CloudSyncService {
  async getRemoteSequence(workspaceId: string): Promise<number> {
    const params = new URLSearchParams({ workspace_id: workspaceId });
    const response = await fetch(`/api/v1/sync/status?${params.toString()}`);
    if (!response.ok) throw new Error(`读取云端同步状态失败（HTTP ${response.status}）`);

    const data = (await response.json()) as SyncStatusResponse;
    if (data.workspace_id !== workspaceId || !Number.isSafeInteger(data.current_sequence)) {
      throw new Error('云端同步状态格式错误');
    }
    return data.current_sequence;
  }

  async loadRemoteRevisions(workspaceId: string): Promise<Map<string, number>> {
    const revisions = new Map<string, number>();
    let cursor = 0;

    while (true) {
      const params = new URLSearchParams({
        workspace_id: workspaceId,
        cursor: String(cursor),
        limit: '200',
      });
      const response = await fetch(`/api/v1/sync/pull?${params.toString()}`);
      if (!response.ok) throw new Error(`读取云端版本失败（HTTP ${response.status}）`);

      const page = (await response.json()) as PullResponse;
      for (const change of page.changes) {
        revisions.set(entityKey(change.entity_type, change.entity_id), change.snapshot.revision);
      }
      if (!page.has_more) break;
      if (page.next_cursor <= cursor) throw new Error('云端同步游标没有继续前进');
      cursor = page.next_cursor;
    }

    return revisions;
  }

  async listConflicts(workspaceId: string): Promise<SyncConflict[]> {
    const states = await db.syncEntityStatesV2.where('workspaceId').equals(workspaceId).toArray();
    return states
      .filter((state) => state.conflict !== undefined)
      .map((state) => ({
        workspaceId: state.workspaceId,
        entityType: state.entityType,
        entityId: state.entityId,
        data: state.conflict!,
      }));
  }

  private async pullAllUnlocked(workspaceId: string): Promise<PullResult> {
    const syncState = await db.syncState.get(workspaceId);
    let cursor = syncState?.pullCursor ?? 0;
    let appliedCount = 0;
    const changedDocumentIds = new Set<string>();

    while (true) {
      const params = new URLSearchParams({
        workspace_id: workspaceId,
        cursor: String(cursor),
        limit: '200',
      });
      const response = await fetch(`/api/v1/sync/pull?${params.toString()}`);
      if (!response.ok) throw new Error(`拉取云端数据失败（HTTP ${response.status}）`);
      const page = (await response.json()) as PullResponse;

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
          db.chatSessions,
          db.chatMessages,
          db.syncOutbox,
          db.syncEntityStatesV2,
          db.syncState,
        ],
        async (tx) => {
          const outbox = tx.table<SyncOutboxEntry, string>('syncOutbox');
          const entityStates = tx.table<SyncEntityStateV2, [string, string, string]>(
            'syncEntityStatesV2',
          );
          const pendingEntries = await outbox.toArray();

          for (const change of page.changes) {
            const stateKey: [string, SyncEntityType, string] = [
              workspaceId,
              change.entity_type,
              change.entity_id,
            ];
            const state = await entityStates.get(stateKey);
            if (change.snapshot.revision <= (state?.serverRev ?? 0)) continue;

            const hasLocalMutation = pendingEntries.some((entry) =>
              entry.operations.some(
                (operation) =>
                  operation.entity_type === change.entity_type &&
                  operation.entity_id === change.entity_id,
              ),
            );
            if (hasLocalMutation) {
              await entityStates.put({
                workspaceId,
                entityType: change.entity_type,
                entityId: change.entity_id,
                serverRev: state?.serverRev ?? 0,
                localMutationSeq: state?.localMutationSeq ?? 1,
                updatedAt: Date.now(),
                conflict: {
                  remoteRevision: change.snapshot.revision,
                  snapshot: change.snapshot,
                  detectedAt: Date.now(),
                },
              });
              continue;
            }

            const applied = await applyRemoteSnapshot(tx, change);
            if (applied === 'upserted-document') changedDocumentIds.add(change.entity_id);
            await entityStates.put({
              workspaceId,
              entityType: change.entity_type,
              entityId: change.entity_id,
              serverRev: change.snapshot.revision,
              localMutationSeq: state?.localMutationSeq ?? 0,
              updatedAt: Date.now(),
            });
            appliedCount += 1;
          }

          const current = await tx.table<SyncState, string>('syncState').get(workspaceId);
          await tx.table<SyncState, string>('syncState').put({
            workspaceId,
            pullCursor: page.next_cursor,
            serverUrl: current?.serverUrl ?? window.location.origin,
            userId: current?.userId ?? '00000000-0000-0000-0000-000000000001',
            lastSyncAt: Date.now(),
            nextOutboxSequence: current?.nextOutboxSequence,
            chatBackfillVersion: current?.chatBackfillVersion,
          });
        },
      );

      if (!page.has_more) break;
      if (page.next_cursor <= cursor) throw new Error('云端同步游标没有继续前进');
      cursor = page.next_cursor;
    }

    for (const documentId of changedDocumentIds) {
      const document = await db.documents.get(documentId);
      if (document) scheduleDocumentIndex(document);
    }
    const conflicts = await this.listConflicts(workspaceId);
    return {
      appliedCount,
      conflictCount: conflicts.length,
      changedDocumentIds: [...changedDocumentIds],
    };
  }

  async pullAll(workspaceId: string): Promise<PullResult> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('duet-doc:sync-lock', async () =>
        this.pullAllUnlocked(workspaceId),
      );
    }
    return this.pullAllUnlocked(workspaceId);
  }

  private async claimNext(): Promise<SyncOutboxEntry | null> {
    return db.transaction('rw', db.syncOutbox, async (tx) => {
      const outbox = tx.table<SyncOutboxEntry, string>('syncOutbox');
      const first = await outbox.orderBy('queueSequence').first();
      if (!first) return null;
      if (first.status === 'error') throw new Error('SYNC_QUEUE_BLOCKED');
      if (first.status === 'pushing') throw new Error('SYNC_QUEUE_BUSY');

      await outbox.update(first.mutationId, {
        status: 'pushing',
        errorCode: undefined,
        errorReason: undefined,
      });
      return {
        ...first,
        operations: first.operations.map((operation) => ({
          ...operation,
          data: operation.data ? { ...operation.data } : undefined,
        })),
        status: 'pushing',
      };
    });
  }

  async pushNext(): Promise<{
    hasMore: boolean;
    success: boolean;
    mutationId?: string;
    error?: string;
    conflict?: boolean;
  }> {
    let entry: SyncOutboxEntry | null;
    try {
      entry = await this.claimNext();
    } catch (error) {
      if (error instanceof Error && error.message === 'SYNC_QUEUE_BLOCKED') {
        return {
          hasMore: false,
          success: false,
          conflict: true,
          error: '队首同步任务存在冲突，请先解决后再继续上传。',
        };
      }
      throw error;
    }
    if (!entry) return { hasMore: false, success: true };

    try {
      const response = await fetch('/api/v1/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: entry.workspaceId,
          mutation_id: entry.mutationId,
          operations: entry.operations,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          mutation_id: string;
          results: Array<{
            entity_type: string;
            entity_id: string;
            revision: number;
            sequence: number;
          }>;
        };
        const now = Date.now();
        await db.transaction(
          'rw',
          [db.syncOutbox, db.syncEntityStatesV2, db.syncState],
          async (tx) => {
            const outbox = tx.table<SyncOutboxEntry, string>('syncOutbox');
            const entityStates = tx.table<SyncEntityStateV2, [string, string, string]>(
              'syncEntityStatesV2',
            );
            const syncStates = tx.table<SyncState, string>('syncState');
            await outbox.delete(entry.mutationId);

            for (const item of data.results) {
              const entityType = item.entity_type as SyncEntityType;
              const key: [string, SyncEntityType, string] = [
                entry.workspaceId,
                entityType,
                item.entity_id,
              ];
              const existing = await entityStates.get(key);
              await entityStates.put({
                workspaceId: entry.workspaceId,
                entityType,
                entityId: item.entity_id,
                serverRev: item.revision,
                localMutationSeq: existing?.localMutationSeq ?? 1,
                updatedAt: now,
              });

              const laterEntries = await outbox.orderBy('queueSequence').toArray();
              for (const laterEntry of laterEntries) {
                if (laterEntry.status !== 'pending') continue;
                let updated = false;
                const operations = laterEntry.operations.map((operation) => {
                  if (
                    !updated &&
                    operation.entity_type === item.entity_type &&
                    operation.entity_id === item.entity_id
                  ) {
                    updated = true;
                    return { ...operation, base_revision: item.revision };
                  }
                  return operation;
                });
                if (updated) {
                  await outbox.update(laterEntry.mutationId, { operations });
                  break;
                }
              }
            }

            const current = await syncStates.get(entry.workspaceId);
            await syncStates.put({
              workspaceId: entry.workspaceId,
              pullCursor: current?.pullCursor ?? 0,
              serverUrl: current?.serverUrl ?? window.location.origin,
              userId: current?.userId ?? '00000000-0000-0000-0000-000000000001',
              lastSyncAt: now,
              nextOutboxSequence: current?.nextOutboxSequence,
              chatBackfillVersion: current?.chatBackfillVersion,
            });
          },
        );
        return { hasMore: true, success: true, mutationId: entry.mutationId };
      }

      if (response.status === 409) {
        const body = (await response.json().catch(() => ({ detail: '409 Conflict' }))) as {
          detail?: unknown;
        };
        const detail = body.detail ?? 'Conflict';
        const reason = typeof detail === 'string' ? detail : JSON.stringify(detail);
        const errorCode =
          typeof detail === 'object' &&
          detail !== null &&
          'code' in detail &&
          typeof detail.code === 'string'
            ? detail.code
            : 'CONFLICT';
        await db.syncOutbox.update(entry.mutationId, {
          status: 'error',
          errorCode,
          errorReason: reason,
        });
        return {
          hasMore: false,
          success: false,
          conflict: true,
          error: `版本冲突或数据关系校验失败：${reason}`,
        };
      }

      const errText = await response.text().catch(() => response.statusText);
      await db.syncOutbox.update(entry.mutationId, {
        status: 'pending',
        errorCode: undefined,
        errorReason: `HTTP ${response.status}: ${errText}`,
      });
      return {
        hasMore: false,
        success: false,
        error: `上传失败（HTTP ${response.status}）：${errText}`,
      };
    } catch (networkError) {
      await db.syncOutbox.update(entry.mutationId, {
        status: 'pending',
        errorCode: undefined,
        errorReason: networkError instanceof Error ? networkError.message : String(networkError),
      });
      return {
        hasMore: false,
        success: false,
        error: '网络连接异常，未完成的变更仍保留在本地队列中。',
      };
    }
  }

  async pushAll(
    onProgress?: (pushedCount: number, remainingCount: number) => void,
  ): Promise<PushResult> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('duet-doc:sync-lock', { ifAvailable: true }, async (lock) => {
        if (!lock) return { success: false, error: '其他标签页正在同步，请稍后再试。' };
        return this.drainOutbox(onProgress);
      });
    }
    return this.drainOutbox(onProgress);
  }

  async synchronize(
    workspaceId: string,
    onProgress?: (pushedCount: number, remainingCount: number) => void,
  ): Promise<SyncResult> {
    const run = async (): Promise<SyncResult> => {
      await db.syncOutbox.where('status').equals('pushing').modify({ status: 'pending' });
      const beforePush = await this.pullAllUnlocked(workspaceId);
      if (beforePush.conflictCount > 0) {
        return {
          success: false,
          conflict: true,
          pulledCount: beforePush.appliedCount,
          conflictCount: beforePush.conflictCount,
          error: `检测到 ${beforePush.conflictCount} 项云端冲突，请先选择保留版本。`,
        };
      }

      const pushed = await this.drainOutbox(onProgress);
      if (!pushed.success) {
        if (!pushed.conflict) return pushed;
        const afterConflict = await this.pullAllUnlocked(workspaceId);
        return {
          ...pushed,
          pulledCount: beforePush.appliedCount + afterConflict.appliedCount,
          conflictCount: afterConflict.conflictCount,
        };
      }

      const afterPush = await this.pullAllUnlocked(workspaceId);
      return {
        ...pushed,
        pulledCount: beforePush.appliedCount + afterPush.appliedCount,
        conflictCount: afterPush.conflictCount,
      };
    };

    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('duet-doc:sync-lock', { ifAvailable: true }, async (lock) => {
        if (!lock) return { success: false, error: '其他标签页正在同步，请稍后再试。' };
        return run();
      });
    }
    return run();
  }

  private async drainOutbox(
    onProgress?: (pushedCount: number, remainingCount: number) => void,
  ): Promise<PushResult> {
    await db.syncOutbox.where('status').equals('pushing').modify({ status: 'pending' });
    let pushedCount = 0;

    while (true) {
      const remaining = await db.syncOutbox.where('status').equals('pending').count();
      onProgress?.(pushedCount, remaining);
      const first = await db.syncOutbox.orderBy('queueSequence').first();
      if (!first) return { success: true, pushedCount };
      if (first.status === 'error') {
        return {
          success: false,
          pushedCount,
          conflict: true,
          error: '队首同步任务存在冲突，请先解决后再继续上传。',
        };
      }

      const step = await this.pushNext();
      if (!step.success) {
        return {
          success: false,
          pushedCount,
          error: step.error,
          conflict: step.conflict,
        };
      }
      pushedCount += 1;
    }
  }

  async retryErrors(): Promise<{ retried: number; unresolved: number }> {
    const errors = await db.syncOutbox.where('status').equals('error').sortBy('queueSequence');
    if (errors.length === 0) return { retried: 0, unresolved: 0 };

    const bootstrapConflicts = errors.filter(
      (entry) =>
        readConflictCode(entry) === 'REVISION_CONFLICT' &&
        entry.operations.every(
          (operation) => operation.operation === 'upsert' && operation.base_revision === 0,
        ),
    );
    const revisionsByWorkspace = new Map<string, Map<string, number>>();
    for (const entry of bootstrapConflicts) {
      if (!revisionsByWorkspace.has(entry.workspaceId)) {
        revisionsByWorkspace.set(
          entry.workspaceId,
          await this.loadRemoteRevisions(entry.workspaceId),
        );
      }
    }

    let retried = 0;
    await db.transaction('rw', [db.syncOutbox, db.syncEntityStatesV2], async (tx) => {
      const outbox = tx.table<SyncOutboxEntry, string>('syncOutbox');
      const entityStates = tx.table<SyncEntityStateV2, [string, string, string]>(
        'syncEntityStatesV2',
      );
      for (const entry of bootstrapConflicts) {
        const remoteRevisions = revisionsByWorkspace.get(entry.workspaceId);
        if (!remoteRevisions) continue;
        const operations = entry.operations.map((operation) => ({
          ...operation,
          base_revision:
            remoteRevisions.get(entityKey(operation.entity_type, operation.entity_id)) ?? 0,
        }));

        for (const operation of operations) {
          const key: [string, SyncEntityType, string] = [
            entry.workspaceId,
            operation.entity_type,
            operation.entity_id,
          ];
          const state = await entityStates.get(key);
          await entityStates.put({
            workspaceId: entry.workspaceId,
            entityType: operation.entity_type,
            entityId: operation.entity_id,
            serverRev: operation.base_revision,
            localMutationSeq: state?.localMutationSeq ?? 1,
            updatedAt: Date.now(),
          });
        }

        await outbox.update(entry.mutationId, {
          operations,
          status: 'pending',
          errorCode: undefined,
          errorReason: undefined,
        });
        retried += 1;
      }
    });
    return { retried, unresolved: errors.length - retried };
  }

  private async resolveConflictUnlocked(
    conflict: SyncConflict,
    resolution: 'keep-local' | 'use-cloud',
  ): Promise<void> {
    const tables = [
      db.knowledgeBases,
      db.groups,
      db.documents,
      db.documentVersions,
      db.assets,
      db.favoriteItems,
      db.documentChunks,
      db.documentIndexStates,
      db.chatSessions,
      db.chatMessages,
      db.syncOutbox,
      db.syncEntityStatesV2,
    ];
    await db.transaction('rw', tables, async (tx) => {
      const outbox = tx.table<SyncOutboxEntry, string>('syncOutbox');
      const entityStates = tx.table<SyncEntityStateV2, [string, string, string]>(
        'syncEntityStatesV2',
      );
      const stateKey: [string, SyncEntityType, string] = [
        conflict.workspaceId,
        conflict.entityType,
        conflict.entityId,
      ];
      const state = await entityStates.get(stateKey);
      if (!state?.conflict) return;

      if (resolution === 'keep-local') {
        const entries = await outbox.orderBy('queueSequence').toArray();
        let rebased = false;
        for (const entry of entries) {
          const operations = entry.operations.map((operation) => {
            if (
              !rebased &&
              operation.entity_type === conflict.entityType &&
              operation.entity_id === conflict.entityId
            ) {
              rebased = true;
              return { ...operation, base_revision: state.conflict!.remoteRevision };
            }
            return operation;
          });
          if (rebased) {
            await outbox.update(entry.mutationId, {
              operations,
              status: 'pending',
              errorCode: undefined,
              errorReason: undefined,
            });
            break;
          }
        }
        if (!rebased) throw new Error('没有找到与冲突对应的本地变更');
      } else {
        const entries = await outbox.toArray();
        for (const entry of entries) {
          const operations = entry.operations.filter(
            (operation) =>
              !(
                operation.entity_type === conflict.entityType &&
                operation.entity_id === conflict.entityId
              ),
          );
          if (operations.length === 0) await outbox.delete(entry.mutationId);
          else if (operations.length !== entry.operations.length) {
            await outbox.update(entry.mutationId, {
              operations,
              status: 'pending',
              errorCode: undefined,
              errorReason: undefined,
            });
          }
        }
        await applyRemoteSnapshot(tx, {
          sequence: 0,
          entity_type: conflict.entityType,
          entity_id: conflict.entityId,
          snapshot: state.conflict.snapshot,
        });
      }

      await entityStates.put({
        ...state,
        serverRev: state.conflict.remoteRevision,
        updatedAt: Date.now(),
        conflict: undefined,
      });
    });

    if (resolution === 'use-cloud' && conflict.entityType === 'document') {
      const document = await db.documents.get(conflict.entityId);
      if (document) scheduleDocumentIndex(document);
    }
  }

  async resolveConflict(
    conflict: SyncConflict,
    resolution: 'keep-local' | 'use-cloud',
  ): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('duet-doc:sync-lock', async () =>
        this.resolveConflictUnlocked(conflict, resolution),
      );
    }
    return this.resolveConflictUnlocked(conflict, resolution);
  }
}

export const cloudSyncService = new CloudSyncService();
