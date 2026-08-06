import { nanoid } from 'nanoid';
import { db, type DocumentAsset } from '../db';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export const assetRepository = {
  /**
   * 保存图片文件到 IndexedDB
   */
  async saveAsset(docId: string, file: Blob, fileName?: string): Promise<DocumentAsset> {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`图片大小不能超过 ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    const mimeType = file.type || 'image/png';
    if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
      throw new Error('仅支持 PNG、JPEG、WebP 和 GIF 格式图片');
    }

    const assetId = `asset-${nanoid(12)}`;
    const asset: DocumentAsset = {
      id: assetId,
      docId,
      kind: 'image',
      blob: file,
      mimeType,
      fileName: fileName || (file as File).name || 'image',
      size: file.size,
      createdAt: Date.now(),
    };

    try {
      await db.assets.add(asset);
      return asset;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'QuotaExceededError') {
        throw new Error('本地存储空间不足，无法保存图片', { cause: err });
      }
      throw err;
    }
  },

  /**
   * 获取指定的 Asset 记录
   */
  async getAsset(assetId: string): Promise<DocumentAsset | undefined> {
    if (!assetId) return undefined;
    return await db.assets.get(assetId);
  },

  /**
   * 删除指定文档的所有图片资产
   */
  async deleteAssetsByDocId(docId: string): Promise<void> {
    if (!docId) return;
    await db.assets.where('docId').equals(docId).delete();
  },
};

export default assetRepository;
