import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CatalogPanel from '../components/CatalogPanel';
import OutlinePanel from '../components/OutlinePanel';
import Editor from '../components/Editor';
import Toolbar from '../components/Toolbar';
import { useEditorStore } from '../store';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import { 
  CloudUpload, ShieldHalf, Star, Share2, History, MoreHorizontal,
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

export default function DocEdit() {
  const { kbId, docId } = useParams<{ kbId: string; docId: string }>();
  const navigate = useNavigate();
  
  const { documents, updateDocument } = useKnowledgeBaseStore();
  (window as any).useKnowledgeBaseStore = useKnowledgeBaseStore;
  (window as any).useEditorStore = useEditorStore;
  const doc = documents.find((d) => d.id === docId);

  const editorInstance = useEditorStore((state) => state.editorInstance);

  // 1. When switching documents (docId changes), ensure the first <h1> inside the content matches the document's external title
  useEffect(() => {
    console.log('[DocEdit] docId changed:', docId, 'doc:', doc);
    if (doc) {
      const updatedContent = replaceFirstH1(doc.content, doc.title);
      console.log('[DocEdit] updatedContent on load:', updatedContent);
      if (updatedContent !== doc.content) {
        console.log('[DocEdit] Mismatch found on load, updating doc store');
        updateDocument(doc.id, { content: updatedContent });
      }
    }
  }, [docId]);

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
  const saveTime = new Date(doc.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 2. 中间目录面板 */}
      <CatalogPanel />

      {/* 3. 右侧编辑器区域 */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-main relative">
        {/* 顶部栏 */}
        <header className="h-[60px] border-b border-border-color flex justify-between items-center px-6 shrink-0 bg-white">
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={doc.title}
              onChange={(e) => {
                const newTitle = e.target.value;
                const updatedContent = replaceFirstH1(doc.content, newTitle);
                console.log('[DocEdit input onChange] newTitle:', newTitle, 'updatedContent:', updatedContent);
                updateDocument(doc.id, { 
                  title: newTitle, 
                  content: updatedContent 
                });
              }}
              className="text-[15px] font-semibold text-text-primary bg-transparent hover:bg-gray-50 focus:bg-white border border-transparent focus:border-border-color rounded-lg px-2.5 py-1 outline-none transition-colors max-w-[280px] font-sans"
              placeholder="无标题文档"
            />
            <div className="flex items-center gap-3 text-xs">
              <span className="text-text-secondary flex items-center gap-1">
                <CloudUpload size={14} /> 已自动保存 {saveTime}
              </span>
              {/* 隐私模式 Tag */}
              <span className="bg-emerald-50 text-success-color px-2.5 py-1 rounded-full font-medium flex items-center gap-1 border border-emerald-200" title="当前模型请求已切断云端网络，仅在本地设备运行">
                <ShieldHalf size={12} /> 隐私模式
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

        {/* 工具栏 */}
        <Toolbar editor={editorInstance} />

        {/* 编辑内容区 */}
        <Editor />
      </main>

      {/* 4. 最右侧大纲面板 */}
      <OutlinePanel />
    </div>
  );
}
