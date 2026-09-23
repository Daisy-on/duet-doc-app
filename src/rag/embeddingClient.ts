import type { EmbeddingProgress } from './types';
import { getModelBasePath, type ModelId } from '../models/catalog';
import { requireModelInstallation } from '../models/modelCache';
import { ensureModelCacheServiceWorkerReady } from '../models/modelCacheServiceWorker';
import {
  activateLocalModelRuntime,
  notifyLocalModelRuntimeIdle,
  registerLocalModelRuntime,
  releaseLocalModelRuntime,
} from '../models/localModelRuntime';

const MODEL_ID: ModelId = 'bge-large-zh-v1.5-fp16';
const MODEL_PATH = getModelBasePath(MODEL_ID);
export const EMBEDDING_BATCH_SIZE = 2;

type QueuePriority = 'interactive' | 'background';

type PendingRequest = {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
};

type QueuedRequest = {
  requestId: string;
  priority: QueuePriority;
  message:
    | { type: 'embed'; requestId: string; payload: { texts: string[] } }
    | {
        type: 'search';
        requestId: string;
        payload: {
          query: string;
          candidates: Array<{ id: string; embedding: Float32Array }>;
          limit: number;
        };
      };
};

type WorkerMessage =
  | { type: 'load-progress'; payload: { file?: string; percent?: number } }
  | { type: 'ready'; payload: { deviceName: string } }
  | {
      type: 'embedding-result';
      requestId: string;
      payload: { vectors: Float32Array[]; inferenceMs: number };
    }
  | {
      type: 'search-result';
      requestId: string;
      payload: { matches: Array<{ id: string; score: number }>; inferenceMs: number };
    }
  | { type: 'error'; requestId?: string; payload: { message: string } };

export interface EmbeddingResult {
  vectors: Float32Array[];
  inferenceMs: number;
}

export interface LocalSearchRanking {
  matches: Array<{ id: string; score: number }>;
  inferenceMs: number;
}

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let resolveReady: (() => void) | null = null;
let rejectReady: ((error: Error) => void) | null = null;
let activeRequestId: string | null = null;
let deviceName = 'webgpu';
let lastProgress: EmbeddingProgress | null = null;
let isLoadingModel = false;
let runtimeGeneration = 0;
let runtimeLeaseCount = 0;

const pendingRequests = new Map<string, PendingRequest>();
const interactiveQueue: QueuedRequest[] = [];
const backgroundQueue: QueuedRequest[] = [];

function disposeEmbeddingRuntimeState(reason = 'Embedding runtime was released.') {
  runtimeGeneration += 1;
  worker?.terminate();
  worker = null;
  readyPromise = null;
  resolveReady = null;
  rejectReady?.(new Error(reason));
  rejectReady = null;
  activeRequestId = null;
  isLoadingModel = false;
  lastProgress = null;

  const error = new Error(reason);
  pendingRequests.forEach((pending) => pending.reject(error));
  pendingRequests.clear();
  interactiveQueue.length = 0;
  backgroundQueue.length = 0;
}

registerLocalModelRuntime('embedding', {
  dispose: disposeEmbeddingRuntimeState,
  isBusy: () => runtimeLeaseCount > 0 || isLoadingModel || Boolean(activeRequestId),
});

function pumpQueue() {
  if (!worker || activeRequestId) return;

  const next = interactiveQueue.shift() ?? backgroundQueue.shift();
  if (!next) return;

  activeRequestId = next.requestId;
  worker.postMessage(next.message);
}

function settleRequest(requestId: string, payload?: unknown, error?: Error) {
  const pending = pendingRequests.get(requestId);
  pendingRequests.delete(requestId);
  if (activeRequestId === requestId) activeRequestId = null;

  if (pending) {
    if (error) pending.reject(error);
    else pending.resolve(payload);
  }

  pumpQueue();
}

function getWorker() {
  if (worker) return worker;

  worker = new Worker(new URL('../workers/embeddingWorker.ts', import.meta.url), {
    type: 'module',
  });

  worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;
    if (message.type === 'load-progress') {
      if (message.payload.file && typeof message.payload.percent === 'number') {
        lastProgress = { file: message.payload.file, percent: message.payload.percent };
      }
      return;
    }

    if (message.type === 'ready') {
      isLoadingModel = false;
      deviceName = message.payload.deviceName;
      console.info('[LocalRAG] Embedding model ready', {
        model: 'bge-large-zh-v1.5',
        dtype: 'fp16',
        device: deviceName,
      });
      resolveReady?.();
      resolveReady = null;
      rejectReady = null;
      return;
    }

    if (message.type === 'error') {
      const error = new Error(message.payload.message);
      console.error('[LocalRAG] Embedding worker error', {
        requestId: message.requestId,
        message: error.message,
      });
      if (message.requestId) {
        settleRequest(message.requestId, undefined, error);
        disposeEmbeddingRuntime();
      } else {
        isLoadingModel = false;
        rejectReady?.(error);
        readyPromise = null;
        resolveReady = null;
        rejectReady = null;
        disposeEmbeddingRuntime();
      }
      return;
    }

    settleRequest(message.requestId, message.payload);
  });

  worker.addEventListener('error', (event) => {
    const error = new Error(event.message || 'Embedding worker failed.');
    if (activeRequestId) settleRequest(activeRequestId, undefined, error);
    rejectReady?.(error);
    disposeEmbeddingRuntime();
  });

  return worker;
}

export function ensureEmbeddingModelReady(): Promise<void> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    isLoadingModel = true;
    await activateLocalModelRuntime('embedding');
    const generation = runtimeGeneration;
    await requireModelInstallation(MODEL_ID);
    await ensureModelCacheServiceWorkerReady();
    if (generation !== runtimeGeneration) {
      throw new Error('Embedding runtime was superseded.');
    }
    const instance = getWorker();
    console.info('[LocalRAG] Loading embedding model', {
      model: 'bge-large-zh-v1.5',
      dtype: 'fp16',
    });
    await new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
      instance.postMessage({
        type: 'load',
        payload: { modelPath: MODEL_PATH, dtype: 'fp16', device: 'webgpu' },
      });
    });
  })().catch((error) => {
    isLoadingModel = false;
    readyPromise = null;
    throw error;
  });

  return readyPromise;
}

async function enqueue<T>(
  priority: QueuePriority,
  createMessage: (requestId: string) => QueuedRequest['message'],
): Promise<T> {
  await ensureEmbeddingModelReady();
  const requestId = crypto.randomUUID();

  return new Promise<T>((resolve, reject) => {
    pendingRequests.set(requestId, {
      resolve: (payload) => resolve(payload as T),
      reject,
    });
    const targetQueue = priority === 'interactive' ? interactiveQueue : backgroundQueue;
    const message = createMessage(requestId);
    targetQueue.push({ requestId, priority, message });
    console.debug('[LocalRAG] Worker job queued', {
      requestId,
      priority,
      kind: message.type,
    });
    pumpQueue();
  });
}

export function embedPassages(texts: string[]): Promise<EmbeddingResult> {
  return enqueue<EmbeddingResult>('background', (requestId) => ({
    type: 'embed',
    requestId,
    payload: { texts },
  }));
}

export async function embedPassagesInBatches(
  texts: string[],
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<EmbeddingResult> {
  const vectors: Float32Array[] = [];
  let inferenceMs = 0;

  for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH_SIZE) {
    signal?.throwIfAborted();
    const batch = texts.slice(offset, offset + EMBEDDING_BATCH_SIZE);
    const result = await embedPassages(batch);
    if (result.vectors.length !== batch.length) {
      throw new Error('Embedding worker returned an unexpected vector count.');
    }

    vectors.push(...result.vectors);
    inferenceMs += result.inferenceMs;
    onProgress?.(vectors.length, texts.length);

    if (offset + EMBEDDING_BATCH_SIZE < texts.length) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  return { vectors, inferenceMs };
}

export function rankLocalCandidates(
  query: string,
  candidates: Array<{ id: string; embedding: Float32Array }>,
  limit: number,
): Promise<LocalSearchRanking> {
  return enqueue<LocalSearchRanking>('interactive', (requestId) => ({
    type: 'search',
    requestId,
    payload: { query, candidates, limit },
  }));
}

export function getEmbeddingRuntimeStatus() {
  return {
    ready: Boolean(readyPromise),
    busy: Boolean(activeRequestId),
    deviceName,
    progress: lastProgress,
  };
}

export function disposeEmbeddingRuntime() {
  disposeEmbeddingRuntimeState();
  releaseLocalModelRuntime('embedding');
}

export async function withEmbeddingRuntime<T>(task: () => Promise<T>): Promise<T> {
  runtimeLeaseCount += 1;
  try {
    return await task();
  } finally {
    runtimeLeaseCount -= 1;
    if (runtimeLeaseCount === 0) {
      disposeEmbeddingRuntime();
      notifyLocalModelRuntimeIdle('embedding');
    }
  }
}
