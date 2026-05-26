import { useNavigate } from 'react-router-dom';
import { StickyNote, Plus, PanelLeft } from 'lucide-react';
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
      <main className="flex-1 flex flex-col bg-bg-main relative">
        {/* Top Header */}
        <header className="h-[60px] flex items-center px-6 shrink-0 bg-transparent">
          <button
            onClick={() => setIsCatalogCollapsed(!isCatalogCollapsed)}
            className="text-text-secondary hover:text-text-primary hover:bg-hover-bg p-1.5 rounded-lg border border-border-color/60 bg-white shadow-sm flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title={isCatalogCollapsed ? "展开" : "折叠"}
          >
            <PanelLeft size={16} />
          </button>
        </header>

        {/* Welcome content */}
        <div className="flex-1 flex flex-col justify-center items-center">
          <div className="text-center max-w-sm px-6 -mt-[60px]">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-pink-400 to-indigo-400 flex items-center justify-center text-white shadow-lg mx-auto mb-6 hover:rotate-12 transition-transform duration-300">
              <StickyNote size={30} />
            </div>
            
            <h3 className="text-lg font-bold text-text-primary mb-2 flex items-center justify-center gap-1.5">
              我的轻量小记
            </h3>
            
            <p className="text-xs text-text-secondary mb-6 leading-relaxed">
              小记是一个极简的速记本，适合用来放置代办清单、日常碎碎念和临时灵感。它不属于任何分组，并且可以随时一键打包移动 to 具体知识库中。
            </p>

            <button
              onClick={handleCreateMemo}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md hover:shadow-indigo-500/10 transition-all cursor-pointer hover:-translate-y-0.5"
            >
              <Plus size={14} />
              <span>新建第一条小记</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
