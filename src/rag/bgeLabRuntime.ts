import type { BgePrecision } from '../workers/bgeEmbeddingWorker';
import {
  activateLocalModelRuntime,
  notifyLocalModelRuntimeIdle,
  registerLocalModelRuntime,
  releaseLocalModelRuntime,
} from '../models/localModelRuntime';

const MODEL_PATH = '/models/bge-large-zh-v1.5-q4f16/';
const QUERY_INSTRUCTION = '为这个句子生成表示以用于检索相关文章：';

type WorkerMessage =
  | { type: 'load-progress'; payload: { file?: string; percent?: number } }
  | { type: 'ready'; payload: { deviceName: string; loadMs: number } }
  | {
      type: 'embedding-result';
      requestId: string;
      payload: { vectors: Float32Array[]; inferenceMs: number };
    }
  | { type: 'error'; requestId?: string; payload: { message: string } };

export interface BgeRuntimeInfo {
  precision: BgePrecision;
  deviceName: string;
  loadMs: number;
}

export interface BgeEmbeddingResult {
  vectors: Float32Array[];
  inferenceMs: number;
}

let worker: Worker | null = null;
let activePrecision: BgePrecision | null = null;
let runtimeInfo: BgeRuntimeInfo | null = null;
let readyPromise: Promise<BgeRuntimeInfo> | null = null;
let requestSequence = 0;
const pending = new Map<
  string,
  { resolve: (result: BgeEmbeddingResult) => void; reject: (error: Error) => void }
>();

registerLocalModelRuntime('bge-lab', {
  dispose: disposeBgeLabRuntime,
  isBusy: () => Boolean(readyPromise || pending.size > 0),
});

function rejectPending(message: string) {
  for (const request of pending.values()) request.reject(new Error(message));
  pending.clear();
}

function createWorker() {
  const instance = new Worker(new URL('../workers/bgeEmbeddingWorker.ts', import.meta.url), {
    type: 'module',
  });
  instance.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;
    if (message.type === 'embedding-result') {
      const request = pending.get(message.requestId);
      if (!request) return;
      pending.delete(message.requestId);
      request.resolve(message.payload);
      return;
    }
    if (message.type === 'error' && message.requestId) {
      const request = pending.get(message.requestId);
      if (!request) return;
      pending.delete(message.requestId);
      request.reject(new Error(message.payload.message));
    }
  });
  instance.addEventListener('error', (event) => rejectPending(event.message));
  return instance;
}

export async function ensureBgeLabRuntime(precision: BgePrecision): Promise<BgeRuntimeInfo> {
  if (activePrecision !== precision) disposeBgeLabRuntime();
  if (runtimeInfo) return runtimeInfo;
  if (readyPromise) return readyPromise;

  if (!(await activateLocalModelRuntime('bge-lab'))) {
    throw new Error('另一个本地模型任务仍在运行，请稍后重试。');
  }

  activePrecision = precision;
  worker = createWorker();
  readyPromise = new Promise<BgeRuntimeInfo>((resolve, reject) => {
    const instance = worker!;
    const handleMessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === 'ready') {
        instance.removeEventListener('message', handleMessage);
        runtimeInfo = { precision, ...message.payload };
        resolve(runtimeInfo);
      } else if (message.type === 'error' && !message.requestId) {
        instance.removeEventListener('message', handleMessage);
        reject(new Error(message.payload.message));
      }
    };
    instance.addEventListener('message', handleMessage);
    instance.postMessage({ type: 'load', payload: { modelPath: MODEL_PATH, precision } });
  });

  try {
    return await readyPromise;
  } catch (error) {
    disposeBgeLabRuntime();
    throw error;
  }
}

export async function embedBgeLabTexts(
  precision: BgePrecision,
  texts: string[],
): Promise<BgeEmbeddingResult> {
  await ensureBgeLabRuntime(precision);
  if (!worker) throw new Error('BGE worker is not available.');

  const requestId = `bge-${++requestSequence}`;
  return new Promise<BgeEmbeddingResult>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    worker!.postMessage({ type: 'embed', requestId, payload: { texts } });
  });
}

export function formatBgeQuery(query: string): string {
  return `${QUERY_INSTRUCTION}${query.trim()}`;
}

export function disposeBgeLabRuntime() {
  rejectPending('BGE runtime was disposed.');
  worker?.postMessage({ type: 'dispose' });
  worker?.terminate();
  worker = null;
  activePrecision = null;
  runtimeInfo = null;
  readyPromise = null;
  releaseLocalModelRuntime('bge-lab');
  notifyLocalModelRuntimeIdle('bge-lab');
}

export type { BgePrecision };
