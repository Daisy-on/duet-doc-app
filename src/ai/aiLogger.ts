export type AIRuntime = 'local' | 'cloud';

export type AITraceStatus =
  | 'started'
  | 'completed'
  | 'rendered'
  | 'discarded'
  | 'aborted'
  | 'stale'
  | 'dropped'
  | 'failed'
  | 'skipped';

export interface AITrace {
  requestId: string;
  runtime: AIRuntime;
  kind?: 'model-load' | 'generation';
  task: string;
  status: AITraceStatus;

  provider?: string;
  model?: string;
  routeReason?: string;

  device?: string;
  dtype?: string;

  inferenceMs?: number;
  ttftMs?: number;
  clientFirstDeltaMs?: number;
  clientFirstTextMs?: number;
  clientTotalLatencyMs?: number;
  totalLatencyMs?: number;
  modelLoadMs?: number;

  outputChars?: number;
  discardReason?:
    | 'empty_result'
    | 'document_changed'
    | 'editor_destroyed'
    | 'selection_changed'
    | 'cursor_changed'
    | 'empty_after_clean'
    | 'command_rejected';

  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };

  finishReason?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface GhostTextPerfRecord {
  requestId: string;
  timestamp: number;
  model?: string;
  device?: string;
  dtype?: string;
  inferenceMs?: number;
  totalLatencyMs?: number;
  outputChars?: number;
  generationStatus?: string;
  uiStatus?: string;
  discardReason?: string;
}

const ghostTextRecords = new Map<string, GhostTextPerfRecord>();
const MAX_GHOST_TEXT_RECORDS = 100;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function recordGhostTextTrace(trace: AITrace) {
  if (!trace.requestId || (trace.task !== 'ghost-text' && trace.task !== 'ghost-text-ui')) {
    return;
  }

  let record = ghostTextRecords.get(trace.requestId);
  if (!record) {
    record = {
      requestId: trace.requestId,
      timestamp: Date.now(),
    };
    ghostTextRecords.set(trace.requestId, record);
    if (ghostTextRecords.size > MAX_GHOST_TEXT_RECORDS) {
      const oldestKey = ghostTextRecords.keys().next().value;
      if (oldestKey) ghostTextRecords.delete(oldestKey);
    }
  }

  if (trace.task === 'ghost-text') {
    record.model = trace.model;
    record.device = trace.device;
    record.dtype = trace.dtype;
    record.generationStatus = trace.status;
    if (typeof trace.inferenceMs === 'number') record.inferenceMs = trace.inferenceMs;
    if (typeof trace.totalLatencyMs === 'number') record.totalLatencyMs = trace.totalLatencyMs;
  } else if (trace.task === 'ghost-text-ui') {
    record.uiStatus = trace.status;
    record.discardReason = trace.discardReason;
    if (typeof trace.outputChars === 'number') record.outputChars = trace.outputChars;
  }
}

export function getGhostTextPerfReport() {
  const records = Array.from(ghostTextRecords.values()).sort((a, b) => a.timestamp - b.timestamp);
  const count = records.length;
  if (count === 0) {
    return {
      message: '尚未收集到端侧幽灵文本推理记录。请在文档中停顿等待补全出现后再试。',
      count: 0,
    };
  }

  // 区分「首次冷启动 (Cold Start)」与「后续稳态热推理 (Warm Inference)」
  const firstRecord = records[0];
  const steadyRecords = records.length > 1 ? records.slice(1) : [];

  const coldStartStr = firstRecord.totalLatencyMs
    ? `${firstRecord.totalLatencyMs.toFixed(1)} ms (GPU: ${firstRecord.inferenceMs?.toFixed(1) ?? 'N/A'} ms)`
    : 'N/A';

  // 稳态数据集合（剔除首次冷启动）
  const targetRecords = steadyRecords.length > 0 ? steadyRecords : [firstRecord];

  const renderedRecords = records.filter((r) => r.uiStatus === 'rendered');
  const discardedRecords = records.filter(
    (r) => r.uiStatus === 'discarded' || r.generationStatus === 'stale',
  );

  const steadyTotalLatencies = targetRecords
    .map((r) => r.totalLatencyMs)
    .filter((v): v is number => typeof v === 'number');
  const steadyInferences = targetRecords
    .map((r) => r.inferenceMs)
    .filter((v): v is number => typeof v === 'number');
  const steadyRendered = targetRecords.filter((r) => r.uiStatus === 'rendered');
  const steadyChars = steadyRendered
    .map((r) => r.outputChars)
    .filter((v): v is number => typeof v === 'number');

  const avg = (arr: number[]) =>
    arr.length ? (arr.reduce((acc, v) => acc + v, 0) / arr.length).toFixed(1) : 'N/A';
  const p50 = (arr: number[]) => (arr.length ? percentile(arr, 50).toFixed(1) : 'N/A');
  const p95 = (arr: number[]) => (arr.length ? percentile(arr, 95).toFixed(1) : 'N/A');
  const max = (arr: number[]) => (arr.length ? Math.max(...arr).toFixed(1) : 'N/A');

  const renderedCount = renderedRecords.length;
  const discardedCount = discardedRecords.length;

  return {
    '采样总请求数 (次)': count,
    '首次冷启动延迟 (已单独剥离)': coldStartStr,
    '稳态热推理样本数 (次)': steadyRecords.length,
    '稳态平均端到端延迟 (ms)': avg(steadyTotalLatencies),
    '稳态 P50 端到端延迟 (ms)': p50(steadyTotalLatencies),
    '稳态 P95 端到端延迟 (ms)': p95(steadyTotalLatencies),
    '稳态最大端到端延迟 (ms)': max(steadyTotalLatencies),
    '稳态平均 GPU 纯推理耗时 (ms)': avg(steadyInferences),
    '稳态 P50 推理耗时 (ms)': p50(steadyInferences),
    '稳态 P95 推理耗时 (ms)': p95(steadyInferences),
    '成功呈现上屏 (次)': `${renderedCount} (${((renderedCount / count) * 100).toFixed(1)}%)`,
    '判定过期/放弃 (次)': `${discardedCount} (${((discardedCount / count) * 100).toFixed(1)}%)`,
    '稳态平均生成字数 (字)': avg(steadyChars),
  };
}

if (typeof window !== 'undefined') {
  window.__DUET_AI_PERF__ = {
    log() {
      const report = getGhostTextPerfReport();
      if ('message' in report) {
        console.warn(report.message);
      } else {
        console.table(report);
      }
    },
    reset() {
      ghostTextRecords.clear();
      console.log('🔄 [DUET_AI_PERF] 幽灵文本性能数据已清空。');
    },
    getRawRecords() {
      return Array.from(ghostTextRecords.values());
    },
  };
}

export function logAITrace(trace: AITrace): void {
  recordGhostTextTrace(trace);

  const isDebugEnabled = import.meta.env.DEV || import.meta.env.VITE_AI_DEBUG === 'true';

  if (!isDebugEnabled) {
    return;
  }

  const kindLabel = trace.kind ? `[${trace.kind}]` : '';
  const label = `[AI][${trace.runtime}]${kindLabel}[${trace.task}] ${trace.status}`;

  console.groupCollapsed(label);
  console.log(trace);
  console.groupEnd();
}
