import { db, type SyncOperation } from '../db';
import { extractAssetIds } from '../utils/assetUtils';
import { assertMediaReady, ensureMediaReady } from './mediaClient';

function operationAssetIds(operations: SyncOperation[]): Set<string> {
  const ids = new Set<string>();
  for (const operation of operations) {
    if (operation.entity_type !== 'document' || operation.operation !== 'upsert') continue;
    const content = operation.data && 'content' in operation.data ? operation.data.content : '';
    extractAssetIds(content).forEach((assetId) => ids.add(assetId));
  }
  return ids;
}

async function ensureAssets(workspaceId: string, assetIds: Iterable<string>): Promise<void> {
  for (const assetId of assetIds) {
    const asset = await db.assets.get(assetId);
    if (asset) await ensureMediaReady(workspaceId, asset);
    else await assertMediaReady(workspaceId, assetId);
  }
}

export async function ensureOperationMediaReady(
  workspaceId: string,
  operations: SyncOperation[],
): Promise<void> {
  await ensureAssets(workspaceId, operationAssetIds(operations));
}

export async function uploadReferencedLocalAssets(workspaceId: string): Promise<void> {
  const documents = await db.documents.toArray();
  const assetIds = new Set<string>();
  for (const document of documents) {
    extractAssetIds(document.content).forEach((assetId) => assetIds.add(assetId));
  }
  await ensureAssets(workspaceId, assetIds);
}
