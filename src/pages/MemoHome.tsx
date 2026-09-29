import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PanelLeft,
  Clock,
  CheckSquare,
  Sparkles,
  Users,
  ArrowUpRight,
  CornerDownLeft,
} from 'lucide-react';
import MemoCatalogPanel from '../components/MemoCatalogPanel';
import { MEMO_KB_ID, useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import { useLayoutStore } from '../store';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMemoSnippet(content: string): string {
  if (!content) return '';
  if (content.trim().startsWith('{')) {
    try {
      const data = JSON.parse(content);
      // Recursively extract text nodes
      const extract = (node: Record<string, unknown>): string => {
        if (!node) return '';
        if (typeof node.text === 'string') return node.text;
        if (Array.isArray(node.content)) {
          return node.content.map((child) => extract(child as Record<string, unknown>)).join(' ');
        }
        return '';
      };
      const text = extract(data as Record<string, unknown>).trim();
      return text.slice(0, 100);
    } catch {
      return '';
    }
  }
  // Strip HTML tags for clean text preview
  const text = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 100);
}

function formatMemoTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function MemoHome() {
  const navigate = useNavigate();
  const documents = useKnowledgeBaseStore((state) => state.documents);
  const createMemo = useKnowledgeBaseStore((state) => state.createMemo);
  const updateDocument = useKnowledgeBaseStore((state) => state.updateDocument);
  const { isCatalogCollapsed, setIsCatalogCollapsed } = useLayoutStore();

  const [quickInput, setQuickInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const memos = documents.filter((d) => d.kbId === MEMO_KB_ID);
  const sortedMemos = [...memos].sort((a, b) => b.updatedAt - a.updatedAt);
  const recentMemos = sortedMemos.slice(0, 3);

  const handleSaveQuickMemo = async () => {
    const raw = quickInput.trim();
    if (!raw) return;

    setIsSaving(true);
    try {
      const lines = raw.split('\n').filter((l) => l.trim().length > 0);
      const title = lines[0]?.slice(0, 30) || '未命名小记';
      const body = lines.length > 1 ? lines.slice(1).join('\n') : '';
      const htmlContent = `<h1>${escapeHtml(title)}</h1>${
        body ? `<p>${escapeHtml(body).replace(/\n/g, '<br/>')}</p>` : '<p></p>'
      }`;

      const newId = await createMemo(title);
      updateDocument(newId, { content: htmlContent });
      setQuickInput('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSaveQuickMemo();
    }
  };

  const templates = [
    {
      title: '今日待办清单',
      desc: '三件重要事项与跟进清单',
      icon: CheckSquare,
      color:
        'text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800/40',
      initialContent: `<h1>今日待办清单</h1><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>重要事项 1：</p></li><li data-type="taskItem" data-checked="false"><p>重要事项 2：</p></li><li data-type="taskItem" data-checked="false"><p>跟进与备忘：</p></li></ul>`,
    },
    {
      title: '灵感碎片随笔',
      desc: '突发想法、金句与设计灵感',
      icon: Sparkles,
      color:
        'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-800/40',
      initialContent: `<h1>灵感随笔</h1><p>💡 核心想法：</p><p></p><p>📌 背景与触发点：</p><p></p><p>🚀 下一步探索：</p>`,
    },
    {
      title: '会议与沟通备忘',
      desc: '讨论要点、决议与 Action Items',
      icon: Users,
      color:
        'text-blue-500 bg-blue-50 dark:bg-blue-950/40 border-blue-200/60 dark:border-blue-800/40',
      initialContent: `<h1>会议与沟通备忘</h1><p>👥 参会人：</p><p>🎯 讨论要点：</p><p>✅ 决议与 Action Items：</p>`,
    },
  ];

  const handleCreateFromTemplate = async (template: (typeof templates)[0]) => {
    const newId = await createMemo(template.title);
    updateDocument(newId, { content: template.initialContent });
    navigate(`/memo/${newId}`);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel for list of Memos */}
      <MemoCatalogPanel />

      {/* Right panel interactive scratchpad workspace */}
      <main className="flex-1 flex flex-col bg-bg-main relative overflow-y-auto">
        {/* Top Header */}
        <header className="h-[60px] flex justify-between items-center px-6 shrink-0 bg-bg-main select-none">
          {/* Left: Collapse toggle + Icon + Title + Subtitle */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsCatalogCollapsed(!isCatalogCollapsed)}
              className="text-text-secondary hover:text-text-primary hover:bg-hover-bg p-1.5 rounded-lg border border-border-color/60 bg-bg-main shadow-xs flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title={isCatalogCollapsed ? '展开目录' : '折叠目录'}
              aria-label={isCatalogCollapsed ? '展开目录' : '折叠目录'}
            >
              <PanelLeft size={16} />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <h1 className="text-[16px] font-bold text-text-primary shrink-0 tracking-tight">
                我的小记
              </h1>
              <span className="text-xs text-text-secondary truncate hidden md:inline ml-1">
                随时捕捉闪念、待办与灵感碎片
              </span>
            </div>
          </div>

          {/* Right: Count Badge */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-text-secondary px-2.5 py-1 rounded-full bg-hover-bg/80 border border-border-color/60">
              共 {memos.length} 条便签
            </span>
          </div>
        </header>

        {/* Workspace Body - Focus Flow Layout */}
        <div className="flex-1 flex flex-col justify-center px-4 sm:px-8 py-8 max-w-4xl mx-auto w-full space-y-6 my-auto">
          {/* Quick Scratchpad Input Box (Full Width Aligned) */}
          <div className="w-full bg-bg-main border border-border-color/80 focus-within:border-emerald-200/50 focus-within:ring-2 focus-within:ring-emerald-200/20 focus-within:shadow-[0_0_16px_rgba(16,185,129,0.16)] dark:focus-within:border-emerald-400/50 dark:focus-within:ring-emerald-400/20 dark:focus-within:shadow-[0_0_20px_rgba(16,185,129,0.2)] rounded-2xl shadow-xs transition-all overflow-hidden p-3 flex flex-col gap-2.5">
            <textarea
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="在此随手写下闪念、待办或临时摘录... (按 ⌘+Enter 快速存为小记)"
              className="w-full bg-transparent text-xs sm:text-sm text-text-primary placeholder:text-text-ghost outline-none resize-none min-h-[68px] max-h-48 leading-relaxed"
              rows={3}
            />

            <div className="flex items-center justify-end select-none">
              <button
                type="button"
                onClick={handleSaveQuickMemo}
                disabled={!quickInput.trim() || isSaving}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-xs cursor-pointer ${
                  quickInput.trim() && !isSaving
                    ? 'bg-blue-500 hover:bg-blue-400 active:bg-blue-400 text-white hover:shadow'
                    : 'bg-hover-bg text-text-ghost cursor-not-allowed border border-border-color/40 shadow-none'
                }`}
              >
                <CornerDownLeft size={13} />
                <span>{isSaving ? '保存中...' : '保存'}</span>
              </button>
            </div>
          </div>

          {/* Dynamic Content: Recent Memos Wall (Top 3) or Starter Templates */}
          {recentMemos.length > 0 ? (
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between text-sm font-semibold text-text-secondary select-none px-1">
                <span className="flex items-center gap-1.5">
                  <Clock size={14} />
                  <span>最近的小记</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full">
                {recentMemos.map((memo) => {
                  const snippet = getMemoSnippet(memo.content);
                  return (
                    <div
                      key={memo.id}
                      onClick={() => navigate(`/memo/${memo.id}`)}
                      className="group relative p-4 rounded-2xl border border-border-color/70 bg-bg-main hover:border-amber-500/40 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[110px]"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-bold text-text-primary group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
                            {memo.title}
                          </h4>
                          <ArrowUpRight
                            size={14}
                            className="text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          />
                        </div>
                        <p className="text-[11px] text-text-secondary line-clamp-3 leading-relaxed">
                          {snippet || <span className="italic text-text-ghost">暂无详细正文</span>}
                        </p>
                      </div>

                      <div className="pt-2 flex items-center justify-between text-[10px] text-text-ghost">
                        <span>{formatMemoTime(memo.updatedAt)}</span>
                        <span className="group-hover:text-amber-500 transition-colors">编辑</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Empty State Starter Templates */
            <div className="w-full space-y-3 pt-2">
              <div className="text-xs font-semibold text-text-secondary text-center select-none">
                常用速记模版启发
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full">
                {templates.map((tpl, idx) => {
                  const Icon = tpl.icon;
                  return (
                    <div
                      key={idx}
                      onClick={() => handleCreateFromTemplate(tpl)}
                      className="group p-4 rounded-2xl border border-border-color/70 bg-bg-main hover:border-amber-500/40 hover:shadow-md transition-all cursor-pointer flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className={`w-8 h-8 rounded-xl border flex items-center justify-center ${tpl.color}`}
                        >
                          <Icon size={16} />
                        </div>
                        <ArrowUpRight
                          size={14}
                          className="text-text-ghost group-hover:text-amber-500 transition-colors"
                        />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-text-primary group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors mb-0.5">
                          {tpl.title}
                        </div>
                        <div className="text-[11px] text-text-secondary leading-relaxed">
                          {tpl.desc}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
