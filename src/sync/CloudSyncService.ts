import { db } from '../db';
import type { SyncEntityStateV2, SyncEntityType, SyncOutboxEntry, SyncState } from '../db';

export interface PushResult {
  success: boolean;
  pushedCount?: number;
  error?: string;
  conflict?: boolean;
}

interface PullChange {
  entity_type: SyncEntityType;
  entity_id: string;
  snapshot: { revision: number };
}

interface PullResponse {
  changes: PullChange[];
  next_cursor: number;
  has_more: boolean;
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

export class CloudSyncService {
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
}

export const cloudSyncService = new CloudSyncService();
