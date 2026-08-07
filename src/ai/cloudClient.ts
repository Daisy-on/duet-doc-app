import type { AIRequest, StreamCallbacks, AIStreamEventData, AIStreamError } from './types';
import { buildApiUrl } from '../utils/apiUtils';
import { logAITrace, type AITrace, type AITraceStatus } from './aiLogger';

export async function streamCloudAI(
  request: AIRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const url = buildApiUrl('/api/v1/ai/stream');
  const requestId = request.requestId ?? crypto.randomUUID();
  request.requestId = requestId;

  const requestStartTime = performance.now();
  let clientFirstDeltaAt: number | null = null;
  let clientFirstTextAt: number | null = null;

  const trace: AITrace = {
    requestId,
    runtime: 'cloud',
    kind: 'generation',
    task: request.task,
    status: 'started',
  };

  let isTraceFinalized = false;
  const finalizeTrace = (status: AITraceStatus, extra?: Partial<AITrace>) => {
    if (isTraceFinalized) return;
    isTraceFinalized = true;

    trace.status = status;
    trace.clientTotalLatencyMs = Math.round(performance.now() - requestStartTime);
    if (clientFirstDeltaAt !== null) {
      trace.clientFirstDeltaMs = Math.round(clientFirstDeltaAt - requestStartTime);
    }
    if (clientFirstTextAt !== null) {
      trace.clientFirstTextMs = Math.round(clientFirstTextAt - requestStartTime);
    }

    if (extra) {
      Object.assign(trace, extra);
    }

    logAITrace(trace);
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      finalizeTrace('aborted');
      throw err;
    }
    const errObj: AIStreamError = {
      code: 'NETWORK_ERROR',
      message: err instanceof Error ? err.message : 'Network request failed',
      requestId,
    };
    finalizeTrace('failed', { errorCode: errObj.code, errorMessage: errObj.message });
    callbacks.onError?.(errObj);
    return;
  }

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error?.message) errorMsg = errJson.error.message;
    } catch {
      // Ignore parse failure
    }
    const errObj: AIStreamError = {
      code: `HTTP_${response.status}`,
      message: errorMsg,
      requestId,
    };
    finalizeTrace('failed', { errorCode: errObj.code, errorMessage: errObj.message });
    callbacks.onError?.(errObj);
    return;
  }

  if (!response.body) {
    const errObj: AIStreamError = {
      code: 'NO_BODY',
      message: 'Response body is empty',
      requestId,
    };
    finalizeTrace('failed', { errorCode: errObj.code, errorMessage: errObj.message });
    callbacks.onError?.(errObj);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (!part.trim()) continue;
        parseAndEmitEvent(part, callbacks, trace, {
          onDeltaReceived: () => {
            if (clientFirstDeltaAt === null) clientFirstDeltaAt = performance.now();
          },
          onTextReceived: () => {
            if (clientFirstTextAt === null) clientFirstTextAt = performance.now();
          },
          finalizeTrace,
        });
      }
    }

    if (buffer.trim()) {
      parseAndEmitEvent(buffer, callbacks, trace, {
        onDeltaReceived: () => {
          if (clientFirstDeltaAt === null) clientFirstDeltaAt = performance.now();
        },
        onTextReceived: () => {
          if (clientFirstTextAt === null) clientFirstTextAt = performance.now();
        },
        finalizeTrace,
      });
    }

    finalizeTrace('completed');
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      finalizeTrace('aborted');
      throw err;
    }
    const errObj: AIStreamError = {
      code: 'STREAM_ERROR',
      message: err instanceof Error ? err.message : 'Stream processing failed',
      requestId,
    };
    finalizeTrace('failed', { errorCode: errObj.code, errorMessage: errObj.message });
    callbacks.onError?.(errObj);
  }
}

function parseAndEmitEvent(
  rawBlock: string,
  callbacks: StreamCallbacks,
  trace: AITrace,
  helpers: {
    onDeltaReceived: () => void;
    onTextReceived: () => void;
    finalizeTrace: (status: AITraceStatus, extra?: Partial<AITrace>) => void;
  },
) {
  const lines = rawBlock.split(/\r?\n/);
  let dataStr = '';

  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataStr = line.slice(5).trim();
    }
  }

  if (!dataStr) return;

  try {
    const data: AIStreamEventData = JSON.parse(dataStr);
    switch (data.event) {
      case 'start':
        if (data.provider) trace.provider = data.provider;
        if (data.model) trace.model = data.model;
        if (data.routeReason) trace.routeReason = data.routeReason;
        callbacks.onStart?.(data);
        break;

      case 'text_delta':
        helpers.onDeltaReceived();
        helpers.onTextReceived();
        if (data.text) callbacks.onTextDelta?.(data.text, data);
        break;

      case 'reasoning_delta':
        helpers.onDeltaReceived();
        if (data.text) callbacks.onReasoningDelta?.(data.text, data);
        break;

      case 'usage':
        if (data.usage) trace.usage = data.usage;
        if (data.routeReason) trace.routeReason = data.routeReason;
        callbacks.onUsage?.(data);
        break;

      case 'finish':
        if (data.finishReason) trace.finishReason = data.finishReason;
        if (data.ttftMs) trace.ttftMs = data.ttftMs;
        if (data.totalLatencyMs) trace.totalLatencyMs = data.totalLatencyMs;
        if (data.routeReason) trace.routeReason = data.routeReason;
        callbacks.onFinish?.(data);
        break;

      case 'error': {
        const errObj: AIStreamError = data.error || {
          code: 'UNKNOWN_ERROR',
          message: 'Stream error received',
          requestId: data.requestId,
        };
        helpers.finalizeTrace('failed', { errorCode: errObj.code, errorMessage: errObj.message });
        callbacks.onError?.(errObj, data);
        break;
      }
    }
  } catch {
    // Ignore malformed JSON
  }
}
