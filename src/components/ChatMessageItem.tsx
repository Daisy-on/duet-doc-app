import React from 'react';
import {
  FileText,
  ChevronRight,
  Loader2,
  RotateCcw,
  Check,
  Copy,
  FilePlus,
  StickyNote,
  BookOpen,
  Pencil,
} from 'lucide-react';
import type { ChatMessage } from '../store/aiWritingStore';
import { renderMarkdownToHtml } from '../utils/markdownRenderer';

function getThinkingLabel(msg: ChatMessage, liveSeconds: number): string {
  if (msg.status === 'streaming' && !msg.content) {
    return `思考中 ${liveSeconds || 1}s...`;
  }
  if (msg.thinkingDurationMs) {
    const sec = Math.max(1, Math.round(msg.thinkingDurationMs / 1000));
    return `思考了 ${sec}s`;
  }
  if (msg.thinkingContent) {
    const approxSec = Math.max(1, Math.round(msg.thinkingContent.length / 50));
    return `思考了 ${approxSec}s`;
  }
  return '思考完成';
}

export interface ChatMessageItemProps {
  msg: ChatMessage;
  isUser: boolean;
  isLastUser: boolean;
  isLastAssistant: boolean;
  isEditing: boolean;
  isExpanded: boolean;
  isGenerating: boolean;
  isCopied: boolean;
  isSourcesOpen: boolean;
  liveThinkingSeconds: number;
  editingContent: string;
  isCancelingEdit: boolean;
  editingTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onToggleThinkingNode: (id: string) => void;
  onNavigateToLocalRetrieval: () => void;
  onRetryQuestion: (id: string) => void;
  onRegenerateResponse: (id: string) => void;
  onCopyText: (id: string, text: string) => void;
  onOpenDocChooser: (content: string) => void;
  onSaveToMemo: (content: string) => void;
  onToggleSourcesDrawer: (id: string) => void;
  onStartEdit: (msg: ChatMessage) => void;
  onCancelEdit: (content: string) => void;
  onSaveAndResend: (msg: ChatMessage) => void;
  onEditingChange: (val: string) => void;
  onEditingKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, msg: ChatMessage) => void;
}

function ChatMessageItemComponent({
  msg,
  isUser,
  isLastUser,
  isLastAssistant,
  isEditing,
  isExpanded,
  isGenerating,
  isCopied,
  isSourcesOpen,
  liveThinkingSeconds,
  editingContent,
  isCancelingEdit,
  editingTextareaRef,
  onToggleThinkingNode,
  onNavigateToLocalRetrieval,
  onRetryQuestion,
  onRegenerateResponse,
  onCopyText,
  onOpenDocChooser,
  onSaveToMemo,
  onToggleSourcesDrawer,
  onStartEdit,
  onCancelEdit,
  onSaveAndResend,
  onEditingChange,
  onEditingKeyDown,
}: ChatMessageItemProps) {
  const knowledgeSources = msg.knowledgeSources || [];
  const timestamp = new Date(msg.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      data-message-id={msg.id}
      className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
    >
      <div
        className={`relative ${
          isUser
            ? 'max-w-[75%] min-w-[140px] self-end rounded-2xl bg-indigo-50 px-4 py-3 text-text-primary dark:bg-indigo-950/60'
            : 'w-full min-w-0 py-1 text-text-primary'
        }`}
      >
        {isEditing ? (
          <div className="flex flex-col">
            {/* 引用文档标签 */}
            {msg.referencedDocs && msg.referencedDocs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 border-b border-indigo-100 dark:border-indigo-900 pb-2">
                {msg.referencedDocs.map((doc, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-bg-main border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded text-[10px] font-semibold"
                  >
                    <FileText size={10} />
                    {doc.title}
                  </span>
                ))}
              </div>
            )}

            {/* 内联多行输入框 (CSS Grid 隐形层自适应原气泡宽度与高度，排版字体与正文严格 1:1) */}
            <div className="grid max-h-[240px] overflow-hidden">
              <div
                aria-hidden="true"
                className="invisible col-start-1 row-start-1 text-[15px] text-text-primary leading-relaxed whitespace-pre-wrap break-words pointer-events-none select-none min-h-[24px] max-h-[240px] overflow-hidden m-0 p-0 box-border font-[inherit]"
              >
                {editingContent || ' '}
                {editingContent.endsWith('\n') ? ' ' : ''}
              </div>
              <textarea
                ref={editingTextareaRef}
                value={editingContent}
                onChange={(e) => onEditingChange(e.target.value)}
                onKeyDown={(e) => onEditingKeyDown(e, msg)}
                placeholder="输入修改后的消息..."
                className="col-start-1 row-start-1 w-full min-w-0 min-h-[24px] resize-none bg-transparent outline-none text-[15px] text-text-primary placeholder:text-text-ghost leading-relaxed whitespace-pre-wrap break-words border-none p-0 m-0 box-border overflow-y-hidden font-[inherit]"
                rows={1}
              />
            </div>

            {/* 编辑模式底部操作按钮 (自然向下展开 / 向上收起动画) */}
            <div
              className={`mt-2.5 flex items-center justify-end gap-2 select-none ${
                isCancelingEdit ? 'animate-bubble-collapse-up' : 'animate-bubble-expand-down'
              }`}
            >
              <button
                type="button"
                onClick={() => onCancelEdit(msg.content)}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void onSaveAndResend(msg)}
                disabled={!editingContent.trim() || isGenerating}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
                title={
                  !editingContent.trim()
                    ? '内容不能为空'
                    : isGenerating
                      ? '生成中不可提交'
                      : '发送 (Enter)'
                }
              >
                {isGenerating && <Loader2 size={13} className="animate-spin" />}
                <span>发送</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 引用文档标签 */}
            {isUser && msg.referencedDocs && msg.referencedDocs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 border-b border-indigo-100 dark:border-indigo-900 pb-2">
                {msg.referencedDocs.map((doc, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-bg-main border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded text-[10px] font-semibold"
                  >
                    <FileText size={10} />
                    {doc.title}
                  </span>
                ))}
              </div>
            )}

            {/* 深度思考过程 (ChatGPT 风格: "思考了 12s ›") */}
            {!isUser && msg.thinkingContent && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => onToggleThinkingNode(msg.id)}
                  className="flex items-center gap-1.5 py-1 text-[13px] text-text-secondary transition-colors hover:text-text-primary cursor-pointer font-sans select-none"
                >
                  <span className="font-medium">{getThinkingLabel(msg, liveThinkingSeconds)}</span>
                  <ChevronRight
                    size={14}
                    className={`transition-transform duration-200 ${isExpanded ? 'rotate-90 text-text-primary' : 'text-text-secondary'}`}
                  />
                </button>
                {isExpanded && (
                  <div className="pl-3 my-1.5 border-l-2 border-border-color/80 text-xs md:text-[13px] font-sans text-text-secondary/90 whitespace-pre-wrap leading-relaxed space-y-1">
                    {msg.thinkingContent}
                    {msg.status === 'streaming' && !msg.content && (
                      <span className="inline-block w-1.5 h-3 bg-text-primary ml-1 animate-pulse" />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 消息正文 */}
            <div className="space-y-1.5">
              {isUser ? (
                <p className="text-[15px] text-text-primary leading-relaxed whitespace-pre-wrap break-words font-[inherit]">
                  {msg.content}
                </p>
              ) : (
                <div className="relative">
                  <div
                    className="markdown-body assistant-answer text-[15px] text-text-primary leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdownToHtml(msg.content, {
                        isStreaming: msg.status === 'streaming',
                      }),
                    }}
                  />
                  {msg.status === 'streaming' && msg.content && (
                    <span className="inline-block w-1.5 h-3.5 bg-text-primary ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              )}
            </div>

            {!isUser && msg.aiMetadata?.retrievalNotice && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                {msg.aiMetadata.retrievalNotice}
              </p>
            )}
            {!isUser && msg.aiMetadata?.localReindexAvailable && (
              <button
                type="button"
                onClick={onNavigateToLocalRetrieval}
                className="mt-2 text-xs text-accent hover:underline"
              >
                更新本地索引
              </button>
            )}

            {/* 提示中断或失败状态 */}
            {!isUser && msg.status === 'stopped' && (
              <div className="mt-2 text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block">
                已手动停止生成
              </div>
            )}
            {!isUser && msg.status === 'error' && (
              <div className="mt-2 text-[10px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 inline-block">
                {msg.aiMetadata?.errorMessage ?? '知识检索或回答未完成'}
              </div>
            )}
            {!isUser && msg.status === 'error' && isLastAssistant && (
              <button
                type="button"
                onClick={() => onRetryQuestion(msg.id)}
                disabled={isGenerating}
                className="ml-2 text-xs text-accent hover:underline disabled:opacity-50"
              >
                重新提问
              </button>
            )}
          </>
        )}
      </div>

      {/* AI 消息底部操作工具栏 (仅非 streaming 状态展示) */}
      {!isUser && msg.status !== 'streaming' && msg.content && (
        <div className="mt-2 flex items-center gap-1.5 text-text-secondary/80 transition-colors hover:text-text-secondary">
          {/* 重新生成 (仅最新一条 AI 回答可用) */}
          <button
            onClick={() => onRegenerateResponse(msg.id)}
            disabled={isGenerating || !isLastAssistant || msg.status === 'error'}
            className={`p-1 rounded-lg transition-colors ${
              isGenerating || !isLastAssistant || msg.status === 'error'
                ? 'text-text-ghost cursor-not-allowed'
                : 'text-text-secondary hover:text-text-primary hover:bg-hover-bg cursor-pointer'
            }`}
            title={
              msg.status === 'error'
                ? '失败后请使用重新提问'
                : isLastAssistant
                  ? '重新生成回答'
                  : '仅最新一条回答可重新生成'
            }
          >
            <RotateCcw size={15} />
          </button>

          {/* 复制 */}
          <button
            onClick={() => onCopyText(msg.id, msg.content)}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-hover-bg rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            title="复制回答"
          >
            {isCopied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
          </button>

          <div className="w-px h-3 bg-border-color mx-0.5" />

          {/* 生成文档 */}
          <button
            onClick={() => onOpenDocChooser(msg.content)}
            className="flex h-6 items-center gap-1 rounded px-1.5 text-[13px] text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary cursor-pointer"
            title="生成为知识库文档"
          >
            <FilePlus size={14} />
            <span>生成文档</span>
          </button>

          {/* 保存到小记 */}
          <button
            onClick={() => onSaveToMemo(msg.content)}
            className="flex h-6 items-center gap-1 rounded px-1.5 text-[13px] text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary cursor-pointer"
            title="保存到轻量小记"
          >
            <StickyNote size={14} />
            <span>保存到小记</span>
          </button>

          {/* 来源 (ChatGPT 风格) */}
          {knowledgeSources.length > 0 && (
            <button
              type="button"
              onClick={() => onToggleSourcesDrawer(msg.id)}
              className={`flex h-6 items-center gap-1 rounded px-1.5 text-[12px] font-medium transition-all cursor-pointer ${
                isSourcesOpen
                  ? 'bg-active-bg text-active-fg font-semibold border border-active-border'
                  : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'
              }`}
              title="查看本回答引用的知识库来源"
            >
              <BookOpen size={13} className="shrink-0" />
              <span>来源</span>
              <span
                className={`text-[10px] font-semibold px-1 rounded-full ${
                  isSourcesOpen
                    ? 'bg-active-border/60 text-active-fg'
                    : 'bg-hover-bg text-text-secondary'
                }`}
              >
                {knowledgeSources.length}
              </span>
            </button>
          )}

          <div className="w-px h-3 bg-border-color mx-0.5" />

          <span className="ml-auto shrink-0 text-[13px] text-text-secondary">{timestamp}</span>
        </div>
      )}

      {isUser && (
        <div
          className={`mt-1 flex h-6 items-center justify-end gap-1 text-[13px] text-text-secondary select-none transition-opacity duration-150 ${
            isEditing ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <span className="mr-1">{timestamp}</span>
          <span className="mx-1 h-3 w-px bg-border-color" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onCopyText(msg.id, msg.content)}
              className="rounded p-1 hover:bg-hover-bg hover:text-text-primary cursor-pointer"
              title="复制消息"
              aria-label="复制消息"
            >
              {isCopied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
            </button>
            {isLastUser && (
              <button
                type="button"
                onClick={() => onStartEdit(msg)}
                disabled={isGenerating}
                className={`rounded p-1 transition-colors ${
                  isGenerating
                    ? 'opacity-40 cursor-not-allowed text-text-ghost'
                    : 'hover:bg-hover-bg hover:text-text-primary cursor-pointer'
                }`}
                title={isGenerating ? '生成中不可修改' : '修改消息'}
                aria-label="修改消息"
              >
                <Pencil size={15} />
              </button>
            )}
          </div>
        </div>
      )}
      {!isUser && (msg.status === 'streaming' || !msg.content) && (
        <div className="mt-1 text-[13px] text-text-secondary">{timestamp}</div>
      )}
    </div>
  );
}

function areMessagePropsEqual(prev: ChatMessageItemProps, next: ChatMessageItemProps): boolean {
  // 1. 如果消息对象自身变化（内容、状态、思考等变了），必须重渲染
  if (prev.msg !== next.msg) return false;

  // 2. 状态标识变化时，必须重渲染
  if (prev.isEditing !== next.isEditing) return false;
  if (prev.isExpanded !== next.isExpanded) return false;
  if (prev.isCopied !== next.isCopied) return false;
  if (prev.isSourcesOpen !== next.isSourcesOpen) return false;
  if (prev.isLastUser !== next.isLastUser) return false;
  if (prev.isLastAssistant !== next.isLastAssistant) return false;

  // 3. 正在编辑中时，输入内容或取消动画变化触发重渲染
  if (next.isEditing) {
    if (prev.editingContent !== next.editingContent) return false;
    if (prev.isCancelingEdit !== next.isCancelingEdit) return false;
  }

  // 4. 处于流式中且在思考时，秒数倒计时变化触发重渲染
  if (next.msg.status === 'streaming' && !next.msg.content) {
    if (prev.liveThinkingSeconds !== next.liveThinkingSeconds) return false;
  }

  // 5. 尾部消息在生成中/结束时需要响应按钮禁用态
  if (next.isLastUser || next.isLastAssistant) {
    if (prev.isGenerating !== next.isGenerating) return false;
  }

  // 6. 其他历史已完成消息：属性全等，彻底跳过 Virtual DOM Diff！
  return true;
}

export const ChatMessageItem = React.memo(ChatMessageItemComponent, areMessagePropsEqual);
