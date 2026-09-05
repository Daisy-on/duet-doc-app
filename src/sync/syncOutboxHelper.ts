import type { Transaction } from 'dexie';
import type { SyncOperation, SyncOutboxEntry, SyncEntityStateV2, SyncState } from '../db';
import { detectContentFormat } from '../utils/formatUtils';

export { detectContentFormat };

export const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * 在给定的 Dexie 事务中将变更操作原子写入 syncOutbox 与 syncEntityStatesV2。
 * 核心保障：
 * 1. 使用单调递增的 queueSequence 保证绝对的 FIFO 顺序，杜绝同毫秒入队 UUID 乱序。
 * 2. 未发送的单实体 pending 任务原地合并 (Coalescing)，避免连续打字产生冗余版本任务。
 * 3. 对从未同步到服务端的本地删除 (serverRev === 0)：
 *    - 若前序 create 处于 pending，直接从 Outbox 剔除该实体的待处理操作（空变更组直接删除）；
 *    - 若前序 create 正在 pushing，追加一条待确认的 delete，后续流水线继承 revision。
 */
export async function enqueueMutationInTx(
  tx: Transaction,
  operations: SyncOperation[],
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<string | null> {
  if (!operations || operations.length === 0) return null;

  const outboxTable = tx.table<SyncOutboxEntry, string>('syncOutbox');
  const entityStatesTable = tx.table<SyncEntityStateV2, [string, string, string]>(
    'syncEntityStatesV2',
  );
  const syncStateTable = tx.table<SyncState, string>('syncState');
  const now = Date.now();

  // 单实体高频编辑防抖合并 (Coalescing)：
  // 若本次入队为单一 upsert，且队列末尾恰好存在同一实体的单体 pending 任务，直接原地更新
  if (operations.length === 1 && operations[0].operation === 'upsert') {
    const singleOp = operations[0];
    const lastEntry = await outboxTable.orderBy('queueSequence').reverse().first();

    if (
      lastEntry &&
      lastEntry.workspaceId === workspaceId &&
      lastEntry.status === 'pending' &&
      lastEntry.operations.length === 1 &&
      lastEntry.operations[0].entity_type === singleOp.entity_type &&
      lastEntry.operations[0].entity_id === singleOp.entity_id
    ) {
      const mergedOp: SyncOperation = {
        ...singleOp,
        base_revision: lastEntry.operations[0].base_revision,
      };

      await outboxTable.update(lastEntry.mutationId, {
        operations: [mergedOp],
        createdAt: now,
      });

      const existingState = await entityStatesTable.get([
        workspaceId,
        singleOp.entity_type,
        singleOp.entity_id,
      ]);
      await entityStatesTable.put({
        workspaceId,
        entityType: singleOp.entity_type,
        entityId: singleOp.entity_id,
        serverRev: existingState?.serverRev ?? 0,
        localMutationSeq: (existingState?.localMutationSeq ?? 0) + 1,
        updatedAt: now,
      });

      return lastEntry.mutationId;
    }
  }

  const resolvedOps: SyncOperation[] = [];

  for (const op of operations) {
    const existingState = await entityStatesTable.get([workspaceId, op.entity_type, op.entity_id]);
    const currentServerRev = existingState?.serverRev ?? 0;
    const nextSeq = (existingState?.localMutationSeq ?? 0) + 1;

    if (op.operation === 'delete') {
      if (currentServerRev === 0) {
        // 检查是否有该实体的 create 操作正处于 pushing（已在向云端发送中）
        const pushingEntries = await outboxTable.where('status').equals('pushing').toArray();
        const hasPushingCreate = pushingEntries.some(
          (e) =>
            e.workspaceId === workspaceId &&
            e.operations.some(
              (o) =>
                o.entity_type === op.entity_type &&
                o.entity_id === op.entity_id &&
                o.operation === 'upsert',
            ),
        );

        if (hasPushingCreate) {
          // 在途请求不可篡改：必须追加一条 delete 任务排队，等待在途任务返回最新 revision 后链式继承并发送删除
          resolvedOps.push({
            entity_type: op.entity_type,
            entity_id: op.entity_id,
            operation: 'delete',
            base_revision: 0,
          });
        } else {
          // 仅在本地 pending 队列：直接剔除该实体的待发送 upsert 操作，彻底避免云端死而复生
          const pendingEntries = await outboxTable.where('status').equals('pending').toArray();
          for (const pEntry of pendingEntries) {
            if (pEntry.workspaceId !== workspaceId) continue;
            const remainingOps = pEntry.operations.filter(
              (o) => !(o.entity_type === op.entity_type && o.entity_id === op.entity_id),
            );
            if (remainingOps.length === 0) {
              await outboxTable.delete(pEntry.mutationId);
            } else if (remainingOps.length !== pEntry.operations.length) {
              await outboxTable.update(pEntry.mutationId, { operations: remainingOps });
            }
          }
          await entityStatesTable.delete([workspaceId, op.entity_type, op.entity_id]);
          continue;
        }
      } else {
        // 实体在云端已存在：正常追加携带最新已确认 serverRev 的 delete
        resolvedOps.push({
          entity_type: op.entity_type,
          entity_id: op.entity_id,
          operation: 'delete',
          base_revision: currentServerRev,
        });
      }
    } else {
      // upsert 操作
      resolvedOps.push({
        entity_type: op.entity_type,
        entity_id: op.entity_id,
        operation: 'upsert',
        base_revision: currentServerRev,
        data: op.data,
      });
    }

    await entityStatesTable.put({
      workspaceId,
      entityType: op.entity_type,
      entityId: op.entity_id,
      serverRev: currentServerRev,
      localMutationSeq: nextSeq,
      updatedAt: now,
    });
  }

  if (resolvedOps.length === 0) {
    return null;
  }

  // 获取下一个单调递增的 queueSequence
  const lastSeqEntry = await outboxTable.orderBy('queueSequence').reverse().first();
  const syncStateRec = await syncStateTable.get(workspaceId);
  let nextQueueSequence = Math.max(
    (lastSeqEntry?.queueSequence ?? 0) + 1,
    syncStateRec?.nextOutboxSequence ?? 1,
  );

  const primaryMutationId = crypto.randomUUID();
  const CHUNK_SIZE = 100;

  for (let i = 0; i < resolvedOps.length; i += CHUNK_SIZE) {
    const chunk = resolvedOps.slice(i, i + CHUNK_SIZE);
    const mutationId = i === 0 ? primaryMutationId : crypto.randomUUID();
    const assignedSeq = nextQueueSequence++;

    await outboxTable.add({
      mutationId,
      workspaceId,
      queueSequence: assignedSeq,
      operations: chunk,
      status: 'pending',
      createdAt: now,
    });
  }

  // 持久化下一次可用的 queueSequence
  if (syncStateRec) {
    await syncStateTable.update(workspaceId, {
      nextOutboxSequence: nextQueueSequence,
    });
  }

  return primaryMutationId;
}
