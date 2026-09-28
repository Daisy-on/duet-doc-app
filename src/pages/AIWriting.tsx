import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Send,
  BrainCircuit,
  Plus,
  X,
  ChevronRight,
  Loader2,
  FileText,
  FileUp,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Square,
  RotateCcw,
  Copy,
  FilePlus,
  StickyNote,
  Pencil,
  Check,
  Cloud,
  BookOpen,
} from 'lucide-react';
import LottieComponent, { type LottieComponentProps } from 'lottie-react';
import moonAnimation from '../assets/Moon.json';

const Lottie = (
  typeof LottieComponent === 'function'
    ? LottieComponent
    : (LottieComponent as unknown as { default: React.ComponentType<LottieComponentProps> }).default
) as React.ComponentType<LottieComponentProps>;
import AIChatListPanel from '../components/AIChatListPanel';
import AIAttachMenu from '../components/menus/AIAttachMenu';
import AISourcesDrawer from '../components/AISourcesDrawer';
import AISourceCard from '../components/AISourceCard';
import KBTreePickerModal from '../components/modals/KBTreePickerModal';
import { useAIWritingStore } from '../store/aiWritingStore';
import type { ChatMessage, KnowledgeSource, ReferencedDoc } from '../store/aiWritingStore';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import { useLayoutStore } from '../store';
import { useAIChat } from '../hooks/useAIChat';
import { renderMarkdownToHtml } from '../utils/markdownRenderer';
import { markdownToHtml, getSmartTitle } from '../utils/markdownUtils';
import { buildApiUrl } from '../utils/apiUtils';
import CloudRagGate from '../components/CloudRagGate';
import { inspectModelInstallation } from '../models/modelCache';

interface ActiveCitation {
  source: KnowledgeSource;
  index: number;
  anchorRect: DOMRect;
  msgId: string;
}

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

export default function AIWriting() {
  const params = useParams<{ '*': string }>();
  const sessionId = params['*'] || undefined;
  const navigate = useNavigate();

  const {
    sessions,
    messages,
    createSession,
    isThinkingEnabled,
    setIsThinkingEnabled,
    activeSessionId,
    setActiveSessionId,
    sourcesDrawer,
    setSourcesDrawer,
    closeSourcesDrawer,
  } = useAIWritingStore();

  const { createDocument, createMemo, updateDocument } = useKnowledgeBaseStore();
  const { isCatalogCollapsed, setIsCatalogCollapsed } = useLayoutStore();

  const currentSessionId = sessionId;
  const sessionMessages = useMemo(
    () => messages.filter((m) => m.sessionId === currentSessionId),
    [messages, currentSessionId],
  );
  const currentSession = sessions.find((s) => s.id === currentSessionId);

  const [hasLocalEmbeddingModel, setHasLocalEmbeddingModel] = useState<boolean | null>(null);
  const [allowCloudQuery, setAllowCloudQuery] = useState(false);

  const { isGenerating, sendChatMessage, regenerateResponse, resendEditedMessage, stopGeneration } =
    useAIChat(currentSessionId || null, allowCloudQuery);

  useEffect(() => {
    let active = true;
    void inspectModelInstallation('bge-large-zh-v1.5-fp16')
      .then((installation) => {
        if (active) setHasLocalEmbeddingModel(Boolean(installation));
      })
      .catch(() => {
        if (active) setHasLocalEmbeddingModel(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Local state
  const [inputText, setInputText] = useState('');
  const [referencedDocs, setReferencedDocs] = useState<ReferencedDoc[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isCancelingEdit, setIsCancelingEdit] = useState(false);
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
  const editingTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editingSendRef = useRef(false);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMsgCountRef = useRef(0);
  const lastSessionIdRef = useRef<string | null>(null);

  // Citation interaction states
  const [activeCitation, setActiveCitation] = useState<ActiveCitation | null>(null);
  const badgeHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMouseInPopoverRef = useRef(false);

  const clearCitationTimers = useCallback(() => {
    if (badgeHoverTimerRef.current) {
      clearTimeout(badgeHoverTimerRef.current);
      badgeHoverTimerRef.current = null;
    }
    if (popoverHoverTimerRef.current) {
      clearTimeout(popoverHoverTimerRef.current);
      popoverHoverTimerRef.current = null;
    }
  }, []);

  // Right Sources Drawer state directly derived from Zustand store
  const isSourcesDrawerOpen = Boolean(
    sourcesDrawer.isOpen &&
    currentSessionId &&
    sourcesDrawer.sessionId === currentSessionId &&
    (!sourcesDrawer.messageId || sessionMessages.some((m) => m.id === sourcesDrawer.messageId)),
  );
  const activeSourcesMsgId = isSourcesDrawerOpen ? sourcesDrawer.messageId : null;
  const drawerHighlightIndex = isSourcesDrawerOpen ? sourcesDrawer.highlightIndex : null;

  const targetSourcesMsg = useMemo(
    () => sessionMessages.find((m) => m.id === activeSourcesMsgId),
    [activeSourcesMsgId, sessionMessages],
  );
  const activeDrawerSources = targetSourcesMsg?.knowledgeSources || [];

  const handleToggleSourcesDrawer = (msgId: string) => {
    const curId = currentSessionId || activeSessionId;
    if (activeSourcesMsgId === msgId && isSourcesDrawerOpen) {
      closeSourcesDrawer();
    } else {
      setSourcesDrawer({
        isOpen: true,
        sessionId: curId,
        messageId: msgId,
        highlightIndex: null,
      });
    }
  };

  // Real-time timer for live streaming thinking seconds
  const [liveThinkingSeconds, setLiveThinkingSeconds] = useState(0);

  // Backend health status state
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>(
    'checking',
  );

  useEffect(() => {
    if (sessionId && !sessions.some((session) => session.id === sessionId)) {
      navigate('/ai-writing', { replace: true });
    }
  }, [navigate, sessionId, sessions]);

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

  // Cleanup cancel timer and citation hover timers on unmount
  useEffect(() => {
    return () => {
      if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
      clearCitationTimers();
    };
  }, [clearCitationTimers]);

  // Toast auto-clear
  useEffect(() => {
    if (toastText) {
      const timer = setTimeout(() => setToastText(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastText]);

  // Sync activeSessionId with URL route param & reset state on session switch
  const [prevSessionId, setPrevSessionId] = useState(sessionId);
  if (prevSessionId !== sessionId) {
    setPrevSessionId(sessionId);
    setLiveThinkingSeconds(0);
    setIsCancelingEdit(false);
    if (editingMessageId) {
      setEditingMessageId(null);
      setEditingContent('');
    }
    setActiveCitation(null);
  }

  useEffect(() => {
    setActiveSessionId(sessionId || null);
    clearCitationTimers();
    if (cancelTimerRef.current) {
      clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }
  }, [sessionId, setActiveSessionId, clearCitationTimers]);

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

  // Auto-resize inline editing textarea scrollbar threshold (max ~8-10 lines ~240px)
  useEffect(() => {
    const textarea = editingTextareaRef.current;
    if (!textarea || !editingMessageId) return;
    const maxHeight = 240;
    const isOverflowing = textarea.scrollHeight > maxHeight;
    textarea.style.overflowY = isOverflowing ? 'auto' : 'hidden';
  }, [editingMessageId, editingContent]);

  // Focus and move cursor to end when starting inline edit
  useEffect(() => {
    if (!editingMessageId) return;
    const textarea = editingTextareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [editingMessageId]);

  useEffect(() => {
    if (!isGenerating) return;
    const timer = setInterval(() => {
      setLiveThinkingSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isGenerating]);

  // Global event delegation for code block copy buttons
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleContainerClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.copy-code-btn') as HTMLButtonElement | null;
      if (!btn) return;

      const rawCode = btn.getAttribute('data-code');
      if (!rawCode) return;

      const parser = new DOMParser();
      const doc = parser.parseFromString(rawCode, 'text/html');
      const textToCopy = doc.body.textContent || rawCode;

      navigator.clipboard.writeText(textToCopy).then(() => {
        const label = btn.querySelector('.copy-label');
        if (label) {
          const originalText = label.textContent;
          label.textContent = '已复制';
          btn.classList.add('text-emerald-400');
          setTimeout(() => {
            label.textContent = originalText;
            btn.classList.remove('text-emerald-400');
          }, 2000);
        }
      });
    };

    container.addEventListener('click', handleContainerClick);
    return () => container.removeEventListener('click', handleContainerClick);
  }, []);

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
    setLiveThinkingSeconds(0);

    await sendChatMessage(textToSend, payloadDocs, targetSessionId);
  };

  const handleRetryQuestion = (assistantId: string) => {
    if (inputText.trim() || referencedDocs.length > 0) {
      setToastText('请先处理输入框中未发送的内容');
      return;
    }
    const index = sessionMessages.findIndex((message) => message.id === assistantId);
    const question = sessionMessages
      .slice(0, index)
      .reverse()
      .find((message) => message.role === 'user');
    if (!question) return;
    setInputText(question.content);
    setReferencedDocs(question.referencedDocs ?? []);
    textareaRef.current?.focus();
  };

  const handleStartEdit = (message: ChatMessage) => {
    if (isGenerating) return;
    if (cancelTimerRef.current) {
      clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }
    setIsCancelingEdit(false);
    setEditingMessageId(message.id);
    setEditingContent(message.content);
  };

  const handleCancelEdit = (originalContent?: string) => {
    if (isCancelingEdit) return;
    setIsCancelingEdit(true);
    cancelTimerRef.current = setTimeout(() => {
      if (originalContent !== undefined) {
        setEditingContent(originalContent);
      }
      setEditingMessageId(null);
      setEditingContent('');
      setIsCancelingEdit(false);
      cancelTimerRef.current = null;
    }, 150);
  };

  const handleSaveAndResend = async (msg: ChatMessage) => {
    const trimmed = editingContent.trim();
    if (!trimmed || isGenerating || editingSendRef.current) return;
    editingSendRef.current = true;
    try {
      const sent = await resendEditedMessage(msg.id, trimmed, msg.referencedDocs || []);
      if (!sent) {
        setToastText('原消息已不存在，请重新发送');
        return;
      }
      setEditingMessageId(null);
      setEditingContent('');
      setLiveThinkingSeconds(0);
    } catch (error) {
      console.error('Failed to resend edited message:', error);
      setToastText('修改消息失败，请重试');
    } finally {
      editingSendRef.current = false;
    }
  };

  const handleEditingKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, msg: ChatMessage) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSaveAndResend(msg);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit(msg.content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
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

  const openKnowledgeSource = useCallback(
    (source: KnowledgeSource) => {
      const curId = currentSessionId || activeSessionId;
      if (curId) {
        setActiveSessionId(curId);
      }
      const documentId = source.documentId ?? source.sourceId;
      if (source.sourceType === 'memo') {
        navigate(`/memo/${documentId}`, {
          state: {
            citation: { documentId, excerpt: source.excerpt, headingPath: source.headingPath },
          },
        });
        return;
      }
      const kbId =
        source.kbId ??
        useKnowledgeBaseStore.getState().documents.find((document) => document.id === documentId)
          ?.kbId;
      if (!kbId) {
        setToastText('来源文档已不可用');
        return;
      }
      const imageQuery = source.assetId ? `?assetId=${encodeURIComponent(source.assetId)}` : '';
      navigate(`/kb/${kbId}/doc/${documentId}${imageQuery}`, {
        state:
          source.sourceType === 'image'
            ? undefined
            : {
                citation: {
                  documentId,
                  excerpt: source.excerpt,
                  headingPath: source.headingPath,
                },
              },
      });
    },
    [currentSessionId, activeSessionId, setActiveSessionId, navigate],
  );

  const handleContainerMouseOver = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const badge = target?.closest('.citation-ref-badge') as HTMLElement | null;
      if (!badge) return;

      const msgContainer = badge.closest('[data-message-id]');
      const msgId = msgContainer?.getAttribute('data-message-id');
      const indexStr = badge.getAttribute('data-citation-index');
      if (!msgId || !indexStr) return;

      const index = parseInt(indexStr, 10);
      const msg = sessionMessages.find((m) => m.id === msgId);
      const source = msg?.knowledgeSources?.[index - 1];
      if (!source) return;

      // If already active for this badge, clear hide timer and keep showing
      if (activeCitation?.msgId === msgId && activeCitation?.index === index) {
        if (popoverHoverTimerRef.current) {
          clearTimeout(popoverHoverTimerRef.current);
          popoverHoverTimerRef.current = null;
        }
        return;
      }

      // Clear any pending timers
      clearCitationTimers();

      // Show after 0.5s sustained hover
      badgeHoverTimerRef.current = setTimeout(() => {
        setActiveCitation({
          source,
          index,
          anchorRect: badge.getBoundingClientRect(),
          msgId,
        });
        badgeHoverTimerRef.current = null;
      }, 500);
    },
    [sessionMessages, activeCitation, clearCitationTimers],
  );

  const handleContainerMouseOut = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const badge = target?.closest('.citation-ref-badge');
    if (!badge) return;

    // 1. If mouse leaves badge before 0.5s, immediately cancel popup
    if (badgeHoverTimerRef.current) {
      clearTimeout(badgeHoverTimerRef.current);
      badgeHoverTimerRef.current = null;
    }

    // 2. If popup is currently open, dismiss quickly unless moving into popover
    if (popoverHoverTimerRef.current) {
      clearTimeout(popoverHoverTimerRef.current);
    }
    popoverHoverTimerRef.current = setTimeout(() => {
      if (!isMouseInPopoverRef.current) {
        setActiveCitation(null);
      }
      popoverHoverTimerRef.current = null;
    }, 80);
  }, []);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const badge = target?.closest('.citation-ref-badge') as HTMLElement | null;
      if (!badge) return;

      e.preventDefault();
      const msgContainer = badge.closest('[data-message-id]');
      const msgId = msgContainer?.getAttribute('data-message-id');
      const indexStr = badge.getAttribute('data-citation-index');
      if (!msgId || !indexStr) return;

      const index = parseInt(indexStr, 10);
      const msg = sessionMessages.find((m) => m.id === msgId);
      const source = msg?.knowledgeSources?.[index - 1];

      clearCitationTimers();
      setActiveCitation(null);

      if (source) {
        openKnowledgeSource(source);
      }
    },
    [sessionMessages, clearCitationTimers, openKnowledgeSource],
  );

  const handleScroll = useCallback(() => {
    clearCitationTimers();
    if (activeCitation) {
      setActiveCitation(null);
    }
  }, [activeCitation, clearCitationTimers]);

  const handleCardMouseEnter = useCallback((msgId: string, index: number) => {
    const msgEl = document.querySelector(`[data-message-id="${msgId}"]`);
    if (msgEl) {
      const badges = msgEl.querySelectorAll(`.citation-ref-badge[data-citation-index="${index}"]`);
      badges.forEach((b) => b.classList.add('is-highlighted'));
    }
  }, []);

  const handleCardMouseLeave = useCallback((msgId: string, index: number) => {
    const msgEl = document.querySelector(`[data-message-id="${msgId}"]`);
    if (msgEl) {
      if (index === 0) {
        const badges = msgEl.querySelectorAll('.citation-ref-badge');
        badges.forEach((b) => b.classList.remove('is-highlighted'));
      } else {
        const badges = msgEl.querySelectorAll(
          `.citation-ref-badge[data-citation-index="${index}"]`,
        );
        badges.forEach((b) => b.classList.remove('is-highlighted'));
      }
    }
  }, []);

  const handlePopoverMouseEnter = useCallback(() => {
    isMouseInPopoverRef.current = true;
    if (popoverHoverTimerRef.current) {
      clearTimeout(popoverHoverTimerRef.current);
      popoverHoverTimerRef.current = null;
    }
  }, []);

  const handlePopoverMouseLeave = useCallback(() => {
    isMouseInPopoverRef.current = false;
    clearCitationTimers();
    setActiveCitation(null);
  }, [clearCitationTimers]);

  const handleOpenSourceFromPopover = useCallback(
    (source: KnowledgeSource) => {
      clearCitationTimers();
      setActiveCitation(null);
      openKnowledgeSource(source);
    },
    [clearCitationTimers, openKnowledgeSource],
  );

  const popoverPosition = useMemo(() => {
    if (!activeCitation) return null;
    const popoverWidth = 360;
    const margin = 12;
    const anchor = activeCitation.anchorRect;
    const showAbove = anchor.top > 240;
    const top = showAbove ? undefined : anchor.bottom + 6;
    const bottom = showAbove ? window.innerHeight - anchor.top + 6 : undefined;
    const desiredLeft = anchor.left + anchor.width / 2 - popoverWidth / 2;
    const left = Math.max(margin, Math.min(window.innerWidth - popoverWidth - margin, desiredLeft));
    return { left, top, bottom, showAbove, width: popoverWidth };
  }, [activeCitation]);

  // 一键保存到小记
  const handleSaveToMemo = async (content: string) => {
    const rawTitle =
      currentSession?.title && currentSession.title !== '新对话'
        ? `AI 小记: ${currentSession.title}`
        : undefined;
    const memoTitle = getSmartTitle(content, rawTitle || 'AI 对话摘录');
    const memoId = await createMemo(memoTitle);
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
    { title: '打磨技术文档', desc: '润色这篇技术架构文档，使其逻辑更清晰、专业术语更准确' },
  ];

  const selectPrompt = (prompt: (typeof starterPrompts)[0]) => {
    setInputText(prompt.title + '：' + prompt.desc);
  };

  // 寻找最后一条 Assistant 消息与最后一条 User 消息的 ID
  const assistantMsgs = sessionMessages.filter((m) => m.role === 'assistant');
  const lastAssistantMsgId = assistantMsgs[assistantMsgs.length - 1]?.id;
  const userMsgs = sessionMessages.filter((m) => m.role === 'user');
  const lastUserMsgId = userMsgs[userMsgs.length - 1]?.id;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 1. Left Session Panel */}
      <AIChatListPanel />

      {/* 2. Main Chat Panel */}
      <main className="flex-1 flex flex-row min-w-0 bg-bg-main relative overflow-hidden">
        {/* Chat Column */}
        <div className="flex-1 flex flex-col min-w-0 h-full relative">
          {/* Top Header */}
          <header className="h-[60px] flex justify-between items-center px-6 shrink-0 bg-bg-main select-none">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsCatalogCollapsed(!isCatalogCollapsed)}
                className="relative h-[30px] w-[30px] rounded-lg border border-border-color/60 bg-bg-main hover:bg-hover-bg hover:border-border-color text-text-secondary hover:text-text-primary shadow-xs flex items-center justify-center transition-all duration-200 cursor-pointer shrink-0 group overflow-hidden"
                title={isCatalogCollapsed ? '展开会话栏' : '折叠会话栏'}
                aria-label={isCatalogCollapsed ? '展开会话栏' : '折叠会话栏'}
              >
                {/* 1. 折叠状态下的星星图标 (未悬浮时常态展示，悬浮时平滑淡出微旋) */}
                <span
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${
                    isCatalogCollapsed
                      ? 'opacity-100 scale-100 rotate-0 group-hover:opacity-0 group-hover:scale-75 group-hover:-rotate-45 group-hover:pointer-events-none'
                      : 'opacity-0 scale-75 -rotate-45 pointer-events-none'
                  }`}
                >
                  <Sparkles size={16} className="text-active-fg" />
                </span>

                {/* 2. 折叠状态下的展开图标 (悬浮时平滑淡入微旋，悬浮期间保持) */}
                <span
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${
                    isCatalogCollapsed
                      ? 'opacity-0 scale-75 rotate-45 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:rotate-0 group-hover:pointer-events-auto'
                      : 'opacity-0 scale-75 rotate-45 pointer-events-none'
                  }`}
                >
                  <PanelLeftOpen size={16} />
                </span>

                {/* 3. 展开状态下的折叠图标 (展开时显示，点击折叠时平滑淡出) */}
                <span
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${
                    !isCatalogCollapsed
                      ? 'opacity-100 scale-100 rotate-0'
                      : 'opacity-0 scale-75 rotate-45 pointer-events-none'
                  }`}
                >
                  <PanelLeftClose size={16} />
                </span>
              </button>
              <div
                className="relative inline-flex items-center cursor-pointer select-none"
                title={
                  backendStatus === 'connected'
                    ? '云端推理引擎已就绪 · DeepSeek V4'
                    : backendStatus === 'disconnected'
                      ? '云端服务已断开，请检查网络连接'
                      : '检测云端连接中...'
                }
              >
                <span className="h-[30px] inline-flex items-center text-xs font-semibold bg-active-bg text-active-fg px-3 rounded-2xl border border-active-border shrink-0 transition-colors shadow-xs">
                  {isThinkingEnabled ? 'DeepSeek V4-Pro' : 'DeepSeek V4'}
                </span>
                {/* 状态指示小点：咬合在徽章右上角 */}
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center">
                  {backendStatus === 'connected' ? (
                    <>
                      <span
                        className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"
                        style={{ animationDuration: '3s' }}
                      />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 ring-2 ring-bg-main" />
                    </>
                  ) : backendStatus === 'disconnected' ? (
                    <>
                      <span
                        className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60"
                        style={{ animationDuration: '2s' }}
                      />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 ring-2 ring-bg-main" />
                    </>
                  ) : (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-400 ring-2 ring-bg-main" />
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <CloudRagGate onMessage={setToastText} />
            </div>
          </header>

          {/* Top Progressive Blur & Gradient Transition (between Header and Document Stream) */}
          <div className="absolute top-[60px] left-0 right-0 h-8 z-20 chat-scroll-fade-top" />

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
            onScroll={handleScroll}
            onMouseOver={handleContainerMouseOver}
            onMouseOut={handleContainerMouseOut}
            onClick={handleContainerClick}
            className="flex-1 overflow-y-auto px-4 md:px-6 flex flex-col transition-all duration-300"
            style={{ scrollbarGutter: 'stable' }}
          >
            {/* Messages Stream */}
            <div className="flex-1 py-6">
              {sessionMessages.length === 0 ? (
                <div className="max-w-3xl mx-auto pt-8 flex flex-col items-center">
                  <div className="w-28 h-28 mb-3 flex items-center justify-center select-none">
                    <Lottie animationData={moonAnimation} loop={true} className="w-full h-full" />
                  </div>
                  <h1 className="text-xl font-bold text-text-primary mb-2">Hi，今天想写点什么？</h1>
                  <p className="text-xs text-text-secondary mb-8 text-center max-w-md">
                    引用知识库文档，或直接提问。
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                    {starterPrompts.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectPrompt(p)}
                        className="p-3.5 bg-bg-panel border border-border-color hover:border-indigo-200 dark:hover:border-indigo-800 rounded-xl text-left hover:shadow-md transition-all group cursor-pointer"
                      >
                        <div className="text-xs font-bold text-text-primary group-hover:text-accent mb-1 flex items-center justify-between">
                          {p.title}
                          <Sparkles
                            size={12}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          />
                        </div>
                        <div className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">
                          {p.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto flex flex-col space-y-8">
                  {sessionMessages.map((msg) => {
                    const isUser = msg.role === 'user';
                    const isLastUser = isUser && msg.id === lastUserMsgId;
                    const isEditing = isUser && editingMessageId === msg.id;
                    const isExpanded = expandedThinking[msg.id] !== false;
                    const isLastAssistant = !isUser && msg.id === lastAssistantMsgId;
                    const knowledgeSources = msg.knowledgeSources || [];
                    const timestamp = new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={msg.id}
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
                                  onChange={(e) => setEditingContent(e.target.value)}
                                  onKeyDown={(e) => handleEditingKeyDown(e, msg)}
                                  placeholder="输入修改后的消息..."
                                  className="col-start-1 row-start-1 w-full min-w-0 min-h-[24px] resize-none bg-transparent outline-none text-[15px] text-text-primary placeholder:text-text-ghost leading-relaxed whitespace-pre-wrap break-words border-none p-0 m-0 box-border overflow-y-hidden font-[inherit]"
                                  rows={1}
                                />
                              </div>

                              {/* 编辑模式底部操作按钮 (自然向下展开 / 向上收起动画) */}
                              <div
                                className={`mt-2.5 flex items-center justify-end gap-2 select-none ${
                                  isCancelingEdit
                                    ? 'animate-bubble-collapse-up'
                                    : 'animate-bubble-expand-down'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleCancelEdit(msg.content)}
                                  className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
                                >
                                  取消
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveAndResend(msg)}
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
                                    onClick={() => toggleThinkingNode(msg.id)}
                                    className="flex items-center gap-1.5 py-1 text-[13px] text-text-secondary transition-colors hover:text-text-primary cursor-pointer font-sans select-none"
                                  >
                                    <span className="font-medium">
                                      {getThinkingLabel(msg, liveThinkingSeconds)}
                                    </span>
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
                                        __html: renderMarkdownToHtml(msg.content),
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
                                  onClick={() => navigate('/dev/local-retrieval')}
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
                                  onClick={() => handleRetryQuestion(msg.id)}
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
                              onClick={() => {
                                setLiveThinkingSeconds(0);
                                regenerateResponse(msg.id);
                              }}
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
                              onClick={() => handleCopyText(msg.id, msg.content)}
                              className="p-1 text-text-secondary hover:text-text-primary hover:bg-hover-bg rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                              title="复制回答"
                            >
                              {copiedMsgId === msg.id ? (
                                <Check size={15} className="text-emerald-500" />
                              ) : (
                                <Copy size={15} />
                              )}
                            </button>

                            <div className="w-px h-3 bg-border-color mx-0.5" />

                            {/* 生成文档 */}
                            <button
                              onClick={() => handleOpenDocChooser(msg.content)}
                              className="flex h-6 items-center gap-1 rounded px-1.5 text-[13px] text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary cursor-pointer"
                              title="生成为知识库文档"
                            >
                              <FilePlus size={14} />
                              <span>生成文档</span>
                            </button>

                            {/* 保存到小记 */}
                            <button
                              onClick={() => handleSaveToMemo(msg.content)}
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
                                onClick={() => handleToggleSourcesDrawer(msg.id)}
                                className={`flex h-6 items-center gap-1 rounded px-1.5 text-[12px] font-medium transition-all cursor-pointer ${
                                  activeSourcesMsgId === msg.id && isSourcesDrawerOpen
                                    ? 'bg-active-bg text-active-fg font-semibold border border-active-border'
                                    : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                                }`}
                                title="查看本回答引用的知识库来源"
                              >
                                <BookOpen size={13} className="shrink-0" />
                                <span>来源</span>
                                <span
                                  className={`text-[10px] font-semibold px-1 rounded-full ${
                                    activeSourcesMsgId === msg.id && isSourcesDrawerOpen
                                      ? 'bg-active-border/60 text-active-fg'
                                      : 'bg-hover-bg text-text-secondary'
                                  }`}
                                >
                                  {knowledgeSources.length}
                                </span>
                              </button>
                            )}

                            <div className="w-px h-3 bg-border-color mx-0.5" />

                            <span className="ml-auto shrink-0 text-[13px] text-text-secondary">
                              {timestamp}
                            </span>
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
                                onClick={() => handleCopyText(msg.id, msg.content)}
                                className="rounded p-1 hover:bg-hover-bg hover:text-text-primary cursor-pointer"
                                title="复制消息"
                                aria-label="复制消息"
                              >
                                {copiedMsgId === msg.id ? (
                                  <Check size={15} className="text-emerald-500" />
                                ) : (
                                  <Copy size={15} />
                                )}
                              </button>
                              {isLastUser && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(msg)}
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
                  })}

                  {/* 仅在初始化等待连接时展示动画 */}
                  {isGenerating &&
                    sessionMessages.length > 0 &&
                    sessionMessages[sessionMessages.length - 1]?.role === 'user' && (
                      <div className="flex items-center gap-2 py-1 text-[13px] text-text-secondary">
                        <Loader2 size={14} className="animate-spin text-accent" />
                        <span>正在思考并撰写内容...</span>
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Bottom Input Area (Sticky at bottom of scroll container) */}
            <div className="sticky bottom-0 pb-4 pt-0 bg-bg-main/80 backdrop-blur-md -mx-4 md:-mx-6 px-4 md:px-6 z-20 shrink-0">
              {/* Bottom Progressive Blur & Gradient Transition (between Document Stream and Input Area) */}
              <div className="absolute -top-8 left-0 right-0 h-8 chat-scroll-fade-bottom" />
              <div className="max-w-3xl mx-auto flex flex-col gap-2 relative">
                {/* Attachment badges above input */}
                {(referencedDocs.length > 0 || attachedFiles.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-bg-panel border border-border-color/60 rounded-xl mb-1.5 animate-dropdown-fade-in">
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

                {/* Main Textarea Container (Kimi Unified Style) */}
                <div className="border border-border-color focus-within:border-accent bg-bg-main rounded-2xl md:rounded-[24px] shadow-[0_1px_3px_rgba(0,0,0,0.035)] transition-all overflow-hidden flex flex-col p-2 gap-2">
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      currentSessionId
                        ? '与 Duet 助手对话，输入并发送...'
                        : '与 Duet 助手开启新对话...'
                    }
                    className="w-full resize-none bg-transparent px-1 py-1 outline-none text-sm text-text-primary placeholder-text-secondary font-sans leading-relaxed border-none overflow-y-auto max-h-[220px]"
                    style={{ minHeight: '52px' }}
                  />

                  {/* Input Toolbar (Unified 0px inner padding for exact symmetric margins) */}
                  <div className="p-0 bg-transparent flex justify-between items-center shrink-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2.5">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            setAttachMenuAnchorEl(e.currentTarget);
                            setIsAttachMenuOpen(!isAttachMenuOpen);
                          }}
                          className="w-8.5 h-8.5 rounded-full hover:bg-hover-bg text-text-secondary hover:text-text-primary flex items-center justify-center transition-all cursor-pointer"
                          title="引用知识库文档"
                        >
                          <Plus size={18} />
                        </button>
                      </div>

                      {/* Thinking toggle (Pill shape) */}
                      <button
                        type="button"
                        onClick={() => setIsThinkingEnabled(!isThinkingEnabled)}
                        className={`h-8 px-3 rounded-full border flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer ${
                          isThinkingEnabled
                            ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800 text-accent font-semibold'
                            : 'bg-bg-main border-border-color/80 text-text-secondary hover:bg-hover-bg'
                        }`}
                        title="切换 DeepSeek V4-Pro (深度思考) / V4 (标准模式)"
                      >
                        <BrainCircuit
                          size={13}
                          className={isThinkingEnabled ? 'animate-pulse' : ''}
                        />
                        <span>{isThinkingEnabled ? '深度思考 (V4-Pro)' : '标准模式 (V4)'}</span>
                      </button>
                      {hasLocalEmbeddingModel === false && (
                        <label
                          className="inline-flex h-8 items-center gap-1.5 text-xs text-text-secondary"
                          title="开启后，仅在助手需要检索时调用云端 BGE 生成查询向量；不会自动建立索引"
                        >
                          <input
                            type="checkbox"
                            checked={allowCloudQuery}
                            onChange={(event) => setAllowCloudQuery(event.target.checked)}
                            disabled={isGenerating}
                          />
                          <Cloud size={13} />
                          <span className="sm:hidden">云检索（付费）</span>
                          <span className="hidden sm:inline">云端检索（按次计费）</span>
                        </label>
                      )}
                    </div>

                    {/* Send or Stop Button (Circular) */}
                    {isGenerating ? (
                      <button
                        type="button"
                        onClick={stopGeneration}
                        className="w-8.5 h-8.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
                        title="停止生成"
                      >
                        <Square size={12} className="fill-current" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSend}
                        className="w-8.5 h-8.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
                        title="发送消息"
                      >
                        <Send size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sources Drawer */}
        <AISourcesDrawer
          isOpen={isSourcesDrawerOpen}
          onClose={closeSourcesDrawer}
          sources={activeDrawerSources}
          highlightedIndex={drawerHighlightIndex}
          onOpenSource={openKnowledgeSource}
          onHoverSource={(index) => {
            if (!activeSourcesMsgId) return;
            if (index === null) {
              handleCardMouseLeave(activeSourcesMsgId, 0);
            } else {
              handleCardMouseEnter(activeSourcesMsgId, index);
            }
          }}
        />
      </main>

      {/* Citation Preview Popover */}
      {activeCitation && popoverPosition && (
        <div
          style={{
            position: 'fixed',
            left: `${popoverPosition.left}px`,
            ...(popoverPosition.top !== undefined ? { top: `${popoverPosition.top}px` } : {}),
            ...(popoverPosition.bottom !== undefined
              ? { bottom: `${popoverPosition.bottom}px` }
              : {}),
            width: `${popoverPosition.width}px`,
          }}
          className={`z-50 rounded-xl border border-border-color bg-bg-main shadow-xl animate-citation-popover select-none ${
            popoverPosition.showAbove
              ? 'after:absolute after:-bottom-2 after:left-0 after:w-full after:h-2 after:content-[""]'
              : 'before:absolute before:-top-2 before:left-0 before:w-full before:h-2 before:content-[""]'
          }`}
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
        >
          <AISourceCard
            source={activeCitation.source}
            originalIndex={activeCitation.index}
            onOpenSource={handleOpenSourceFromPopover}
            className="hover:shadow-none"
          />
        </div>
      )}

      {/* Floating attachment dropdown menu */}
      <AIAttachMenu
        isOpen={isAttachMenuOpen}
        onClose={() => setIsAttachMenuOpen(false)}
        onAttachFile={(name) => setAttachedFiles((prev) => [...prev, name])}
        onOpenDocSelector={() => setIsDocSelectorOpen(true)}
        anchorEl={attachMenuAnchorEl}
      />

      {/* KB Document selector Modal */}
      <KBTreePickerModal
        isOpen={isDocSelectorOpen}
        onClose={() => setIsDocSelectorOpen(false)}
        title="选择知识库文档"
        mode="document"
        onSelectDoc={(doc) => {
          if (!referencedDocs.some((d) => d.id === doc.id)) {
            setReferencedDocs((prev) => [...prev, doc]);
          }
        }}
      />

      {/* KB Chooser Modal for generating documents */}
      <KBTreePickerModal
        isOpen={isKBChooserOpen}
        onClose={() => setIsKBChooserOpen(false)}
        title="生成为知识库文档"
        subtitle="选择目标知识库或目录，将当前回答转存为文档"
        mode="create-doc"
        defaultTitle={kbChooserDefaultTitle}
        onCreateDoc={handleConfirmCreateDoc}
      />
    </div>
  );
}
