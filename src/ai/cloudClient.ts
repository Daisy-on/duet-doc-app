import type { AIRequest, StreamCallbacks, AIStreamEventData } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function streamCloudAI(
  request: AIRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const url = `${API_BASE_URL}/api/v1/ai/stream`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return;
    callbacks.onError?.({ code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Network request failed' });
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
    callbacks.onError?.({ code: `HTTP_${response.status}`, message: errorMsg });
    return;
  }

  if (!response.body) {
    callbacks.onError?.({ code: 'NO_BODY', message: 'Response body is empty' });
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
        parseAndEmitEvent(part, callbacks);
      }
    }

    if (buffer.trim()) {
      parseAndEmitEvent(buffer, callbacks);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    callbacks.onError?.({ code: 'STREAM_ERROR', message: err instanceof Error ? err.message : 'Stream processing failed' });
  }
}

function parseAndEmitEvent(rawBlock: string, callbacks: StreamCallbacks) {
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
        callbacks.onStart?.();
        break;
      case 'text_delta':
        if (data.text) callbacks.onTextDelta?.(data.text);
        break;
      case 'reasoning_delta':
        if (data.text) callbacks.onReasoningDelta?.(data.text);
        break;
      case 'finish':
        callbacks.onFinish?.();
        break;
      case 'error':
        callbacks.onError?.(data.error || { code: 'UNKNOWN_ERROR', message: 'Stream error received' });
        break;
    }
  } catch {
    // Ignore malformed JSON
  }
}
