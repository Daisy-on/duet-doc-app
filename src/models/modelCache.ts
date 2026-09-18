import { getModelBasePath, getModelDefinition, type ModelId } from './catalog';
import { fetchModelManifest } from './modelDeliveryClient';

const INSTALLATIONS_KEY = 'duet_model_installations_v1';

export interface ModelInstallation {
  modelId: ModelId;
  version: string;
  precision: string;
  totalSizeBytes: number;
  installedAt: number;
  files: string[];
}

interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
}

export class ModelNotInstalledError extends Error {
  readonly modelId: ModelId;

  constructor(modelId: ModelId) {
    super('请先在个人菜单的“端侧模型”中下载并安装所需模型');
    this.name = 'ModelNotInstalledError';
    this.modelId = modelId;
  }
}

function cacheName(modelId: ModelId, version: string): string {
  return `duet-model:${modelId}:${version}`;
}

function loadInstallations(): Partial<Record<ModelId, ModelInstallation>> {
  try {
    const raw = localStorage.getItem(INSTALLATIONS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<ModelId, ModelInstallation>>) : {};
  } catch {
    return {};
  }
}

function saveInstallations(value: Partial<Record<ModelId, ModelInstallation>>) {
  localStorage.setItem(INSTALLATIONS_KEY, JSON.stringify(value));
}

function validateFilePath(path: string) {
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\')) {
    throw new Error(`模型清单包含无效路径: ${path}`);
  }
}

function stableRequest(modelId: ModelId, path: string): Request {
  const url = new URL(`${getModelBasePath(modelId)}${path}`, window.location.origin);
  return new Request(url, { method: 'GET' });
}

export async function inspectModelInstallation(
  modelId: ModelId,
): Promise<ModelInstallation | null> {
  if (!('caches' in window)) return null;
  const installation = loadInstallations()[modelId];
  if (!installation?.files.length) return null;

  const cache = await caches.open(cacheName(modelId, installation.version));
  const matches = await Promise.all(
    installation.files.map((path) => cache.match(stableRequest(modelId, path))),
  );
  if (matches.every(Boolean)) return installation;

  await caches.delete(cacheName(modelId, installation.version));
  const installations = loadInstallations();
  delete installations[modelId];
  saveInstallations(installations);
  return null;
}

export async function requireModelInstallation(modelId: ModelId): Promise<ModelInstallation> {
  const installation = await inspectModelInstallation(modelId);
  if (!installation) throw new ModelNotInstalledError(modelId);
  return installation;
}

async function ensureStorageCapacity(requiredBytes: number) {
  if (!navigator.storage?.estimate) return;
  const estimate = await navigator.storage.estimate();
  if (estimate.quota === undefined || estimate.usage === undefined) return;
  const available = estimate.quota - estimate.usage;
  if (available < requiredBytes * 1.05) {
    throw new Error('浏览器可用存储空间不足，请先清理部分站点数据');
  }
}

export async function downloadModel(
  modelId: ModelId,
  signal: AbortSignal,
  onProgress: (progress: DownloadProgress) => void,
): Promise<ModelInstallation> {
  if (!('caches' in window) || typeof TransformStream === 'undefined') {
    throw new Error('当前浏览器不支持端侧模型缓存');
  }

  const definition = getModelDefinition(modelId);
  const manifest = await fetchModelManifest(modelId);
  for (const file of manifest.files) validateFilePath(file.path);
  await ensureStorageCapacity(manifest.totalSizeBytes || definition.estimatedSizeBytes);
  void navigator.storage?.persist?.().catch(() => {
    // Persistence is optional; Cache Storage remains usable when the browser declines it.
  });

  const name = cacheName(modelId, manifest.version);
  await caches.delete(name);
  const cache = await caches.open(name);
  let downloadedBytes = 0;
  let lastReportedAt = 0;

  try {
    for (const file of manifest.files) {
      signal.throwIfAborted();
      const response = await fetch(file.url, { signal });
      if (!response.ok || !response.body) {
        throw new Error(`下载 ${file.path} 失败 (${response.status})`);
      }

      const stream = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            downloadedBytes += chunk.byteLength;
            const now = performance.now();
            if (now - lastReportedAt >= 100) {
              lastReportedAt = now;
              onProgress({
                downloadedBytes,
                totalBytes: manifest.totalSizeBytes,
              });
            }
            controller.enqueue(chunk);
          },
        }),
      );
      const cachedResponse = new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      await cache.put(stableRequest(modelId, file.path), cachedResponse);
    }

    onProgress({ downloadedBytes, totalBytes: manifest.totalSizeBytes });
    const installation: ModelInstallation = {
      modelId,
      version: manifest.version,
      precision: manifest.precision,
      totalSizeBytes: manifest.totalSizeBytes,
      installedAt: Date.now(),
      files: manifest.files.map((file) => file.path),
    };
    const installations = loadInstallations();
    installations[modelId] = installation;
    saveInstallations(installations);
    return installation;
  } catch (error) {
    await caches.delete(name);
    throw error;
  }
}
