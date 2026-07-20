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

export type StreamEventType =
  | 'start'
  | 'reasoning_delta'
  | 'text_delta'
  | 'usage'
  | 'finish'
  | 'error';

export interface AIStreamEventData {
  event: StreamEventType;
  requestId?: string;
  text?: string;
  reasoningText?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface StreamCallbacks {
  onStart?: () => void;
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onFinish?: () => void;
  onError?: (err: { code: string; message: string }) => void;
}
