import { useNavigate } from 'react-router-dom';
import { StickyNote, Plus } from 'lucide-react';
import MemoCatalogPanel from '../components/MemoCatalogPanel';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';

export default function MemoHome() {
  const navigate = useNavigate();
  const { createMemo, isCatalogCollapsed, setIsCatalogCollapsed } = useKnowledgeBaseStore();

  const handleCreateMemo = () => {
    const newId = createMemo('未命名小记');
    navigate(`/memo/${newId}`);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel for list of Memos */}
      <MemoCatalogPanel />

      {/* Right panel empty/welcome state */}
      <main className="flex-1 flex flex-col justify-center items-center bg-bg-main relative">
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

        <div className="text-center max-w-sm px-6">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-pink-400 to-indigo-400 flex items-center justify-center text-white shadow-lg mx-auto mb-6 hover:rotate-12 transition-transform duration-300">
            <StickyNote size={30} />
          </div>
          
          <h3 className="text-lg font-bold text-text-primary mb-2 flex items-center justify-center gap-1.5">
            我的轻量小记
          </h3>
          
          <p className="text-xs text-text-secondary mb-6 leading-relaxed">
            小记是一个极简的速记本，适合用来放置代办清单、日常碎碎念和临时灵感。它不属于任何分组，并且可以随时一键打包移动到具体知识库中。
          </p>

          <button
            onClick={handleCreateMemo}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md hover:shadow-indigo-500/10 transition-all cursor-pointer hover:-translate-y-0.5"
          >
            <Plus size={14} />
            <span>新建第一条小记</span>
          </button>
        </div>
      </main>
    </div>
  );
}
