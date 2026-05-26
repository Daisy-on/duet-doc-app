import { Home, Sparkles, StickyNote, Star, Folder, Search } from 'lucide-react';
import { NavLink, useParams } from 'react-router-dom';
import { useKnowledgeBaseStore, MEMO_KB_ID } from '../store/knowledgeBaseStore';

export default function Sidebar() {
  const { kbId: activeKbId } = useParams<{ kbId?: string }>();
  const { knowledgeBases, setIsCatalogCollapsed } = useKnowledgeBaseStore();

  const visibleKBs = knowledgeBases.filter((kb) => kb.id !== MEMO_KB_ID);

  return (
    <aside className="w-[220px] min-w-[220px] bg-bg-sidebar border-r border-border-color flex flex-col p-5 h-full">
      {/* Brand & User Zone */}
      <div className="flex items-center gap-3 mb-6 cursor-pointer shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-200 to-pink-200 shadow-sm" />
        <div className="font-bold text-[16px] text-text-primary">DuetDoc</div>
      </div>

      {/* Search Box */}
      <div className="flex items-center justify-between bg-bg-main border border-transparent px-3 py-2 rounded-lg text-[13px] text-text-secondary mb-6 cursor-text hover:border-border-color transition-colors shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <Search size={14} />
          <span className="truncate w-[90px]">搜索知识库...</span>
        </div>
        <span className="bg-white px-1.5 py-0.5 rounded border border-border-color text-[11px] shadow-sm">⌘K</span>
      </div>

      {/* Nav Menu */}
      <ul className="list-none mb-6 space-y-1 shrink-0">
        <li>
          <NavLink to="/" end tabIndex={-1} className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-indigo-50 text-accent' : 'text-text-secondary hover:bg-hover-bg'}`}>
            <Home size={16} /> 开始
          </NavLink>
        </li>
        <li>
          <NavLink to="/ai-writing" tabIndex={-1} className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-indigo-50 text-accent' : 'text-text-secondary hover:bg-hover-bg'}`}>
            {({ isActive }) => (
              <>
                <Sparkles size={16} className={isActive ? 'text-accent' : ''} /> AI 写作
              </>
            )}
          </NavLink>
        </li>
        <li>
          <NavLink to="/memo" tabIndex={-1} className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-indigo-50 text-accent' : 'text-text-secondary hover:bg-hover-bg'}`}>
            <StickyNote size={16} /> 小记
          </NavLink>
        </li>
        <li>
          <NavLink to="/favorites" tabIndex={-1} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-text-secondary hover:bg-hover-bg transition-colors">
            <Star size={16} /> 收藏
          </NavLink>
        </li>
      </ul>

      {/* Doc Tree */}
      <div className="text-[12px] text-text-secondary mb-3 pl-3 font-semibold tracking-wide shrink-0">知识库列表</div>
      <div className="flex-1 overflow-y-auto -mx-2 px-2">
        <ul className="list-none text-[13px] text-text-secondary space-y-1">
          {visibleKBs.map((kb) => {
            const isActiveKb = activeKbId === kb.id;

            return (
              <li key={kb.id} className="space-y-0.5">
                <div
                  className={`flex items-center justify-between rounded-md transition-colors ${
                    isActiveKb ? 'bg-indigo-50/80' : 'hover:bg-hover-bg'
                  }`}
                >
                  <NavLink
                    to={`/kb/${kb.id}`}
                    onClick={() => {
                      setIsCatalogCollapsed(false);
                    }}
                    className={`flex items-center gap-2.5 truncate flex-1 px-3 py-2 min-w-0 ${
                      isActiveKb ? 'text-accent font-semibold' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Folder
                      size={14}
                      className="shrink-0 transition-colors"
                      style={{ color: kb.icon }}
                    />
                    <span className="truncate">{kb.name}</span>
                  </NavLink>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
