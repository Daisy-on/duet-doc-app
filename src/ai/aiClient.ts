const GHOST_TEXT_MODEL_PATH = '/ai-models/qwen3.5-0.8b/';

type GhostTextStatus = 'idle' | 'loading' | 'ready' | 'error';

type WorkerResponse =
  | { type: 'load-progress'; payload: unknown }
  | { type: 'ready' }
  | { type: 'result'; requestId: string; payload: { text: string; inferenceTime?: number } }
  | { type: 'error'; requestId?: string; payload: { message: string } };

export type GhostTextRequest = {
  messages: Array<{ role: string; content: string }>;
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

// 单飞队列状态
let isWorkerBusy = false;
let inFlightResolve: ((value: GhostTextResult | null) => void) | null = null;
let inFlightRequestId: string | null = null;

let hasDroppedRequest = false;
let cooldownTimer: number | null = null;

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

      // 当前 in-flight 请求出错，resolve(null) 通知调用方
      if (message.requestId && message.requestId === inFlightRequestId) {
        inFlightResolve?.(null);
        inFlightResolve = null;
        inFlightRequestId = null;
        isWorkerBusy = false;

        // 启动冷却重试
        if (hasDroppedRequest) {
          hasDroppedRequest = false;
          if (cooldownTimer) window.clearTimeout(cooldownTimer);
          cooldownTimer = window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('ghost-text-idle'));
          }, 1000);
        }
      }
      return;
    }

    if (message.type === 'result') {
      // in-flight 请求完成
      const currentResolve = inFlightResolve;
      const currentRequestId = inFlightRequestId;
      inFlightResolve = null;
      inFlightRequestId = null;
      isWorkerBusy = false;

      const inferenceTimeStr = message.payload.inferenceTime !== undefined 
        ? `${message.payload.inferenceTime.toFixed(1)}ms` 
        : 'unknown';

      // 判断是否是最新的请求
      if (currentRequestId === latestRequestId && currentResolve) {
        console.log(`[ghost-text] result accepted: ${message.requestId} (inference: ${inferenceTimeStr})`);
        currentResolve({
          requestId: message.requestId,
          text: message.payload.text,
        });
      } else {
        // 过期请求，丢弃结果
        console.log(`[ghost-text] result discarded (stale): ${message.requestId} (inference: ${inferenceTimeStr})`);
        currentResolve?.(null);
      }

      // 启动冷却重试
      if (hasDroppedRequest) {
        hasDroppedRequest = false;
        if (cooldownTimer) window.clearTimeout(cooldownTimer);
        cooldownTimer = window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('ghost-text-idle'));
        }, 1000);
      }
    }
  });

  return worker;
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
  hasDroppedRequest = false;

  if (cooldownTimer) {
    window.clearTimeout(cooldownTimer);
    cooldownTimer = null;
  }
}

export function requestGhostText(input: GhostTextRequest): Promise<GhostTextResult | null> {
  if (status !== 'ready') {
    return Promise.resolve(null);
  }

  const requestId = crypto.randomUUID();
  latestRequestId = requestId;

  if (isWorkerBusy) {
    console.log(`[ghost-text] worker busy, dropping request: ${requestId}`);
    hasDroppedRequest = true;
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    isWorkerBusy = true;
    inFlightRequestId = requestId;
    inFlightResolve = resolve;

    getWorker().postMessage({
      type: 'generate',
      requestId,
      payload: {
        messages: input.messages,
        maxNewTokens: input.maxNewTokens ?? 16,
        temperature: 0.3,
        topP: 0.7,
      },
    });
  });
}