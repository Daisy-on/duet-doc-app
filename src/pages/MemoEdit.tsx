import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { JSONContent } from '@tiptap/core';
import MemoCatalogPanel from '../components/MemoCatalogPanel';
import OutlinePanel from '../components/OutlinePanel';
import Editor from '../components/Editor';
import Toolbar from '../components/Toolbar';
import { useEditorStore, useLayoutStore } from '../store';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import { CloudUpload, Share2, History, MoreHorizontal, StickyNote, PanelLeft } from 'lucide-react';

// Escape HTML characters to safely insert into HTML string
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Replace the first <h1> tag's inner text or the first level 1 heading in JSON
function replaceFirstH1(content: string, newTitle: string): string {
  const isJson = content.trim().startsWith('{');
  if (isJson) {
    try {
      const parsed = JSON.parse(content) as JSONContent;
      if (!parsed || typeof parsed !== 'object') {
        return content;
      }
      let found = false;
      const traverse = (node: JSONContent) => {
        if (found) return;
        if (node.type === 'heading' && node.attrs?.level === 1) {
          node.content = [{ type: 'text', text: newTitle }];
          found = true;
          return;
        }
        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            traverse(child);
          }
        }
      };
      traverse(parsed);
      if (!found) {
        const h1Node: JSONContent = {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: newTitle }],
        };
        parsed.content = [h1Node, ...(parsed.content || [])];
      }
      return JSON.stringify(parsed);
    } catch (err) {
      console.error(err);
      return content;
    }
  } else {
    const escapedTitle = escapeHtml(newTitle);
    const match = content.match(/<h1([^>]*)>([\s\S]*?)<\/h1>/);
    if (match) {
      return content.replace(/<h1([^>]*)>([\s\S]*?)<\/h1>/, `<h1$1>${escapedTitle}</h1>`);
    } else {
      return `<h1>${escapedTitle}</h1>` + content;
    }
  }
}

export default function MemoEdit() {
  const { memoId } = useParams<{ memoId: string }>();
  const navigate = useNavigate();

  const memo = useKnowledgeBaseStore((state) => state.documents.find((item) => item.id === memoId));
  const updateDocument = useKnowledgeBaseStore((state) => state.updateDocument);
  const createManualVersion = useKnowledgeBaseStore((state) => state.createManualVersion);
  const isCatalogCollapsed = useLayoutStore((state) => state.isCatalogCollapsed);
  const setIsCatalogCollapsed = useLayoutStore((state) => state.setIsCatalogCollapsed);

  const editorInstance = useEditorStore((state) => state.editorInstance);
  const flushPendingDocumentUpdate = useEditorStore((state) => state.flushPendingDocumentUpdate);
  const [toastText, setToastText] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.useKnowledgeBaseStore = useKnowledgeBaseStore;
    return () => {
      delete window.useKnowledgeBaseStore;
    };
  }, []);

  // Sync first <h1> inside the content when memoId changes
  useEffect(() => {
    if (!memoId) return;
    const currentMemo = useKnowledgeBaseStore
      .getState()
      .documents.find((item) => item.id === memoId);
    if (!currentMemo) return;
    const updatedContent = replaceFirstH1(currentMemo.content, currentMemo.title);
    if (updatedContent !== currentMemo.content) {
      updateDocument(currentMemo.id, { content: updatedContent });
    }
  }, [memoId, updateDocument]);

  // CTRL+S / CMD+S 手动保存版本快捷键拦截
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (memoId) {
          createManualVersion(memoId)
            .then(() => {
              setToastText('已手动保存版本快照');
              setTimeout(() => setToastText(null), 2500);
            })
            .catch((err) => {
              console.error('Failed to create manual version:', err);
              setToastText('手动保存版本失败');
              setTimeout(() => setToastText(null), 2500);
            });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [memoId, createManualVersion]);

  if (!memo || !memoId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main">
        <div className="text-center">
          <h2 className="text-lg font-bold text-text-primary mb-2">小记不存在</h2>
          <button
            onClick={() => navigate('/memo')}
            className="px-4 py-2 bg-accent hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            返回小记主页
          </button>
        </div>
      </div>
    );
  }

  const saveTime = new Date(memo.updatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const openHistory = () => {
    flushPendingDocumentUpdate(memoId);
    navigate(`/kb/kb-memo-system/doc/${memoId}/history`);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel for list of Memos */}
      <MemoCatalogPanel />

      {/* Right panel editor workspace */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-main relative">
        {/* Header */}
        <header className="h-[60px] border-b border-border-color flex justify-between items-center px-6 shrink-0 bg-white">
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              onClick={() => setIsCatalogCollapsed(!isCatalogCollapsed)}
              className="text-text-secondary hover:text-text-primary hover:bg-hover-bg p-1.5 rounded-lg border border-border-color/60 bg-white shadow-sm flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title={isCatalogCollapsed ? '展开' : '折叠'}
            >
              <PanelLeft size={16} />
            </button>
            <div className="flex items-center gap-3 ml-1 min-w-0">
              <input
                type="text"
                value={memo.title}
                onChange={(e) => {
                  const newTitle = e.target.value;
                  flushPendingDocumentUpdate(memo.id);
                  const latestContent =
                    useKnowledgeBaseStore.getState().documents.find((item) => item.id === memo.id)
                      ?.content ?? memo.content;
                  const updatedContent = replaceFirstH1(latestContent, newTitle);
                  updateDocument(memo.id, {
                    title: newTitle,
                    content: updatedContent,
                  });
                }}
                className="text-[15px] font-semibold text-text-primary bg-transparent hover:bg-gray-50 focus:bg-white border border-transparent focus:border-border-color rounded-lg px-2.5 py-1 outline-none transition-colors max-w-[280px] font-sans"
                placeholder="无标题小记"
              />
              <div className="flex items-center gap-3 text-xs shrink-0">
                <button
                  onClick={openHistory}
                  className="text-text-secondary hover:text-accent hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                  title="查看历史版本"
                >
                  <CloudUpload size={14} /> 已保存 {saveTime}
                </button>
                <span className="bg-pink-50 text-pink-600 px-2.5 py-1 rounded-full font-medium flex items-center gap-1 border border-pink-200">
                  <StickyNote size={12} /> 独立小记
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-text-secondary">
            <span
              title="分享"
              className="cursor-pointer hover:text-text-primary transition-colors flex"
            >
              <Share2 size={16} />
            </span>
            <button
              title="历史记录"
              onClick={openHistory}
              className="cursor-pointer hover:text-text-primary transition-colors flex bg-transparent border-none p-0 outline-none"
            >
              <History size={16} />
            </button>
            <span className="cursor-pointer hover:text-text-primary transition-colors flex">
              <MoreHorizontal size={16} />
            </span>
          </div>
        </header>

        {/* Toolbar */}
        <Toolbar editor={editorInstance} />

        {/* Editor Area */}
        <Editor />
      </main>

      {/* Right Outline panel */}
      <OutlinePanel />

      {/* 手动保存版本 Toast 提示 */}
      {toastText && (
        <div className="fixed top-16 left-1/2 z-50 bg-gray-900/90 text-white text-xs px-4 py-2.5 rounded-lg shadow-xl border border-gray-700/50 animate-toast-in flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastText}</span>
        </div>
      )}
    </div>
  );
}
