import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { JSONContent } from '@tiptap/core';
import CatalogPanel from '../components/CatalogPanel';
import OutlinePanel from '../components/OutlinePanel';
import Editor from '../components/Editor';
import Toolbar from '../components/Toolbar';
import { useEditorStore, useLayoutStore } from '../store';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import {
  CloudUpload,
  ShieldHalf,
  Star,
  Share2,
  History,
  MoreHorizontal,
  PanelLeft,
} from 'lucide-react';
import FavoritePopover from '../components/modals/FavoritePopover';
import { useFavoritesStore } from '../store/favoritesStore';

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

export default function DocEdit() {
  const { kbId, docId } = useParams<{ kbId: string; docId: string }>();
  const navigate = useNavigate();

  const doc = useKnowledgeBaseStore((state) => state.documents.find((item) => item.id === docId));
  const updateDocument = useKnowledgeBaseStore((state) => state.updateDocument);
  const createManualVersion = useKnowledgeBaseStore((state) => state.createManualVersion);
  const isCatalogCollapsed = useLayoutStore((state) => state.isCatalogCollapsed);
  const setIsCatalogCollapsed = useLayoutStore((state) => state.setIsCatalogCollapsed);

  const editorInstance = useEditorStore((state) => state.editorInstance);
  const isFavorited = useFavoritesStore((state) => state.isFavorited);
  const addFavorite = useFavoritesStore((state) => state.addFavorite);
  const [isFavOpen, setIsFavOpen] = useState(false);
  const [favBtnEl, setFavBtnEl] = useState<HTMLButtonElement | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.useKnowledgeBaseStore = useKnowledgeBaseStore;
    window.useEditorStore = useEditorStore;
    return () => {
      delete window.useKnowledgeBaseStore;
      delete window.useEditorStore;
    };
  }, []);

  // 1. When switching documents (docId changes), ensure the first <h1> inside the content matches the document's external title
  useEffect(() => {
    if (!docId) return;
    const currentDoc = useKnowledgeBaseStore.getState().documents.find((item) => item.id === docId);
    if (!currentDoc) return;
    const updatedContent = replaceFirstH1(currentDoc.content, currentDoc.title);
    if (updatedContent !== currentDoc.content) {
      queueMicrotask(() => {
        updateDocument(currentDoc.id, { content: updatedContent });
      });
    }
  }, [docId, updateDocument]);

  // 2. CTRL+S / CMD+S 手动保存版本快捷键拦截
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (docId) {
          createManualVersion(docId)
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
  }, [docId, createManualVersion]);

  // If document doesn't exist, show error and option to redirect
  if (!doc || !docId || !kbId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main">
        <div className="text-center">
          <h2 className="text-lg font-bold text-text-primary mb-2">文档不存在</h2>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-accent hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            返回开始页
          </button>
        </div>
      </div>
    );
  }

  // Format save time
  const saveTime = new Date(doc.updatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 2. 中间目录面板 */}
      <CatalogPanel />

      {/* 3. 右侧编辑器区域 */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-main relative">
        {/* 顶部栏 */}
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
                value={doc.title}
                onChange={(e) => {
                  const newTitle = e.target.value;
                  const updatedContent = replaceFirstH1(doc.content, newTitle);
                  console.log(
                    '[DocEdit input onChange] newTitle:',
                    newTitle,
                    'updatedContent:',
                    updatedContent,
                  );
                  updateDocument(doc.id, {
                    title: newTitle,
                    content: updatedContent,
                  });
                }}
                className="text-[15px] font-semibold text-text-primary bg-transparent hover:bg-gray-50 focus:bg-white border border-transparent focus:border-border-color rounded-lg px-2.5 py-1 outline-none transition-colors max-w-[280px] font-sans"
                placeholder="无标题文档"
              />
              <div className="flex items-center gap-3 text-xs shrink-0">
                <button
                  onClick={() => navigate(`/kb/${kbId}/doc/${docId}/history`)}
                  className="text-text-secondary hover:text-accent hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                  title="查看历史版本"
                >
                  <CloudUpload size={14} /> 已自动保存 {saveTime}
                </button>
                {/* 隐私模式 Tag */}
                <span
                  className="bg-emerald-50 text-success-color px-2.5 py-1 rounded-full font-medium flex items-center gap-1 border border-emerald-200"
                  title="当前模型请求已切断云端网络，仅在本地设备运行"
                >
                  <ShieldHalf size={12} /> 隐私模式
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-text-secondary">
            <button
              title="收藏"
              onClick={(e) => {
                if (docId && !isFavorited(docId)) {
                  addFavorite(docId);
                  setToastText('已收藏到「全部收藏」');
                  setTimeout(() => setToastText(null), 2500);
                }
                setFavBtnEl(e.currentTarget);
                setIsFavOpen((prev) => !prev);
              }}
              className={`cursor-pointer transition-colors flex hover:text-text-primary ${
                isFavorited(docId ?? '') ? 'text-yellow-400' : ''
              }`}
            >
              <Star
                size={16}
                className={isFavorited(docId ?? '') ? 'fill-yellow-400 text-yellow-400' : ''}
              />
            </button>
            <span
              title="分享"
              className="cursor-pointer hover:text-text-primary transition-colors flex"
            >
              <Share2 size={16} />
            </span>
            <button
              title="历史记录"
              onClick={() => navigate(`/kb/${kbId}/doc/${docId}/history`)}
              className="cursor-pointer hover:text-text-primary transition-colors flex bg-transparent border-none p-0 outline-none"
            >
              <History size={16} />
            </button>
            <span className="cursor-pointer hover:text-text-primary transition-colors flex">
              <MoreHorizontal size={16} />
            </span>
          </div>
        </header>

        {/* 工具栏 */}
        <Toolbar editor={editorInstance} />

        {/* 编辑内容区 */}
        <Editor />
      </main>

      {/* 4. 最右侧大纲面板 */}
      <OutlinePanel />

      {/* 收藏弹窗 */}
      {docId && isFavOpen && (
        <FavoritePopover
          docId={docId}
          isOpen={isFavOpen}
          onClose={() => {
            setIsFavOpen(false);
            setFavBtnEl(null);
          }}
          anchorEl={favBtnEl}
        />
      )}

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
