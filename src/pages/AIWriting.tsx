import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Send, Globe, BrainCircuit, Plus, X, ChevronDown, ChevronUp, Loader2, FileText, FileUp, Sparkles, MessageSquare
} from 'lucide-react';
import AIChatListPanel from '../components/AIChatListPanel';
import AIAttachMenu from '../components/menus/AIAttachMenu';
import KBDocSelectorModal from '../components/modals/KBDocSelectorModal';
import { useAIWritingStore } from '../store/aiWritingStore';
import type { ReferencedDoc } from '../store/aiWritingStore';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';

// Simple Markdown parser for beautiful text display
function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeContent: string[] = [];

  return lines.map((line, idx) => {
    // Code block check
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        const code = codeContent.join('\n');
        codeContent = [];
        return (
          <pre key={idx} className="bg-gray-900 text-gray-100 p-4 rounded-lg my-2 font-mono text-xs overflow-x-auto shadow-inner border border-gray-800">
            <code>{code}</code>
          </pre>
        );
      } else {
        inCodeBlock = true;
        return null;
      }
    }

    if (inCodeBlock) {
      codeContent.push(line);
      return null;
    }

    // Header 3
    if (line.startsWith('### ')) {
      return (
        <h4 key={idx} className="text-sm font-bold text-text-primary mt-4 mb-2">
          {line.replace('### ', '')}
        </h4>
      );
    }

    // Header 2
    if (line.startsWith('## ')) {
      return (
        <h3 key={idx} className="text-base font-bold text-text-primary mt-5 mb-2.5">
          {line.replace('## ', '')}
        </h3>
      );
    }

    // Bullets
    if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
      const content = line.trim().substring(2);
      return (
        <ul key={idx} className="list-disc pl-5 my-1 text-xs text-text-secondary leading-relaxed">
          <li>{renderInlineStyles(content)}</li>
        </ul>
      );
    }

    // Empty line
    if (line.trim() === '') {
      return <div key={idx} className="h-2" />;
    }

    // Paragraph
    return (
      <p key={idx} className="text-xs text-text-secondary leading-relaxed my-1.5">
        {renderInlineStyles(line)}
      </p>
    );
  }).filter(Boolean) as React.ReactNode[];
}

// Render bold (`**`) and inline code (`` ` ``)
function renderInlineStyles(text: string): React.ReactNode {
  // Bold matches: **text**
  // Inline code matches: `code`
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-text-primary">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-gray-100 text-indigo-600 px-1.5 py-0.5 rounded font-mono text-[11px] border border-gray-200">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export default function AIWriting() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  
  const { 
    sessions, messages, activeSessionId, createSession, 
    sendMessage, isThinkingEnabled, isWebSearchEnabled, 
    setIsThinkingEnabled, setIsWebSearchEnabled, setActiveSessionId
  } = useAIWritingStore();

  const { isCatalogCollapsed, setIsCatalogCollapsed } = useKnowledgeBaseStore();

  // Selected session context
  const currentSessionId = sessionId || activeSessionId;
  const sessionMessages = messages.filter((m) => m.sessionId === currentSessionId);

  // Local state
  const [inputText, setInputText] = useState('');
  const [referencedDocs, setReferencedDocs] = useState<ReferencedDoc[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});

  // Menu/Modal anchors & states
  const [attachMenuAnchorEl, setAttachMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isDocSelectorOpen, setIsDocSelectorOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-redirect to first session if URL is /ai-writing and sessions exist
  useEffect(() => {
    if (!sessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
      navigate(`/ai-writing/${sessions[0].id}`);
    }
  }, [sessionId, sessions, navigate, setActiveSessionId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessionMessages, isTyping]);

  // Handle typing state representation
  useEffect(() => {
    // If the last message in current session is from user, show typing indicator
    const lastMsg = sessionMessages[sessionMessages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      setIsTyping(true);
    } else {
      setIsTyping(false);
    }
  }, [sessionMessages]);

  const handleSend = () => {
    if (!inputText.trim() && referencedDocs.length === 0 && attachedFiles.length === 0) return;
    
    let targetSessionId = currentSessionId;
    if (!targetSessionId) {
      // Create session on-the-fly
      targetSessionId = createSession(inputText.trim().substring(0, 15) || '新对话');
      navigate(`/ai-writing/${targetSessionId}`);
    }

    const payloadDocs = [
      ...referencedDocs,
      ...attachedFiles.map(file => ({ id: `file-${Date.now()}`, title: file }))
    ];

    sendMessage(targetSessionId!, inputText, payloadDocs);
    setInputText('');
    setReferencedDocs([]);
    setAttachedFiles([]);
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
      [msgId]: !prev[msgId],
    }));
  };

  // Quick prompt templates
  const starterPrompts = [
    { title: '分析竞品优势', desc: '基于引用的知识库文章撰写竞品优势分析报告' },
    { title: '总结文档核心', desc: '提取这篇文章的几个核心结论和未来规划建议' },
    { title: '打磨技术文档', desc: '润色这篇技术架构文档，使其逻辑更清晰、专业术语更准确' }
  ];

  const selectPrompt = (prompt: typeof starterPrompts[0]) => {
    setInputText(prompt.title + '：' + prompt.desc);
  };

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
                R1 Model
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary bg-gray-50 border border-border-color px-2.5 py-1.5 rounded-lg shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-medium">在线已接入</span>
          </div>
        </header>

        {/* Messages Stream */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-6 md:px-12 space-y-6"
        >
          {sessionMessages.length === 0 ? (
            // Welcome/Empty View
            <div className="max-w-2xl mx-auto pt-12 flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-400 to-pink-400 flex items-center justify-center text-white shadow-lg mb-6 animate-pulse">
                <Sparkles size={28} />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">我是您的 Duet AI 写作助手</h3>
              <p className="text-xs text-text-secondary text-center mb-8 max-w-md leading-relaxed">
                您可以向我提问、让我帮你润色文章、或者引用知识库文档让我进行归纳与分析。开启底部的“思考”可以使用 R1 深度思考模式。
              </p>

              {/* Quick Prompt Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 w-full">
                {starterPrompts.map((p, i) => (
                  <div
                    key={i}
                    onClick={() => selectPrompt(p)}
                    className="p-4 bg-white border border-border-color rounded-xl hover:border-accent hover:shadow-md cursor-pointer transition-all text-left flex flex-col justify-between group h-[120px]"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-text-primary mb-1 group-hover:text-accent transition-colors flex items-center gap-1.5">
                        <MessageSquare size={13} className="text-indigo-400 shrink-0" />
                        {p.title}
                      </h4>
                      <p className="text-[11px] text-text-secondary leading-normal">{p.desc}</p>
                    </div>
                    <span className="text-[10px] text-accent font-semibold self-end opacity-0 group-hover:opacity-100 transition-opacity">
                      使用模板 →
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Chat Message List
            <div className="max-w-3xl mx-auto flex flex-col space-y-5">
              {sessionMessages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    {/* Username or AI name */}
                    <div className="text-[10px] text-text-secondary font-bold mb-1 px-1">
                      {isUser ? '您' : 'Duet AI'}
                    </div>

                    {/* Message Bubble Container */}
                    <div
                      className={`relative px-4 py-3 rounded-2xl shadow-sm border ${
                        isUser
                          ? 'bg-indigo-50 border-indigo-100 rounded-tr-none text-text-primary max-w-[80%] self-end'
                          : 'bg-white border-border-color rounded-tl-none text-text-primary w-full'
                      }`}
                    >
                      {/* Referencd Document attachments in USER message */}
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

                      {/* DeepSeek R1 Thinking logs */}
                      {!isUser && msg.thinkingContent && (
                        <div className="mb-3 border-l-2 border-indigo-200 bg-gray-50/70 rounded-r-lg overflow-hidden">
                          <button
                            onClick={() => toggleThinkingNode(msg.id)}
                            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-bold text-text-secondary bg-gray-100/60 hover:bg-gray-100 transition-colors"
                          >
                            <span className="flex items-center gap-1.5 text-indigo-600">
                              <BrainCircuit size={13} className="animate-spin-slow" />
                              R1 思考过程
                            </span>
                            {expandedThinking[msg.id] ? (
                              <ChevronUp size={12} />
                            ) : (
                              <ChevronDown size={12} />
                            )}
                          </button>
                          {expandedThinking[msg.id] !== false && (
                            <div className="p-3 text-[11px] font-mono text-text-secondary italic whitespace-pre-wrap leading-relaxed">
                              {msg.thinkingContent}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Web Search Sources */}
                      {!isUser && msg.webSearchUrls && msg.webSearchUrls.length > 0 && (
                        <div className="mb-3 flex flex-col gap-1">
                          <div className="text-[10px] font-bold text-text-secondary flex items-center gap-1">
                            <Globe size={11} className="text-indigo-500" />
                            联网搜索来源：
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.webSearchUrls.map((s, idx) => (
                              <a
                                key={idx}
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-text-secondary hover:text-text-primary rounded text-[10px] transition-colors"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                {s.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actual Message Content */}
                      <div className="space-y-1.5">
                        {isUser ? (
                          <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        ) : (
                          parseMarkdown(msg.content)
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="text-[9px] text-text-secondary mt-1 px-1">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                );
              })}

              {/* Typing generation state */}
              {isTyping && (
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

        {/* Bottom Input Area */}
        <div className="p-4 border-t border-border-color bg-white shrink-0">
          <div className="max-w-3xl mx-auto flex flex-col gap-2 relative">
            
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
            <div className="border border-border-color focus-within:border-accent bg-bg-panel focus-within:bg-white rounded-xl shadow-sm transition-all overflow-hidden flex flex-col">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={currentSessionId ? "向 Duet AI 提问，输入并发送..." : "在这里输入对话，点击发送或回车开启新对话..."}
                rows={2}
                className="w-full resize-none bg-transparent px-4 py-3 outline-none text-xs text-text-primary placeholder-text-secondary font-sans leading-relaxed border-none"
              />

              {/* Input Toolbar */}
              <div className="px-4 py-2 bg-gray-50 border-t border-border-color/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  
                  {/* Plus menu trigger */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        setAttachMenuAnchorEl(e.currentTarget);
                        setIsAttachMenuOpen(!isAttachMenuOpen);
                      }}
                      className="w-7 h-7 rounded-lg hover:bg-gray-200/70 border border-border-color text-text-secondary hover:text-text-primary flex items-center justify-center transition-all cursor-pointer shadow-sm"
                      title="添加附件 / 引用文档"
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
                    title="开启 R1 深度思考模式"
                  >
                    <BrainCircuit size={12} className={isThinkingEnabled ? 'animate-pulse' : ''} />
                    <span>深度思考</span>
                  </button>

                  {/* Web search toggle */}
                  <button
                    type="button"
                    onClick={() => setIsWebSearchEnabled(!isWebSearchEnabled)}
                    className={`h-7 px-2.5 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer shadow-sm ${
                      isWebSearchEnabled
                        ? 'bg-indigo-50 border-indigo-200 text-accent font-semibold'
                        : 'bg-white border-border-color text-text-secondary hover:bg-gray-100'
                    }`}
                    title="开启联网搜索实时信息"
                  >
                    <Globe size={12} className={isWebSearchEnabled ? 'animate-pulse' : ''} />
                    <span>联网搜索</span>
                  </button>
                </div>

                {/* Send Button */}
                <button
                  type="button"
                  onClick={handleSend}
                  className="w-8 h-8 rounded-lg bg-accent hover:bg-indigo-700 text-white flex items-center justify-center transition-all cursor-pointer shadow-md hover:shadow-indigo-500/10"
                  title="发送消息"
                >
                  <Send size={13} />
                </button>
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
          // Prevent duplicates
          if (!referencedDocs.some(d => d.id === doc.id)) {
            setReferencedDocs((prev) => [...prev, doc]);
          }
        }}
      />
    </div>
  );
}
