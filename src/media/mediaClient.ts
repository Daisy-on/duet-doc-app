import SparkMD5 from 'spark-md5';
import { authFetch } from '../auth/authClient';
import type { DocumentAsset } from '../db';

interface UploadResponse {
  asset_id: string;
  status: 'pending' | 'ready';
  upload_url: string | null;
  headers: Record<string, string>;
}

interface MediaAccessResponse {
  asset_id: string;
  url: string;
  expires_at: string;
}

export class MediaSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaSyncError';
  }
}

async function responseError(response: Response, fallback: string): Promise<MediaSyncError> {
  let detail = '';
  try {
    const body = (await response.json()) as { detail?: string };
    detail = body.detail ?? '';
  } catch {
    // The status code is enough when the response does not contain JSON.
  }
  return new MediaSyncError(`${fallback}（HTTP ${response.status}${detail ? `：${detail}` : ''}）`);
}

function mediaPath(workspaceId: string, suffix: string): string {
  return `/api/v1/workspaces/${workspaceId}/media/${suffix}`;
}

async function getAccess(workspaceId: string, assetId: string): Promise<MediaAccessResponse> {
  const response = await authFetch(mediaPath(workspaceId, `${assetId}/access`));
  if (!response.ok) throw await responseError(response, '读取云端图片失败');
  return (await response.json()) as MediaAccessResponse;
}

export async function ensureMediaReady(workspaceId: string, asset: DocumentAsset): Promise<void> {
  const buffer = await asset.blob.arrayBuffer();
  const md5Hex = SparkMD5.ArrayBuffer.hash(buffer);
  const contentType = asset.mimeType === 'image/jpg' ? 'image/jpeg' : asset.mimeType;
  const response = await authFetch(mediaPath(workspaceId, 'uploads'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset_id: asset.id,
      content_type: contentType,
      size_bytes: asset.size,
      md5_hex: md5Hex,
    }),
  });
  if (!response.ok) throw await responseError(response, '申请图片上传失败');

  const upload = (await response.json()) as UploadResponse;
  if (upload.status === 'ready') return;
  if (!upload.upload_url) throw new MediaSyncError('服务端没有返回图片上传地址');

  const uploadResponse = await fetch(upload.upload_url, {
    method: 'PUT',
    headers: upload.headers,
    body: asset.blob,
  });
  if (!uploadResponse.ok && uploadResponse.status !== 409) {
    throw new MediaSyncError(`上传图片失败（HTTP ${uploadResponse.status}）`);
  }

  const completeResponse = await authFetch(mediaPath(workspaceId, `${asset.id}/complete`), {
    method: 'POST',
  });
  if (!completeResponse.ok) throw await responseError(completeResponse, '确认图片上传失败');
}

export async function assertMediaReady(workspaceId: string, assetId: string): Promise<void> {
  await getAccess(workspaceId, assetId);
}

export async function downloadMedia(workspaceId: string, assetId: string): Promise<Blob> {
  const access = await getAccess(workspaceId, assetId);
  const response = await fetch(access.url);
  if (!response.ok) throw new MediaSyncError(`下载云端图片失败（HTTP ${response.status}）`);
  return response.blob();
}
