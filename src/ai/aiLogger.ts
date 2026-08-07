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

export function logAITrace(trace: AITrace): void {
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
