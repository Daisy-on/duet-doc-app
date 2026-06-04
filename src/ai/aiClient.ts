const GHOST_TEXT_MODEL_PATH = '/ai-models/qwen3.5-0.8b/';

type GhostTextStatus = 'idle' | 'loading' | 'ready' | 'error';

type WorkerResponse =
  | { type: 'load-progress'; payload: unknown }
  | { type: 'ready' }
  | { type: 'result'; requestId: string; payload: { text: string } }
  | { type: 'error'; requestId?: string; payload: { message: string } };

type PendingRequest = {
  resolve: (value: GhostTextResult | null) => void;
};

export type GhostTextRequest = {
  prompt: string;
  docId: string;
  cursorPos: number;
  maxNewTokens?: number;
};

export type GhostTextResult = {
  requestId: string;
  text: string;
};

let worker: Worker | null = null;
let status: GhostTextStatus = 'idle';
let latestRequestId: string | null = null;
const pendingRequests = new Map<string, PendingRequest>();

function getWorker() {
  if (worker) return worker;

  worker = new Worker(new URL('../workers/aiWorker.ts', import.meta.url), {
    type: 'module',
  });

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;

    if (message.type === 'load-progress') {
      console.log('[ghost-text] model loading:', message.payload);
      return;
    }

    if (message.type === 'ready') {
      status = 'ready';
      console.log('[ghost-text] model ready');
      return;
    }

    if (message.type === 'error') {
      status = status === 'loading' ? 'error' : status;
      console.error('[ghost-text] worker error:', message.payload.message);

      if (message.requestId) {
        const pending = pendingRequests.get(message.requestId);
        pending?.resolve(null);
        pendingRequests.delete(message.requestId);
      }
      return;
    }

    if (message.type === 'result') {
      const pending = pendingRequests.get(message.requestId);
      if (!pending) return;

      pendingRequests.delete(message.requestId);

      if (message.requestId !== latestRequestId) {
        pending.resolve(null);
        return;
      }

      pending.resolve({
        requestId: message.requestId,
        text: message.payload.text,
      });
    }
  });

  return worker;
}

function cancelPendingRequests() {
  pendingRequests.forEach((pending) => pending.resolve(null));
  pendingRequests.clear();
}

export function loadGhostTextModel() {
  if (status === 'loading' || status === 'ready') return;

  status = 'loading';

  getWorker().postMessage({
    type: 'load',
    payload: {
      modelPath: GHOST_TEXT_MODEL_PATH,
      dtype: 'q4f16',
      device: 'webgpu',
    },
  });
}

export function getGhostTextStatus() {
  return status;
}

export function clearActiveGhostTextRequest() {
  latestRequestId = null;
  cancelPendingRequests();
}

export function requestGhostText(input: GhostTextRequest): Promise<GhostTextResult | null> {
  if (status !== 'ready') {
    return Promise.resolve(null);
  }

  cancelPendingRequests();

  const requestId = crypto.randomUUID();
  latestRequestId = requestId;

  return new Promise((resolve) => {
    pendingRequests.set(requestId, { resolve });

    getWorker().postMessage({
      type: 'generate',
      requestId,
      payload: {
        prompt: input.prompt,
        maxNewTokens: input.maxNewTokens ?? 12,
        temperature: 0.3,
        topP: 0.7,
      },
    });
  });
}