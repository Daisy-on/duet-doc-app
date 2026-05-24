import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MemoCatalogPanel from '../components/MemoCatalogPanel';
import OutlinePanel from '../components/OutlinePanel';
import Editor from '../components/Editor';
import Toolbar from '../components/Toolbar';
import { useEditorStore } from '../store';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import { 
  CloudUpload, Star, Share2, History, MoreHorizontal, StickyNote
} from 'lucide-react';

// Escape HTML characters to safely insert into HTML string
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Replace the first <h1> tag's inner text while preserving any tag attributes
function replaceFirstH1(html: string, newTitle: string): string {
  const escapedTitle = escapeHtml(newTitle);
  const match = html.match(/<h1([^>]*)>([\s\S]*?)<\/h1>/);
  if (match) {
    return html.replace(/<h1([^>]*)>([\s\S]*?)<\/h1>/, `<h1$1>${escapedTitle}</h1>`);
  } else {
    return `<h1>${escapedTitle}</h1>` + html;
  }
}

export default function MemoEdit() {
  const { memoId } = useParams<{ memoId: string }>();
  const navigate = useNavigate();
  
  const { documents, updateDocument, isCatalogCollapsed, setIsCatalogCollapsed } = useKnowledgeBaseStore();
  (window as any).useKnowledgeBaseStore = useKnowledgeBaseStore;
  const memo = documents.find((d) => d.id === memoId);

  const editorInstance = useEditorStore((state) => state.editorInstance);

  // Sync first <h1> inside the content when memoId changes
  useEffect(() => {
    if (memo) {
      const updatedContent = replaceFirstH1(memo.content, memo.title);
      if (updatedContent !== memo.content) {
        updateDocument(memo.id, { content: updatedContent });
      }
    }
  }, [memoId]);

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

  const saveTime = new Date(memo.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Toggle Collapse Button for Sidebar */}
      {isCatalogCollapsed && (
        <button
          onClick={() => setIsCatalogCollapsed(false)}
          className="absolute left-4 top-[18px] z-20 bg-white border border-border-color shadow-sm hover:text-accent p-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer text-text-secondary"
          title="展开小记树"
        >
          <StickyNote size={14} />
        </button>
      )}

      {/* Left panel for list of Memos */}
      <MemoCatalogPanel />

      {/* Right panel editor workspace */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-main relative">
        {/* Header */}
        <header className="h-[60px] border-b border-border-color flex justify-between items-center px-6 shrink-0 bg-white">
          <div className={`flex items-center gap-4 transition-all duration-150 ${isCatalogCollapsed ? 'pl-10' : 'pl-0'}`}>
            <input
              type="text"
              value={memo.title}
              onChange={(e) => {
                const newTitle = e.target.value;
                const updatedContent = replaceFirstH1(memo.content, newTitle);
                updateDocument(memo.id, { 
                  title: newTitle, 
                  content: updatedContent 
                });
              }}
              className="text-[15px] font-semibold text-text-primary bg-transparent hover:bg-gray-50 focus:bg-white border border-transparent focus:border-border-color rounded-lg px-2.5 py-1 outline-none transition-colors max-w-[280px] font-sans"
              placeholder="无标题小记"
            />
            <div className="flex items-center gap-3 text-xs">
              <span className="text-text-secondary flex items-center gap-1">
                <CloudUpload size={14} /> 已保存 {saveTime}
              </span>
              <span className="bg-pink-50 text-pink-600 px-2.5 py-1 rounded-full font-medium flex items-center gap-1 border border-pink-200">
                <StickyNote size={12} /> 独立小记
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-text-secondary">
            <span title="收藏" className="cursor-pointer hover:text-text-primary transition-colors flex"><Star size={16} /></span>
            <span title="分享" className="cursor-pointer hover:text-text-primary transition-colors flex"><Share2 size={16} /></span>
            <span title="历史记录" className="cursor-pointer hover:text-text-primary transition-colors flex"><History size={16} /></span>
            <span className="cursor-pointer hover:text-text-primary transition-colors flex"><MoreHorizontal size={16} /></span>
          </div>
        </header>

        {/* Toolbar */}
        <Toolbar editor={editorInstance} />

        {/* Editor Area */}
        <Editor />
      </main>

      {/* Right Outline panel */}
      <OutlinePanel />
    </div>
  );
}
