import { db } from '../db';
import { extractAssetIds } from '../utils/assetUtils';

const ONE_HOUR = 60 * 60 * 1000;

/**
 * 对指定文档的图片资产进行两阶段 GC
 */
export async function runAssetGC(docId: string): Promise<void> {
  if (!docId) return;

  await db.transaction('rw', [db.documents, db.documentVersions, db.assets], async () => {
    const doc = await db.documents.get(docId);
    const versions = await db.documentVersions.where('docId').equals(docId).toArray();

    const referencedAssetIds = new Set<string>();

    if (doc?.content) {
      extractAssetIds(doc.content).forEach((id) => referencedAssetIds.add(id));
    }

    versions.forEach((ver) => {
      if (ver.content) {
        extractAssetIds(ver.content).forEach((id) => referencedAssetIds.add(id));
      }
    });

    const assets = await db.assets.where('docId').equals(docId).toArray();
    const now = Date.now();

    for (const asset of assets) {
      if (referencedAssetIds.has(asset.id)) {
        if (asset.orphanedAt) {
          await db.assets.update(asset.id, { orphanedAt: undefined });
        }
      } else {
        if (!asset.orphanedAt) {
          await db.assets.update(asset.id, { orphanedAt: now });
        } else if (now - asset.orphanedAt > ONE_HOUR) {
          await db.assets.delete(asset.id);
        }
      }
    }
  });
}
