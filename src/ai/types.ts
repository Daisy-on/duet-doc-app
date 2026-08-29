export type CloudAITask = 'chat' | 'rewrite' | 'expand' | 'explain' | 'summarize';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type ContextSourceType = 'document' | 'memo' | 'selection';
export type ContextOrigin = 'manual' | 'local_retrieval' | 'cloud_retrieval';
export type AICapability = 'knowledge_search';
export type ToolChoice = 'none' | 'auto';
export type AssistantToolName = 'search_knowledge_base';

export interface AIMessage {
  role: MessageRole;
  content: string;
}

export interface AIContext {
  sourceId: string;
  title: string;
  content: string;
  sourceType?: ContextSourceType;
  origin?: ContextOrigin;
  chunkId?: string;
  chunkIndex?: number;
  headingPath?: string[];
  score?: number;
}

export interface AIToolCall {
  id: string;
  name: AssistantToolName;
  arguments: {
    query?: string;
    sourceTypes?: ContextSourceType[];
    sortBy?: 'relevance' | 'updatedAt';
    timeRangeDays?: number;
    topK?: number;
  };
  reasoningContent?: string;
}

export interface AIToolContinuation {
  toolCall: AIToolCall;
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
  capabilities?: AICapability[];
  toolChoice?: ToolChoice;
  toolContinuation?: AIToolContinuation;
  options?: AIOptions;
  metadata?: {
    sessionId?: string;
    documentId?: string;
    runId?: string;
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
  'start' | 'reasoning_delta' | 'text_delta' | 'usage' | 'tool_call' | 'finish' | 'error';

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

export interface AIToolCallEvent {
  event: 'tool_call';
  requestId?: string;
  toolCall?: AIToolCall;
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
  | AIToolCallEvent
  | AIFinishEvent
  | AIErrorEvent;

export interface StreamCallbacks {
  onStart?: (event?: AIStartEvent) => void;
  onTextDelta?: (delta: string, event?: AITextDeltaEvent) => void;
  onReasoningDelta?: (delta: string, event?: AIReasoningDeltaEvent) => void;
  onUsage?: (event: AIUsageEvent) => void;
  onToolCall?: (event: AIToolCallEvent) => void;
  onFinish?: (event?: AIFinishEvent) => void;
  onError?: (err: AIStreamError, event?: AIErrorEvent) => void;
}
