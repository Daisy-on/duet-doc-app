import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
  type ProgressInfo,
} from '@huggingface/transformers';

env.allowLocalModels = true;
env.allowRemoteModels = false;
// The local FP16 file can be replaced during model evaluation. Always read the
// current public asset instead of reusing a stale Cache Storage entry.
env.useBrowserCache = false;

type LoadRequest = {
  type: 'load';
  payload: {
    modelPath: string;
    dtype: 'fp16';
    device: 'webgpu';
  };
};

type EmbedRequest = {
  type: 'embed';
  requestId: string;
  payload: { texts: string[] };
};

type SearchRequest = {
  type: 'search';
  requestId: string;
  payload: {
    query: string;
    candidates: Array<{ id: string; embedding: Float32Array }>;
    limit: number;
  };
};

type WorkerRequest = LoadRequest | EmbedRequest | SearchRequest;

type WorkerResponse =
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
    const architecture = info.architecture ? ` (${info.architecture})` : '';
    return `webgpu (${info.vendor} ${device}${architecture})`;
  } catch {
    return 'webgpu';
  }
}

async function loadModel(payload: LoadRequest['payload']): Promise<void> {
  if (extractor) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const deviceName = await detectGpuDevice();
    extractor = (await pipeline('feature-extraction', payload.modelPath, {
      dtype: payload.dtype,
      device: payload.device,
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
    post({ type: 'ready', payload: { deviceName } });
  })();

  try {
    await loadingPromise;
  } catch (error) {
    loadingPromise = null;
    throw error;
  }
}

async function embed(texts: string[]): Promise<Float32Array[]> {
  if (!extractor) throw new Error('Embedding model is not ready.');
  if (texts.length === 0) return [];

  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  return (output.tolist() as number[][]).map((vector) => new Float32Array(vector));
}

function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  let score = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  try {
    if (message.type === 'load') {
      await loadModel(message.payload);
      return;
    }

    if (!extractor) {
      post({
        type: 'error',
        requestId: message.requestId,
        payload: { message: 'Embedding model is not ready.' },
      });
      return;
    }

    const startedAt = performance.now();
    if (message.type === 'embed') {
      const vectors = await embed(message.payload.texts);
      post(
        {
          type: 'embedding-result',
          requestId: message.requestId,
          payload: { vectors, inferenceMs: performance.now() - startedAt },
        },
        vectors.map((vector) => vector.buffer),
      );
      return;
    }

    const [queryVector] = await embed([message.payload.query]);
    const matches = message.payload.candidates
      .map((candidate) => ({
        id: candidate.id,
        score: cosineSimilarity(queryVector, candidate.embedding),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, message.payload.limit);

    post({
      type: 'search-result',
      requestId: message.requestId,
      payload: { matches, inferenceMs: performance.now() - startedAt },
    });
  } catch (error) {
    post({
      type: 'error',
      requestId: 'requestId' in message ? message.requestId : undefined,
      payload: { message: error instanceof Error ? error.message : String(error) },
    });
  }
};

export {};
