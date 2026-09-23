import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
  type ProgressInfo,
} from '@huggingface/transformers';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = false;

export type BgePrecision = 'q4f16' | 'fp16';

type WorkerRequest =
  | {
      type: 'load';
      payload: { modelPath: string; precision: BgePrecision };
    }
  | {
      type: 'embed';
      requestId: string;
      payload: { texts: string[] };
    }
  | { type: 'dispose' };

type WorkerResponse =
  | { type: 'load-progress'; payload: { file?: string; percent?: number } }
  | { type: 'ready'; payload: { deviceName: string; loadMs: number } }
  | {
      type: 'embedding-result';
      requestId: string;
      payload: { vectors: Float32Array[]; inferenceMs: number };
    }
  | { type: 'error'; requestId?: string; payload: { message: string } };

let extractor: FeatureExtractionPipeline | null = null;
let loadingPromise: Promise<void> | null = null;

function post(message: WorkerResponse, transfer?: Transferable[]) {
  const workerScope = self as unknown as {
    postMessage: (value: WorkerResponse, transfer?: Transferable[]) => void;
  };
  workerScope.postMessage(message, transfer);
}

async function detectGpuDevice(): Promise<string> {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    const info = adapter?.info;
    if (!info) return 'webgpu';
    const device = info.device || info.description || 'GPU';
    return `webgpu (${info.vendor} ${device})`;
  } catch {
    return 'webgpu';
  }
}

async function loadModel(modelPath: string, precision: BgePrecision) {
  if (extractor) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const startedAt = performance.now();
    const deviceName = await detectGpuDevice();
    extractor = (await pipeline('feature-extraction', modelPath, {
      dtype: precision,
      device: 'webgpu',
      progress_callback: (progress: ProgressInfo) => {
        if (progress.status !== 'progress') return;
        post({
          type: 'load-progress',
          payload: {
            file: progress.file,
            percent:
              typeof progress.progress === 'number' ? Math.round(progress.progress) : undefined,
          },
        });
      },
    })) as FeatureExtractionPipeline;
    post({
      type: 'ready',
      payload: { deviceName, loadMs: performance.now() - startedAt },
    });
  })();

  try {
    await loadingPromise;
  } catch (error) {
    loadingPromise = null;
    throw error;
  }
}

async function embed(texts: string[]) {
  if (!extractor) throw new Error('BGE model is not ready.');
  const startedAt = performance.now();
  const output = await extractor(texts, { pooling: 'cls', normalize: true });
  try {
    const vectors = (output.tolist() as number[][]).map((vector) => new Float32Array(vector));
    if (vectors.some((vector) => vector.length !== 1024)) {
      throw new Error('BGE embedding dimension must be 1024.');
    }
    return { vectors, inferenceMs: performance.now() - startedAt };
  } finally {
    output.dispose();
  }
}

async function dispose() {
  await extractor?.dispose();
  extractor = null;
  loadingPromise = null;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'load') {
      await loadModel(message.payload.modelPath, message.payload.precision);
      return;
    }
    if (message.type === 'dispose') {
      await dispose();
      self.close();
      return;
    }

    const result = await embed(message.payload.texts);
    post(
      { type: 'embedding-result', requestId: message.requestId, payload: result },
      result.vectors.map((vector) => vector.buffer),
    );
  } catch (error) {
    post({
      type: 'error',
      requestId: 'requestId' in message ? message.requestId : undefined,
      payload: { message: error instanceof Error ? error.message : String(error) },
    });
  }
};
