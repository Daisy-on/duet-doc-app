import { authFetch } from '../auth/authClient';
import type { ModelId } from './catalog';

export interface ModelManifestFile {
  path: string;
  sizeBytes: number;
  url: string;
}

export interface ModelManifest {
  modelId: ModelId;
  version: string;
  precision: string;
  totalSizeBytes: number;
  expiresAt: string;
  files: ModelManifestFile[];
}

export async function fetchModelManifest(modelId: ModelId): Promise<ModelManifest> {
  const response = await authFetch(`/api/v1/models/${encodeURIComponent(modelId)}/manifest`);
  if (!response.ok) {
    let message = `获取模型清单失败 (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message);
  }

  const manifest = (await response.json()) as ModelManifest;
  if (manifest.modelId !== modelId || !manifest.files?.length) {
    throw new Error('模型清单内容不完整');
  }
  return manifest;
}
