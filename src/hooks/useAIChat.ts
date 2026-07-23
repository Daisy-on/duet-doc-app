import { useState, useRef, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { AIDispatcher } from '../ai/dispatcher';
import type { AIMessage, AIContext, AIRequest } from '../ai/types';
import { useAIWritingStore, type ChatMessage, type ReferencedDoc } from '../store/aiWritingStore';
import { db } from '../db';
import { extractPlainTextFromTiptap } from '../utils/tiptapUtils';

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

  // 异步给新 Session 自动生成简短优雅标题
  const summarizeAndSetTitle = useCallback(async (targetSessionId: string, userPrompt: string) => {
    try {
      let titleResult = '';
      await AIDispatcher.streamCloudTask(
        {
          task: 'chat',
          messages: [
            {
              role: 'user',
              content: `请总结下面这句话为一句简短完整的标题（绝对不要超过 20 个字，不要带标点、引号或省略号，直接输出完整标题文字）：\n\n"${userPrompt}"`,
            },
          ],
          options: { thinking: false, temperature: 0.3, maxTokens: 40 },
        },
        {
          onTextDelta: (delta) => {
            titleResult += delta;
          },
          onFinish: async () => {
            const cleanTitle = titleResult
              .trim()
              .replace(/^["'「」]/, '')
              .replace(/["'「」]$/, '')
              .replace(/(\.\.\.|\u2026)$/, '')
              .slice(0, 30);
            if (cleanTitle) {
              const updatedAt = Date.now();
              await db.chatSessions.update(targetSessionId, { title: cleanTitle, updatedAt });
              useAIWritingStore.setState((state) => ({
                sessions: state.sessions.map((s) => (s.id === targetSessionId ? { ...s, title: cleanTitle, updatedAt } : s)),
              }));
            }
          },
        }
      );
    } catch {
      // 失败默默忽略，使用默认兜底
    }
  }, []);

  const sendChatMessage = useCallback(
    async (userContent: string, referencedDocs: ReferencedDoc[] = [], overrideSessionId?: string) => {
      const targetSessionId = overrideSessionId || sessionId;
      if (!targetSessionId || !userContent.trim() || isGenerating) return;

      stopGeneration();
      setIsGenerating(true);

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

      // 如果当前 Session 标题还是默认的 "新对话"，触发后台智能摘要标题
      const targetSession = useAIWritingStore.getState().sessions.find((s) => s.id === targetSessionId);
      if (targetSession && (targetSession.title === '新对话' || !targetSession.title)) {
        summarizeAndSetTitle(targetSessionId, userContent.trim());
      }

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
                content: extractPlainTextFromTiptap(fullDoc.content),
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

              await commitMessage(finalMessage);
              if (abortControllerRef.current === controller) {
                setIsGenerating(false);
                abortControllerRef.current = null;
              }
            },
            onError: async () => {
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
              if (abortControllerRef.current === controller) {
                setIsGenerating(false);
                abortControllerRef.current = null;
              }
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
        if (abortControllerRef.current === controller) {
          setIsGenerating(false);
          abortControllerRef.current = null;
        }
      }
    },
    [sessionId, isGenerating, isThinkingEnabled, addMessage, updateMessageStream, commitMessage, removeMessage, stopGeneration, summarizeAndSetTitle]
  );

  // 重新生成当前 Assistant 回答
  const regenerateResponse = useCallback(
    async (assistantMsgId: string) => {
      if (!sessionId || isGenerating) return;

      const currentMessages = useAIWritingStore.getState().messages;
      const sessionMsgs = currentMessages.filter((m) => m.sessionId === sessionId).sort((a, b) => a.createdAt - b.createdAt);

      const targetIdx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
      if (targetIdx === -1) return;

      // 找到上条 User 消息
      let prevUserMsg: ChatMessage | null = null;
      for (let i = targetIdx - 1; i >= 0; i--) {
        if (sessionMsgs[i].role === 'user') {
          prevUserMsg = sessionMsgs[i];
          break;
        }
      }

      if (!prevUserMsg) return;

      // 移除从目标 Assistant 消息开始及其后的所有消息
      const toDeleteMsgs = sessionMsgs.slice(targetIdx);
      for (const m of toDeleteMsgs) {
        await removeMessage(m.id);
      }

      // 注意：上一条 User 消息也在之前的删除列表中被保留了，我们需要重新触发回答。
      // 为了让 sendChatMessage 能直接针对那条 User 消息生成回复，先把那条 User 消息也移除，然后用其 prompt 重新 call sendChatMessage
      await removeMessage(prevUserMsg.id);

      await sendChatMessage(prevUserMsg.content, prevUserMsg.referencedDocs || []);
    },
    [sessionId, isGenerating, removeMessage, sendChatMessage]
  );

  useEffect(() => {
    return () => {
      stopGeneration();
    };
  }, [stopGeneration]);

  return {
    isGenerating,
    sendChatMessage,
    regenerateResponse,
    stopGeneration,
  };
}
