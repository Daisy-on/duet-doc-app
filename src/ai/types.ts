export type CloudAITask = 'chat' | 'rewrite' | 'expand' | 'explain' | 'summarize';

export type MessageRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
  role: MessageRole;
  content: string;
}

export interface AIContext {
  sourceId: string;
  title: string;
  content: string;
  sourceType?: 'document' | 'selection';
}

export interface AIOptions {
  thinking?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface AIRequest {
  requestId?: string;
  task: CloudAITask;
  messages?: AIMessage[];
  instruction?: string;
  selectedText?: string;
  contexts?: AIContext[];
  options?: AIOptions;
  metadata?: {
    sessionId?: string;
    documentId?: string;
  };
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AIStreamError {
  code: string;
  message: string;
  requestId?: string;
  retryable?: boolean;
}

export interface AIResponseMetadata {
  requestId?: string;
  provider?: string;
  model?: string;
  routeReason?: string;
  finishReason?: string;
  ttftMs?: number;
  totalLatencyMs?: number;
  usage?: AIUsage;
}

export type StreamEventType =
  'start' | 'reasoning_delta' | 'text_delta' | 'usage' | 'finish' | 'error';

export interface AIStartEvent {
  event: 'start';
  requestId?: string;
  provider?: string;
  model?: string;
  routeReason?: string;
}

export interface AIReasoningDeltaEvent {
  event: 'reasoning_delta';
  requestId?: string;
  text?: string;
}

export interface AITextDeltaEvent {
  event: 'text_delta';
  requestId?: string;
  text?: string;
}

export interface AIUsageEvent {
  event: 'usage';
  requestId?: string;
  usage?: AIUsage;
  routeReason?: string;
}

export interface AIFinishEvent {
  event: 'finish';
  requestId?: string;
  finishReason?: string;
  ttftMs?: number;
  totalLatencyMs?: number;
  routeReason?: string;
}

export interface AIErrorEvent {
  event: 'error';
  requestId?: string;
  error?: AIStreamError;
}

export type AIStreamEventData =
  | AIStartEvent
  | AIReasoningDeltaEvent
  | AITextDeltaEvent
  | AIUsageEvent
  | AIFinishEvent
  | AIErrorEvent;

export interface StreamCallbacks {
  onStart?: (event?: AIStartEvent) => void;
  onTextDelta?: (delta: string, event?: AITextDeltaEvent) => void;
  onReasoningDelta?: (delta: string, event?: AIReasoningDeltaEvent) => void;
  onUsage?: (event: AIUsageEvent) => void;
  onFinish?: (event?: AIFinishEvent) => void;
  onError?: (err: AIStreamError, event?: AIErrorEvent) => void;
}
