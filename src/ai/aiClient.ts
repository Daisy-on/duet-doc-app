import { logAITrace } from './aiLogger';

const GHOST_TEXT_MODEL_PATH = '/ai-models/qwen3.5-0.8b-opt/';

type GhostTextStatus = 'idle' | 'loading' | 'ready' | 'error';

type WorkerResponse =
  | { type: 'load-progress'; payload: unknown }
  | { type: 'ready'; payload?: { deviceName?: string } }
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
let detectedGpuDevice = 'webgpu';

// 单飞队列状态与测速
let isWorkerBusy = false;
let inFlightResolve: ((value: GhostTextResult | null) => void) | null = null;
let inFlightRequestId: string | null = null;
let inFlightStartedAt = 0;

let hasDroppedRequest = false;
let cooldownTimer: number | null = null;
let modelLoadStartedAt: number | null = null;

function getModelLoadElapsedMs(): number | undefined {
  return modelLoadStartedAt === null ? undefined : performance.now() - modelLoadStartedAt;
}

function getWorker() {
  if (worker) return worker;

  worker = new Worker(new URL('../workers/aiWorker.ts', import.meta.url), {
    type: 'module',
  });

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;

    if (message.type === 'load-progress') {
      return;
    }

    if (message.type === 'ready') {
      status = 'ready';
      if (message.payload?.deviceName) {
        detectedGpuDevice = message.payload.deviceName;
      }
      const modelLoadMs = getModelLoadElapsedMs();
      modelLoadStartedAt = null;
      logAITrace({
        requestId: 'model-init',
        runtime: 'local',
        kind: 'model-load',
        task: 'ghost-text-load',
        status: 'completed',
        model: 'qwen3.5-0.8b-opt',
        modelLoadMs,
        device: detectedGpuDevice,
        dtype: 'q4f16',
      });
      return;
    }

    if (message.type === 'error') {
      const failedDuringModelLoad = status === 'loading';
      if (failedDuringModelLoad) {
        status = 'error';
        const modelLoadMs = getModelLoadElapsedMs();
        modelLoadStartedAt = null;
        logAITrace({
          requestId: 'model-init',
          runtime: 'local',
          kind: 'model-load',
          task: 'ghost-text-load',
          status: 'failed',
          model: 'qwen3.5-0.8b-opt',
          modelLoadMs,
          device: detectedGpuDevice,
          dtype: 'q4f16',
          errorCode: 'MODEL_LOAD_ERROR',
          errorMessage: message.payload.message,
        });
      }

      // 当前 in-flight 请求出错
      if (message.requestId && message.requestId === inFlightRequestId) {
        logAITrace({
          requestId: message.requestId,
          runtime: 'local',
          kind: 'generation',
          task: 'ghost-text',
          status: 'failed',
          errorCode: 'WORKER_ERROR',
          errorMessage: message.payload.message,
          device: detectedGpuDevice,
          dtype: 'q4f16',
        });

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
      const totalLatencyMs = performance.now() - inFlightStartedAt;

      inFlightResolve = null;
      inFlightRequestId = null;
      isWorkerBusy = false;

      const isAccepted = currentRequestId === latestRequestId && !!currentResolve;
      const traceStatus = isAccepted ? 'completed' : 'stale';

      logAITrace({
        requestId: message.requestId,
        runtime: 'local',
        kind: 'generation',
        task: 'ghost-text',
        status: traceStatus,
        model: 'qwen3.5-0.8b-opt',
        device: detectedGpuDevice,
        dtype: 'q4f16',
        inferenceMs: message.payload.inferenceTime,
        totalLatencyMs,
      });

      if (isAccepted) {
        currentResolve({
          requestId: message.requestId,
          text: message.payload.text,
        });
      } else {
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
  modelLoadStartedAt = performance.now();

  logAITrace({
    requestId: 'model-init',
    runtime: 'local',
    kind: 'model-load',
    task: 'ghost-text-load',
    status: 'started',
    model: 'qwen3.5-0.8b-opt',
    device: detectedGpuDevice,
    dtype: 'q4f16',
  });

  try {
    getWorker().postMessage({
      type: 'load',
      payload: {
        modelPath: GHOST_TEXT_MODEL_PATH,
        dtype: 'q4f16',
        device: 'webgpu',
      },
    });
  } catch (error) {
    status = 'error';
    const modelLoadMs = getModelLoadElapsedMs();
    modelLoadStartedAt = null;
    logAITrace({
      requestId: 'model-init',
      runtime: 'local',
      kind: 'model-load',
      task: 'ghost-text-load',
      status: 'failed',
      model: 'qwen3.5-0.8b-opt',
      modelLoadMs,
      device: detectedGpuDevice,
      dtype: 'q4f16',
      errorCode: 'MODEL_LOAD_START_ERROR',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
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
  const requestId = crypto.randomUUID();

  if (status !== 'ready') {
    logAITrace({
      requestId,
      runtime: 'local',
      kind: 'generation',
      task: 'ghost-text',
      status: 'skipped',
      errorMessage: 'Model not ready',
    });
    return Promise.resolve(null);
  }

  latestRequestId = requestId;

  if (isWorkerBusy) {
    logAITrace({
      requestId,
      runtime: 'local',
      kind: 'generation',
      task: 'ghost-text',
      status: 'dropped',
      errorMessage: 'Worker busy',
    });
    hasDroppedRequest = true;
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    isWorkerBusy = true;
    inFlightRequestId = requestId;
    inFlightResolve = resolve;
    inFlightStartedAt = performance.now();

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
