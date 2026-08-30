import { useState, useRef, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { AIDispatcher } from '../ai/dispatcher';
import type {
  AIMessage,
  AIContext,
  AIRequest,
  AIResponseMetadata,
  AIToolCall,
  AIFinishEvent,
  StreamCallbacks,
} from '../ai/types';
import {
  useAIWritingStore,
  type ChatMessage,
  type KnowledgeSource,
  type ReferencedDoc,
} from '../store/aiWritingStore';
import { db } from '../db';
import { extractPlainTextFromTiptap } from '../utils/tiptapUtils';
import { searchLocalKnowledge } from '../rag/localRetriever';
import type { RetrievedChunk } from '../rag/types';

const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARS = 30000;

interface StreamRun {
  token: symbol;
  controller: AbortController;
  assistantMsgId: string;
  targetSessionId: string;

  textBuffer: string;
  reasoningBuffer: string;
  knowledgeSources: KnowledgeSource[];
  rafId: number | null;
  thinkingStartTime: number;
  thinkingDurationMs: number;
  currentResponseMetadata: AIResponseMetadata;

  stopRequested: boolean;
  finalized: boolean;
  finalizationPromise: Promise<void> | null;
}

function toResponseMetadata(event?: AIFinishEvent): Partial<AIResponseMetadata> {
  if (!event) return {};

  return {
    finishReason: event.finishReason,
    ttftMs: event.ttftMs,
    totalLatencyMs: event.totalLatencyMs,
    routeReason: event.routeReason,
  };
}

function toRetrievedContext(chunk: RetrievedChunk): AIContext {
  return {
    sourceId: chunk.sourceId,
    title: chunk.title,
    content: chunk.content,
    sourceType: chunk.sourceType,
    origin: 'local_retrieval',
    chunkId: chunk.id,
    chunkIndex: chunk.chunkIndex,
    headingPath: chunk.headingPath,
    score: chunk.score,
  };
}

function toKnowledgeSource(chunk: RetrievedChunk): KnowledgeSource {
  return {
    sourceId: chunk.sourceId,
    sourceType: chunk.sourceType,
    title: chunk.title,
    chunkIndex: chunk.chunkIndex,
    headingPath: chunk.headingPath,
  };
}

export function useAIChat(sessionId: string | null) {
  const [isGenerating, setIsGenerating] = useState(false);
  const activeStreamRef = useRef<StreamRun | null>(null);
  const activeSessionIdRef = useRef<string | null>(sessionId);

  useEffect(() => {
    activeSessionIdRef.current = sessionId;
  }, [sessionId]);

  const { isThinkingEnabled, addMessage, updateMessageStream, commitMessage, removeMessage } =
    useAIWritingStore();

  const stopGeneration = useCallback(() => {
    const run = activeStreamRef.current;
    if (!run || run.finalized) return;
    run.stopRequested = true;
    run.controller.abort();
  }, []);

  const finalizeStream = useCallback(
    async (
      run: StreamRun,
      status: 'complete' | 'stopped' | 'error',
      eventMetadata?: Partial<AIResponseMetadata>,
    ): Promise<void> => {
      if (run.finalizationPromise) {
        return run.finalizationPromise;
      }

      const promise = (async () => {
        run.finalized = true;

        if (run.rafId !== null) {
          cancelAnimationFrame(run.rafId);
          run.rafId = null;
        }

        if (run.thinkingStartTime && !run.thinkingDurationMs) {
          run.thinkingDurationMs = Date.now() - run.thinkingStartTime;
        }

        if (eventMetadata) {
          Object.assign(run.currentResponseMetadata, eventMetadata);
        }

        // 如果用户曾请求过停止，且状态为 complete，修正终态为 stopped
        const finalStatus = run.stopRequested && status === 'complete' ? 'stopped' : status;
        const hasContent = Boolean(run.textBuffer.trim() || run.reasoningBuffer.trim());

        // 1. 同步更新 Zustand 内存状态，确保即使 IndexedDB 写库失败，UI 也不会卡在 streaming 状态
        useAIWritingStore.setState((state) => ({
          messages: state.messages
            .filter((m) =>
              finalStatus === 'error' && !hasContent ? m.id !== run.assistantMsgId : true,
            )
            .map((m) =>
              m.id === run.assistantMsgId
                ? {
                    ...m,
                    thinkingContent: run.reasoningBuffer,
                    thinkingDurationMs: run.thinkingDurationMs || undefined,
                    knowledgeSources: run.knowledgeSources,
                    content: run.textBuffer,
                    status: finalStatus,
                    aiMetadata:
                      Object.keys(run.currentResponseMetadata).length > 0
                        ? { ...run.currentResponseMetadata }
                        : undefined,
                  }
                : m,
            ),
        }));

        // 2. 异步持久化到 IndexedDB
        try {
          if (!hasContent) {
            await removeMessage(run.assistantMsgId);
          } else {
            const finalMessage: ChatMessage = {
              id: run.assistantMsgId,
              sessionId: run.targetSessionId,
              role: 'assistant',
              thinkingContent: run.reasoningBuffer,
              thinkingDurationMs: run.thinkingDurationMs || undefined,
              knowledgeSources: run.knowledgeSources,
              content: run.textBuffer,
              status: finalStatus,
              aiMetadata:
                Object.keys(run.currentResponseMetadata).length > 0
                  ? { ...run.currentResponseMetadata }
                  : undefined,
              createdAt: Date.now(),
            };
            await commitMessage(finalMessage);
          }
        } catch (err) {
          console.error('Failed to commit message in finalizeStream (IndexedDB error):', err);
        } finally {
          if (activeStreamRef.current === run) {
            activeStreamRef.current = null;
            setIsGenerating(false);
          }
        }
      })();

      run.finalizationPromise = promise;
      return promise;
    },
    [commitMessage, removeMessage],
  );

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
                sessions: state.sessions.map((s) =>
                  s.id === targetSessionId ? { ...s, title: cleanTitle, updatedAt } : s,
                ),
              }));
            }
          },
        },
      );
    } catch {
      // 失败默默忽略，使用默认兜底
    }
  }, []);

  const sendChatMessage = useCallback(
    async (
      userContent: string,
      referencedDocs: ReferencedDoc[] = [],
      overrideSessionId?: string,
    ) => {
      const targetSessionId = overrideSessionId || sessionId;
      if (!targetSessionId || !userContent.trim() || isGenerating) return;

      stopGeneration();
      setIsGenerating(true);

      const controller = new AbortController();
      const assistantMsgId = `msg-${nanoid(12)}`;
      const run: StreamRun = {
        token: Symbol('StreamRun'),
        controller,
        assistantMsgId,
        targetSessionId,
        textBuffer: '',
        reasoningBuffer: '',
        knowledgeSources: [],
        rafId: null,
        thinkingStartTime: 0,
        thinkingDurationMs: 0,
        currentResponseMetadata: {},
        stopRequested: false,
        finalized: false,
        finalizationPromise: null,
      };

      // 早期登记：在任何异步准备逻辑执行前，立即注册当前 activeStream
      activeStreamRef.current = run;

      try {
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

        if (run.stopRequested || run.controller.signal.aborted) {
          await finalizeStream(run, 'stopped');
          return;
        }

        // 如果当前 Session 标题还是默认的 "新对话"，触发后台智能摘要标题
        const targetSession = useAIWritingStore
          .getState()
          .sessions.find((s) => s.id === targetSessionId);
        if (targetSession && (targetSession.title === '新对话' || !targetSession.title)) {
          summarizeAndSetTitle(targetSessionId, userContent.trim());
        }

        // 2. 创建 Assistant 内存草稿
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

        if (run.stopRequested || run.controller.signal.aborted) {
          await finalizeStream(run, 'stopped');
          return;
        }

        // 3. 准备历史消息
        const currentMessages = useAIWritingStore.getState().messages;
        const historyMsgList = currentMessages
          .filter(
            (m) =>
              m.sessionId === targetSessionId &&
              m.id !== assistantMsgId &&
              m.id !== userMsg.id &&
              (m.status === undefined || m.status === 'complete' || m.status === 'stopped') &&
              m.content.trim().length > 0,
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
                  origin: 'manual',
                });
              }
            } catch {
              // Ignore missing doc
            }
          }
        }

        if (run.stopRequested || run.controller.signal.aborted) {
          await finalizeStream(run, 'stopped');
          return;
        }

        // 5. 准备请求
        const request: AIRequest = {
          task: 'chat',
          messages: payloadMessages,
          contexts: contexts.length > 0 ? contexts : undefined,
          capabilities: ['knowledge_search'],
          toolChoice: 'auto',
          options: {
            thinking: isThinkingEnabled,
            maxTokens: 4096,
            temperature: 0.5,
          },
          metadata: {
            sessionId: targetSessionId,
          },
        };

        const scheduleRAFUpdate = () => {
          if (run.finalized || run.rafId !== null) return;
          run.rafId = requestAnimationFrame(() => {
            run.rafId = null;
            if (run.finalized) return;
            updateMessageStream(run.assistantMsgId, {
              thinkingContent: run.reasoningBuffer,
              content: run.textBuffer,
            });
          });
        };

        let requestedToolCall: AIToolCall | undefined;
        let streamFailed = false;
        let finishMetadata: Partial<AIResponseMetadata> = {};
        const createStreamCallbacks = (
          onToolCall?: (toolCall: AIToolCall) => void,
        ): StreamCallbacks => ({
          onStart: (event) => {
            if (run.finalized || !event) return;
            if (event.requestId) run.currentResponseMetadata.requestId = event.requestId;
            if (event.provider) run.currentResponseMetadata.provider = event.provider;
            if (event.model) run.currentResponseMetadata.model = event.model;
            if (event.routeReason) run.currentResponseMetadata.routeReason = event.routeReason;
          },
          onReasoningDelta: (delta) => {
            if (run.finalized) return;
            if (!run.thinkingStartTime) run.thinkingStartTime = Date.now();
            run.reasoningBuffer += delta;
            scheduleRAFUpdate();
          },
          onTextDelta: (delta) => {
            if (run.finalized) return;
            if (run.thinkingStartTime && !run.thinkingDurationMs) {
              run.thinkingDurationMs = Date.now() - run.thinkingStartTime;
            }
            run.textBuffer += delta;
            scheduleRAFUpdate();
          },
          onUsage: (event) => {
            if (run.finalized) return;
            if (event.usage) run.currentResponseMetadata.usage = event.usage;
            if (event.routeReason) run.currentResponseMetadata.routeReason = event.routeReason;
          },
          onToolCall: (event) => {
            if (event.toolCall) onToolCall?.(event.toolCall);
          },
          onFinish: (event) => {
            finishMetadata = toResponseMetadata(event);
          },
          onError: () => {
            streamFailed = true;
          },
        });

        await AIDispatcher.streamCloudTask(
          request,
          createStreamCallbacks((toolCall) => {
            requestedToolCall = toolCall;
          }),
          run.controller.signal,
        );

        if (streamFailed) {
          await finalizeStream(run, 'error');
          return;
        }
        if (run.stopRequested || run.controller.signal.aborted) {
          await finalizeStream(run, 'stopped');
          return;
        }

        if (requestedToolCall) {
          // The gateway requests a capability; the browser executes the local search.
          run.textBuffer = '';
          const { query, sourceTypes, sortBy, timeRangeDays, topK } = requestedToolCall.arguments;
          const localSourceTypes = sourceTypes?.filter(
            (sourceType): sourceType is 'document' | 'memo' => sourceType !== 'selection',
          );
          const minimumUpdatedAt = timeRangeDays
            ? Date.now() - timeRangeDays * 24 * 60 * 60 * 1000
            : undefined;
          const retrievedChunks = await searchLocalKnowledge(query?.trim() || userContent.trim(), {
            sourceTypes: localSourceTypes,
            sortBy,
            limit: topK,
          });
          const retrievedContexts = retrievedChunks
            .filter((chunk) => !minimumUpdatedAt || chunk.sourceUpdatedAt >= minimumUpdatedAt)
            .map(toRetrievedContext);
          run.knowledgeSources = retrievedChunks
            .filter((chunk) => !minimumUpdatedAt || chunk.sourceUpdatedAt >= minimumUpdatedAt)
            .map(toKnowledgeSource);

          if (run.stopRequested || run.controller.signal.aborted) {
            await finalizeStream(run, 'stopped');
            return;
          }

          streamFailed = false;
          finishMetadata = {};
          await AIDispatcher.streamCloudTask(
            {
              ...request,
              contexts: [...contexts, ...retrievedContexts],
              toolChoice: 'none',
              toolContinuation: { toolCall: requestedToolCall },
            },
            createStreamCallbacks(),
            run.controller.signal,
          );

          if (streamFailed) {
            await finalizeStream(run, 'error');
            return;
          }
        }

        await finalizeStream(run, run.stopRequested ? 'stopped' : 'complete', finishMetadata);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          run.finalizationPromise = finalizeStream(run, 'stopped');
        } else {
          run.finalizationPromise = finalizeStream(run, 'error');
        }
      }

      if (!run.finalized) {
        await finalizeStream(run, run.stopRequested ? 'stopped' : 'error', {
          routeReason: 'unexpected_eof',
        });
      } else if (run.finalizationPromise) {
        await run.finalizationPromise;
      }
    },
    [
      sessionId,
      isGenerating,
      isThinkingEnabled,
      addMessage,
      updateMessageStream,
      finalizeStream,
      stopGeneration,
      summarizeAndSetTitle,
    ],
  );

  // 重新生成当前 Assistant 回答
  const regenerateResponse = useCallback(
    async (assistantMsgId: string) => {
      if (!sessionId || isGenerating) return;

      const currentMessages = useAIWritingStore.getState().messages;
      const sessionMsgs = currentMessages
        .filter((m) => m.sessionId === sessionId)
        .sort((a, b) => a.createdAt - b.createdAt);

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

      await removeMessage(prevUserMsg.id);

      await sendChatMessage(prevUserMsg.content, prevUserMsg.referencedDocs || []);
    },
    [sessionId, isGenerating, removeMessage, sendChatMessage],
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
