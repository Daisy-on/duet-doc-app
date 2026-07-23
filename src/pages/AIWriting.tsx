import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Send, BrainCircuit, Plus, X, ChevronDown, ChevronUp, Loader2, FileText, FileUp, Sparkles, Square,
  RotateCcw, Copy, FilePlus, StickyNote, Check
} from 'lucide-react';
import AIChatListPanel from '../components/AIChatListPanel';
import AIAttachMenu from '../components/menus/AIAttachMenu';
import KBDocSelectorModal from '../components/modals/KBDocSelectorModal';
import KBChooserModal from '../components/modals/KBChooserModal';
import { useAIWritingStore } from '../store/aiWritingStore';
import type { ReferencedDoc } from '../store/aiWritingStore';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import { useLayoutStore } from '../store';
import { useAIChat } from '../hooks/useAIChat';
import { renderMarkdownToHtml } from '../utils/markdownRenderer';
import { markdownToHtml, getSmartTitle } from '../utils/markdownUtils';
import { buildApiUrl } from '../utils/apiUtils';

export default function AIWriting() {
  const params = useParams<{ '*': string }>();
  const sessionId = params['*'] || undefined;
  const navigate = useNavigate();
  
  const { 
    sessions, messages, createSession, 
    isThinkingEnabled,
    setIsThinkingEnabled, setActiveSessionId
  } = useAIWritingStore();

  const { createDocument, createMemo, updateDocument } = useKnowledgeBaseStore();
  const { isCatalogCollapsed, setIsCatalogCollapsed } = useLayoutStore();

  const currentSessionId = sessionId;
  const sessionMessages = useMemo(
    () => messages.filter((m) => m.sessionId === currentSessionId),
    [messages, currentSessionId]
  );
  const currentSession = sessions.find((s) => s.id === currentSessionId);

  const { isGenerating, sendChatMessage, regenerateResponse, stopGeneration } = useAIChat(currentSessionId || null);

  // Local state
  const [inputText, setInputText] = useState('');
  const [referencedDocs, setReferencedDocs] = useState<ReferencedDoc[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});

  // Copied toast state per message
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);

  // KBChooser Modal State
  const [isKBChooserOpen, setIsKBChooserOpen] = useState(false);
  const [kbChooserTargetContent, setKbChooserTargetContent] = useState('');
  const [kbChooserDefaultTitle, setKbChooserDefaultTitle] = useState('');

  // Menu/Modal anchors & states
  const [attachMenuAnchorEl, setAttachMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isDocSelectorOpen, setIsDocSelectorOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMsgCountRef = useRef(0);
  const lastSessionIdRef = useRef<string | null>(null);

  // Backend health status state
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/v1/health'));
        if (res.ok) {
          if (isMounted) setBackendStatus('connected');
        } else {
          if (isMounted) setBackendStatus('disconnected');
        }
      } catch {
        if (isMounted) setBackendStatus('disconnected');
      }
    };

    checkHealth();
    const timer = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  // Toast auto-clear
  useEffect(() => {
    if (toastText) {
      const timer = setTimeout(() => setToastText(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastText]);

  // Sync activeSessionId with URL route param
  useEffect(() => {
    setActiveSessionId(sessionId || null);
  }, [sessionId, setActiveSessionId]);

  // Scroll to bottom on new messages, session change, or generating
  useEffect(() => {
    if (!scrollRef.current) return;

    const isNewSession = currentSessionId !== lastSessionIdRef.current;
    const isNewMsgAdded = sessionMessages.length > lastMsgCountRef.current;

    lastSessionIdRef.current = currentSessionId || null;
    lastMsgCountRef.current = sessionMessages.length;

    if (isNewSession || isNewMsgAdded || isGenerating) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentSessionId, sessionMessages.length, isGenerating]);

  // Auto-resize textarea height (min 2 lines ~52px, max 10 lines ~220px)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 52), 220);
    textarea.style.height = `${newHeight}px`;
  }, [inputText]);

  // 自动折叠完成的 Thinking
  useEffect(() => {
    sessionMessages.forEach((msg) => {
      if (msg.role === 'assistant' && (msg.status === 'complete' || msg.status === 'stopped')) {
        setExpandedThinking((prev) => {
          if (prev[msg.id] === undefined) {
            return { ...prev, [msg.id]: false };
          }
          return prev;
        });
      }
    });
  }, [sessionMessages]);

  const handleSend = async () => {
    if (isGenerating) {
      stopGeneration();
      return;
    }

    if (!inputText.trim() && referencedDocs.length === 0) return;
    
    let targetSessionId = currentSessionId;
    if (!targetSessionId) {
      targetSessionId = await createSession('新对话');
      navigate(`/ai-writing/${targetSessionId}`);
    }

    const payloadDocs = [...referencedDocs];
    const textToSend = inputText;

    setInputText('');
    setReferencedDocs([]);
    setAttachedFiles([]);

    await sendChatMessage(textToSend, payloadDocs, targetSessionId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const removeReferencedDoc = (docId: string) => {
    setReferencedDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  const removeAttachedFile = (fileName: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f !== fileName));
  };

  const toggleThinkingNode = (msgId: string) => {
    setExpandedThinking((prev) => ({
      ...prev,
      [msgId]: prev[msgId] === undefined ? false : !prev[msgId],
    }));
  };

  // 复制文本
  const handleCopyText = (msgId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // 一键保存到小记
  const handleSaveToMemo = (content: string) => {
    const rawTitle = currentSession?.title && currentSession.title !== '新对话' 
      ? `AI 小记: ${currentSession.title}` 
      : undefined;
    const memoTitle = getSmartTitle(content, rawTitle || 'AI 对话摘录');
    const memoId = createMemo(memoTitle);
    const htmlContent = markdownToHtml(content);
    updateDocument(memoId, { content: htmlContent });
    setToastText(`已成功保存到轻量小记「${memoTitle}」`);
  };

  // 唤起生成文档弹窗
  const handleOpenDocChooser = (content: string) => {
    const defaultDocTitle = getSmartTitle(content, currentSession?.title);
    setKbChooserTargetContent(content);
    setKbChooserDefaultTitle(defaultDocTitle);
    setIsKBChooserOpen(true);
  };

  // 确认在具体知识库下生成文档
  const handleConfirmCreateDoc = (kbId: string, groupId: string | null, title: string) => {
    const docId = createDocument(kbId, groupId, title);
    const htmlContent = markdownToHtml(kbChooserTargetContent);
    updateDocument(docId, { content: htmlContent });
    setToastText(`已成功生成文档「${title}」！可在对应知识库中查看`);
  };

  const starterPrompts = [
    { title: '分析竞品优势', desc: '基于引用的知识库文章撰写竞品优势分析报告' },
    { title: '总结文档核心', desc: '提取这篇文章的几个核心结论和未来规划建议' },
    { title: '打磨技术文档', desc: '润色这篇技术架构文档，使其逻辑更清晰、专业术语更准确' }
  ];

  const selectPrompt = (prompt: typeof starterPrompts[0]) => {
    setInputText(prompt.title + '：' + prompt.desc);
  };

  // 寻找最后一条 Assistant 消息的 ID
  const assistantMsgs = sessionMessages.filter((m) => m.role === 'assistant');
  const lastAssistantMsgId = assistantMsgs[assistantMsgs.length - 1]?.id;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 1. Left Session Panel */}
      <AIChatListPanel />

      {/* 2. Main Chat Panel */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-main relative">
        {/* Top Header */}
        <header className="h-[60px] border-b border-border-color flex justify-between items-center px-6 shrink-0 bg-white">
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              onClick={() => setIsCatalogCollapsed(!isCatalogCollapsed)}
              className="text-text-secondary hover:text-text-primary hover:bg-hover-bg p-1.5 rounded-lg border border-border-color/60 bg-white shadow-sm flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title={isCatalogCollapsed ? "展开" : "折叠"}
            >
              <Sparkles size={14} className="text-indigo-500" />
            </button>
            <div className="flex items-center gap-3 ml-1 min-w-0">
              <h2 className="text-[15px] font-bold text-text-primary truncate">和 Duet AI 一起写作</h2>
              <span className="text-[10px] font-semibold bg-indigo-50 text-accent px-2 py-0.5 rounded-full border border-indigo-200 shrink-0">
                {isThinkingEnabled ? 'DeepSeek V4-Pro' : 'DeepSeek V4'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary bg-gray-50 border border-border-color px-2.5 py-1.5 rounded-lg shadow-sm">
            <span className="relative flex h-2 w-2">
              {backendStatus === 'connected' && (
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
                  style={{ animationDuration: '2.5s' }}
                />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  backendStatus === 'connected'
                    ? 'bg-emerald-500'
                    : backendStatus === 'disconnected'
                    ? 'bg-red-500'
                    : 'bg-gray-400'
                }`}
              />
            </span>
            <span className="font-medium">
              {backendStatus === 'connected'
                ? '后端已连接'
                : backendStatus === 'disconnected'
                ? '后端已离线'
                : '检测连接中...'}
            </span>
          </div>
        </header>

        {/* Global Notification Toast */}
        {toastText && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-gray-900/90 text-white text-xs px-4 py-2 rounded-xl shadow-xl border border-gray-700 backdrop-blur flex items-center gap-2 animate-dropdown-fade-in">
            <Check size={14} className="text-emerald-400" />
            <span>{toastText}</span>
          </div>
        )}

        {/* Main Scrollable Viewport (holds both messages AND sticky bottom input like DeepSeek) */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 md:px-6 flex flex-col"
        >
          {/* Messages Stream */}
          <div className="flex-1 py-6">
            {sessionMessages.length === 0 ? (
              <div className="max-w-4xl mx-auto pt-12 flex flex-col items-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-400 to-pink-400 flex items-center justify-center text-white shadow-lg mb-6 animate-pulse">
                  <Sparkles size={28} />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-2">今天想写点什么？</h3>
                <p className="text-xs text-text-secondary mb-8 text-center max-w-md">
                  引用知识库文档，或是直接提问。Duet AI 具备端云协同的大模型推理能力，协助你快速撰写、精炼与重构文本。
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                  {starterPrompts.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectPrompt(p)}
                      className="p-3.5 bg-white border border-border-color hover:border-indigo-200 rounded-xl text-left hover:shadow-md transition-all group cursor-pointer"
                    >
                      <div className="text-xs font-bold text-text-primary group-hover:text-accent mb-1 flex items-center justify-between">
                        {p.title}
                        <Sparkles size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">
                        {p.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto flex flex-col space-y-6">
                {sessionMessages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const isExpanded = expandedThinking[msg.id] !== false;
                  const isLastAssistant = !isUser && msg.id === lastAssistantMsgId;

                  return (
                    <div
                      key={msg.id}
                      className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      {!isUser && (
                        <div className="text-[10px] text-text-secondary font-bold mb-1 px-1">
                          Duet AI
                        </div>
                      )}

                      <div
                        className={`relative rounded-2xl shadow-sm border ${
                          isUser
                            ? 'bg-indigo-50 border-indigo-100 rounded-tr-none text-text-primary max-w-[85%] self-end px-4 py-3'
                            : 'bg-white border-border-color rounded-tl-none text-text-primary w-full px-5 py-4'
                        }`}
                      >
                        {/* 引用文档标签 */}
                        {isUser && msg.referencedDocs && msg.referencedDocs.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2 border-b border-indigo-100 pb-2">
                            {msg.referencedDocs.map((doc, idx) => (
                              <span 
                                key={idx}
                                className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-semibold"
                              >
                                <FileText size={10} />
                                {doc.title}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* 深度思考过程折叠卡片 */}
                        {!isUser && msg.thinkingContent && (
                          <div className="mb-3.5 border-l-2 border-indigo-300/80 bg-gray-50/80 rounded-r-xl overflow-hidden">
                            <button
                              onClick={() => toggleThinkingNode(msg.id)}
                              className="w-full flex items-center justify-between px-3.5 py-2 text-[11px] font-bold text-text-secondary bg-gray-100/70 hover:bg-gray-100 transition-colors"
                            >
                              <span className="flex items-center gap-1.5 text-indigo-600">
                                <BrainCircuit size={13} className={msg.status === 'streaming' ? 'animate-spin-slow' : ''} />
                                深度思考过程
                              </span>
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                            {isExpanded && (
                              <div className="p-3.5 text-xs md:text-[13px] font-sans text-text-secondary/90 whitespace-pre-wrap leading-relaxed border-t border-indigo-100/60">
                                {msg.thinkingContent}
                                {msg.status === 'streaming' && !msg.content && (
                                  <span className="inline-block w-1.5 h-3 bg-indigo-500 ml-1 animate-pulse" />
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 消息正文 */}
                        <div className="space-y-1.5">
                          {isUser ? (
                            <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          ) : (
                            <div className="relative">
                              <div
                                className="markdown-body text-sm text-text-primary leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(msg.content) }}
                              />
                              {msg.status === 'streaming' && msg.content && (
                                <span className="inline-block w-1.5 h-3.5 bg-indigo-500 ml-0.5 animate-pulse align-middle" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* 提示中断或失败状态 */}
                        {!isUser && msg.status === 'stopped' && (
                          <div className="mt-2 text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block">
                            已手动停止生成
                          </div>
                        )}
                        {!isUser && msg.status === 'error' && (
                          <div className="mt-2 text-[10px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 inline-block">
                            生成中断或网络异常
                          </div>
                        )}
                      </div>

                      {/* AI 消息底部操作工具栏 (仅非 streaming 状态展示) */}
                      {!isUser && msg.status !== 'streaming' && msg.content && (
                        <div className={`flex items-center gap-1.5 mt-1.5 px-1 transition-all duration-200 ${
                          isLastAssistant ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}>
                          {/* 重新生成 (仅最新一条 AI 回答可用) */}
                          <button
                            onClick={() => regenerateResponse(msg.id)}
                            disabled={isGenerating || !isLastAssistant}
                            className={`p-1 rounded-lg transition-colors ${
                              isGenerating || !isLastAssistant
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-text-secondary hover:text-indigo-600 hover:bg-gray-100 cursor-pointer'
                            }`}
                            title={isLastAssistant ? "重新生成回答" : "仅最新一条回答可重新生成"}
                          >
                            <RotateCcw size={12} />
                          </button>

                          {/* 复制 */}
                          <button
                            onClick={() => handleCopyText(msg.id, msg.content)}
                            className="p-1 text-text-secondary hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            title="复制回答"
                          >
                            {copiedMsgId === msg.id ? (
                              <Check size={12} className="text-emerald-500" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>

                          <div className="w-px h-3 bg-border-color mx-0.5" />

                          {/* 生成文档 */}
                          <button
                            onClick={() => handleOpenDocChooser(msg.content)}
                            className="h-6 px-2 rounded-lg bg-gray-100 hover:bg-indigo-50 hover:text-indigo-600 text-text-secondary text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer border border-border-color/60"
                          >
                            <FilePlus size={11} />
                            <span>生成文档</span>
                          </button>

                          {/* 保存到小记 */}
                          <button
                            onClick={() => handleSaveToMemo(msg.content)}
                            className="h-6 px-2 rounded-lg bg-gray-100 hover:bg-emerald-50 hover:text-emerald-600 text-text-secondary text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer border border-border-color/60"
                          >
                            <StickyNote size={11} />
                            <span>保存到小记</span>
                          </button>
                        </div>
                      )}

                      {/* Timestamp */}
                      <div className="text-[9px] text-text-secondary mt-1 px-1">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  );
                })}

                {/* 仅在初始化等待连接时展示动画 */}
                {isGenerating && sessionMessages.length > 0 && sessionMessages[sessionMessages.length - 1]?.role === 'user' && (
                  <div className="flex flex-col items-start animate-pulse">
                    <div className="text-[10px] text-text-secondary font-bold mb-1 px-1">
                      Duet AI
                    </div>
                    <div className="bg-white border border-border-color rounded-2xl rounded-tl-none px-4 py-3 text-xs text-text-secondary flex items-center gap-2 shadow-sm">
                      <Loader2 size={14} className="animate-spin text-accent" />
                      <span>AI 正在思考并撰写内容...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Input Area (Sticky at bottom of scroll container) */}
          <div className="sticky bottom-0 pb-4 pt-2 bg-bg-main z-20 shrink-0">
            <div className="max-w-4xl mx-auto flex flex-col gap-2 relative">
              
              {/* Attachment badges above input */}
              {(referencedDocs.length > 0 || attachedFiles.length > 0) && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 border border-border-color/60 rounded-xl mb-1.5 animate-dropdown-fade-in">
                  {referencedDocs.map((doc) => (
                    <span
                      key={doc.id}
                      className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-accent px-2.5 py-1 rounded-lg text-xs font-semibold"
                    >
                      <FileText size={12} />
                      <span className="truncate max-w-[120px]">{doc.title}</span>
                      <button
                        onClick={() => removeReferencedDoc(doc.id)}
                        className="text-indigo-400 hover:text-accent p-0.5 rounded transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {attachedFiles.map((file) => (
                    <span
                      key={file}
                      className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 text-emerald-600 px-2.5 py-1 rounded-lg text-xs font-semibold"
                    >
                      <FileUp size={12} />
                      <span className="truncate max-w-[120px]">{file}</span>
                      <button
                        onClick={() => removeAttachedFile(file)}
                        className="text-emerald-400 hover:text-emerald-600 p-0.5 rounded transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Main Textarea Container */}
              <div className="border border-border-color focus-within:border-accent bg-white rounded-xl shadow-sm transition-all overflow-hidden flex flex-col">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={currentSessionId ? "与 Duet AI 对话，输入并发送..." : "在这里输入对话，点击发送或回车开启新对话..."}
                  className="w-full resize-none bg-transparent px-4 py-3 outline-none text-sm text-text-primary placeholder-text-secondary font-sans leading-relaxed border-none overflow-y-auto max-h-[220px]"
                  style={{ minHeight: '52px' }}
                />

                {/* Input Toolbar */}
                <div className="px-4 py-2 bg-gray-50 border-t border-border-color/50 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          setAttachMenuAnchorEl(e.currentTarget);
                          setIsAttachMenuOpen(!isAttachMenuOpen);
                        }}
                        className="w-7 h-7 rounded-lg hover:bg-gray-200/70 border border-border-color text-text-secondary hover:text-text-primary flex items-center justify-center transition-all cursor-pointer shadow-sm"
                        title="引用知识库文档"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {/* Thinking toggle */}
                    <button
                      type="button"
                      onClick={() => setIsThinkingEnabled(!isThinkingEnabled)}
                      className={`h-7 px-2.5 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer shadow-sm ${
                        isThinkingEnabled
                          ? 'bg-indigo-50 border-indigo-200 text-accent font-semibold'
                          : 'bg-white border-border-color text-text-secondary hover:bg-gray-100'
                      }`}
                      title="切换 DeepSeek V4-Pro (深度思考) / V4 (标准模式)"
                    >
                      <BrainCircuit size={12} className={isThinkingEnabled ? 'animate-pulse' : ''} />
                      <span>{isThinkingEnabled ? '深度思考 (V4-Pro)' : '标准模式 (V4)'}</span>
                    </button>
                  </div>

                  {/* Send or Stop Button */}
                  {isGenerating ? (
                    <button
                      type="button"
                      onClick={stopGeneration}
                      className="w-8 h-8 rounded-lg bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center transition-all cursor-pointer shadow-md"
                      title="停止生成"
                    >
                      <Square size={12} className="fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSend}
                      className="w-8 h-8 rounded-lg bg-accent hover:bg-indigo-700 text-white flex items-center justify-center transition-all cursor-pointer shadow-md hover:shadow-indigo-500/10"
                      title="发送消息"
                    >
                      <Send size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Floating attachment dropdown menu */}
      <AIAttachMenu
        isOpen={isAttachMenuOpen}
        onClose={() => setIsAttachMenuOpen(false)}
        onAttachFile={(name) => setAttachedFiles((prev) => [...prev, name])}
        onOpenDocSelector={() => setIsDocSelectorOpen(true)}
        anchorEl={attachMenuAnchorEl}
      />

      {/* KB Document selector Modal */}
      <KBDocSelectorModal
        isOpen={isDocSelectorOpen}
        onClose={() => setIsDocSelectorOpen(false)}
        onSelect={(doc) => {
          if (!referencedDocs.some(d => d.id === doc.id)) {
            setReferencedDocs((prev) => [...prev, doc]);
          }
        }}
      />

      {/* KB Chooser Modal for generating documents */}
      <KBChooserModal
        isOpen={isKBChooserOpen}
        onClose={() => setIsKBChooserOpen(false)}
        defaultTitle={kbChooserDefaultTitle}
        onConfirm={handleConfirmCreateDoc}
      />
    </div>
  );
}
