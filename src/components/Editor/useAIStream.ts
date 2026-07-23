import { useState, useRef, useCallback, useEffect } from 'react';
import { AIDispatcher } from '../../ai/dispatcher';
import type { AIRequest } from '../../ai/types';

export function useAIStream() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  const startStream = useCallback(
    (request: AIRequest) => {
      // 中断先前的请求
      abortStream();

      setError(null);
      setGeneratedText('');
      setIsGenerating(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      AIDispatcher.streamCloudTask(
        request,
        {
          onStart: () => {
            setIsGenerating(true);
          },
          onTextDelta: (delta) => {
            setGeneratedText((prev) => prev + delta);
          },
          onFinish: () => {
            if (abortControllerRef.current === controller) {
              setIsGenerating(false);
              abortControllerRef.current = null;
            }
          },
          onError: (err) => {
            if (abortControllerRef.current === controller) {
              setError(err);
              setIsGenerating(false);
              abortControllerRef.current = null;
            }
          },
        },
        controller.signal
      ).catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') {
          // Ignore abort error silently in UI
          return;
        }
        console.error('streamCloudTask failed:', err);
        if (abortControllerRef.current === controller) {
          setError({ code: 'UNEXPECTED_ERROR', message: err instanceof Error ? err.message : String(err) });
          setIsGenerating(false);
          abortControllerRef.current = null;
        }
      });
    },
    [abortStream]
  );

  const resetState = useCallback(() => {
    abortStream();
    setGeneratedText('');
    setError(null);
    setIsGenerating(false);
  }, [abortStream]);

  useEffect(() => {
    return () => {
      abortStream();
    };
  }, [abortStream]);

  return {
    isGenerating,
    generatedText,
    error,
    startStream,
    abortStream,
    resetState,
  };
}
