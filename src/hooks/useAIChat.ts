import { useState, useRef, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { AIDispatcher } from '../ai/dispatcher';
import type { AIMessage, AIContext, AIRequest } from '../ai/types';
import { useAIWritingStore, type ChatMessage, type ReferencedDoc } from '../store/aiWritingStore';
import { db } from '../db';

const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARS = 30000;

export function useAIChat(sessionId: string | null) {
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSessionIdRef = useRef<string | null>(sessionId);

  useEffect(() => {
    activeSessionIdRef.current = sessionId;
  }, [sessionId]);

  const reasoningBufferRef = useRef('');
  const textBufferRef = useRef('');
  const rafIdRef = useRef<number | null>(null);

  const { isThinkingEnabled, addMessage, updateMessageStream, commitMessage, removeMessage } =
    useAIWritingStore();

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  const sendChatMessage = useCallback(
    async (userContent: string, referencedDocs: ReferencedDoc[] = []) => {
      if (!sessionId || !userContent.trim() || isGenerating) return;

      stopGeneration();
      setIsGenerating(true);

      const targetSessionId = sessionId;

      // 1. 创建 User 消息并保存
      const userMsg: ChatMessage = {
        id: `msg-${nanoid(12)}`,
        sessionId: targetSessionId,
        role: 'user',
        content: userContent.trim(),
        referencedDocs,
        createdAt: Date.now(),
      };
      await addMessage(userMsg);

      // 2. 创建 Assistant 内存草稿
      const assistantMsgId = `msg-${nanoid(12)}`;
      const assistantDraft: ChatMessage = {
        id: assistantMsgId,
        sessionId: targetSessionId,
        role: 'assistant',
        content: '',
        thinkingContent: '',
        status: 'streaming',
        createdAt: Date.now(),
      };

      useAIWritingStore.setState((state) => ({
        messages: [...state.messages, assistantDraft],
      }));

      // 3. 准备历史消息
      const currentMessages = useAIWritingStore.getState().messages;
      const historyMsgList = currentMessages
        .filter(
          (m) =>
            m.sessionId === targetSessionId &&
            m.id !== assistantMsgId &&
            m.id !== userMsg.id &&
            (m.status === undefined || m.status === 'complete' || m.status === 'stopped') &&
            m.content.trim().length > 0
        )
        .sort((a, b) => a.createdAt - b.createdAt);

      const slicedHistory = historyMsgList.slice(-MAX_HISTORY_MESSAGES);

      let totalChars = 0;
      const payloadMessages: AIMessage[] = [];

      for (let i = slicedHistory.length - 1; i >= 0; i--) {
        const m = slicedHistory[i];
        if (totalChars + m.content.length > MAX_HISTORY_CHARS) break;
        totalChars += m.content.length;
        payloadMessages.unshift({
          role: m.role,
          content: m.content,
        });
      }

      payloadMessages.push({
        role: 'user',
        content: userContent.trim(),
      });

      // 4. 处理知识库引用上下文
      const contexts: AIContext[] = [];
      if (referencedDocs.length > 0) {
        for (const docRef of referencedDocs) {
          try {
            const fullDoc = await db.documents.get(docRef.id);
            if (fullDoc) {
              contexts.push({
                sourceId: fullDoc.id,
                title: fullDoc.title,
                content: fullDoc.content,
                sourceType: 'document',
              });
            }
          } catch {
            // Ignore missing doc
          }
        }
      }

      // 5. 准备请求
      const request: AIRequest = {
        task: 'chat',
        messages: payloadMessages,
        contexts: contexts.length > 0 ? contexts : undefined,
        options: {
          thinking: isThinkingEnabled,
          maxTokens: 4096,
          temperature: 0.5,
        },
        metadata: {
          sessionId: targetSessionId,
        },
      };

      const controller = new AbortController();
      abortControllerRef.current = controller;

      reasoningBufferRef.current = '';
      textBufferRef.current = '';

      const scheduleRAFUpdate = () => {
        if (rafIdRef.current !== null) return;
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          updateMessageStream(assistantMsgId, {
            thinkingContent: reasoningBufferRef.current,
            content: textBufferRef.current,
          });
        });
      };

      try {
        await AIDispatcher.streamCloudTask(
          request,
          {
            onReasoningDelta: (delta) => {
              reasoningBufferRef.current += delta;
              scheduleRAFUpdate();
            },
            onTextDelta: (delta) => {
              textBufferRef.current += delta;
              scheduleRAFUpdate();
            },
            onFinish: async () => {
              if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }

              const finalMessage: ChatMessage = {
                ...assistantDraft,
                thinkingContent: reasoningBufferRef.current,
                content: textBufferRef.current,
                status: 'complete',
              };

              if (activeSessionIdRef.current === targetSessionId) {
                await commitMessage(finalMessage);
              }
              setIsGenerating(false);
              abortControllerRef.current = null;
            },
            onError: async (_err) => {
              if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }

              if (textBufferRef.current || reasoningBufferRef.current) {
                const finalMessage: ChatMessage = {
                  ...assistantDraft,
                  thinkingContent: reasoningBufferRef.current,
                  content: textBufferRef.current,
                  status: 'error',
                };
                await commitMessage(finalMessage);
              } else {
                await removeMessage(assistantMsgId);
              }
              setIsGenerating(false);
              abortControllerRef.current = null;
            },
          },
          controller.signal
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          if (textBufferRef.current || reasoningBufferRef.current) {
            const stoppedMessage: ChatMessage = {
              ...assistantDraft,
              thinkingContent: reasoningBufferRef.current,
              content: textBufferRef.current,
              status: 'stopped',
            };
            await commitMessage(stoppedMessage);
          } else {
            await removeMessage(assistantMsgId);
          }
        }
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    },
    [sessionId, isGenerating, isThinkingEnabled, addMessage, updateMessageStream, commitMessage, removeMessage, stopGeneration]
  );

  useEffect(() => {
    return () => {
      stopGeneration();
    };
  }, [stopGeneration]);

  return {
    isGenerating,
    sendChatMessage,
    stopGeneration,
  };
}
