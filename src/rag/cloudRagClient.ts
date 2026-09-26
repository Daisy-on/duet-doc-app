import { authFetch } from '../auth/authClient';

export interface CloudRagCoverage {
  current_sources: number;
  ready_sources: number;
  stale_sources: number;
  stale_client_sources: number;
  unavailable_stale_source_ids: string[];
  missing_sources: number;
  pending_images: number;
  has_client_index: boolean;
  has_cloud_index: boolean;
  has_any_index: boolean;
  active_run_id: string | null;
  active_run_status: 'pending' | 'running' | null;
}

export interface CloudRagPlan {
  document_count: number;
  text_chunk_count: number;
  text_character_count: number;
  image_count: number;
  total_jobs: number;
}

export interface CloudRagRun {
  run_id: string;
  status: 'pending' | 'running' | 'completed' | 'partial' | 'error';
  total_jobs: number;
  completed_jobs?: number;
  failed_jobs?: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(path, init);
  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (typeof body.detail === 'string') message = body.detail;
    } catch {
      // Keep the status fallback for non-JSON responses.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function base(workspaceId: string) {
  return `/api/v1/rag/workspaces/${workspaceId}/cloud-index`;
}

export function getCloudRagCoverage(workspaceId: string) {
  return request<CloudRagCoverage>(`${base(workspaceId)}/coverage`);
}

export function getCloudRagPlan(workspaceId: string, includeText: boolean) {
  return request<CloudRagPlan>(
    `${base(workspaceId)}/plan?include_text=${includeText}&include_images=true`,
  );
}

export function createCloudRagRun(
  workspaceId: string,
  includeText: boolean,
  includeImages: boolean,
) {
  return request<CloudRagRun>(`${base(workspaceId)}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ include_text: includeText, include_images: includeImages }),
  });
}

export function getCloudRagRun(workspaceId: string, runId: string) {
  return request<CloudRagRun>(`${base(workspaceId)}/runs/${runId}`);
}
