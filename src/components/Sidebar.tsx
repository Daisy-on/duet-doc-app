import { Home, Sparkles, StickyNote, Star, Folder, Search, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { NavLink, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';

export default function Sidebar() {
  const { kbId: activeKbId } = useParams<{ kbId?: string }>();
  const { knowledgeBases, groups, documents } = useKnowledgeBaseStore();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

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
          <NavLink to="/kb/kb-frontend/doc/doc-vite-analysis" tabIndex={-1} className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-indigo-50 text-accent' : 'text-text-secondary hover:bg-hover-bg'}`}>
            {({ isActive }) => (
              <>
                <Sparkles size={16} className={isActive ? 'text-accent' : ''} /> AI 写作
              </>
            )}
          </NavLink>
        </li>
        <li>
          <NavLink to="/memo" tabIndex={-1} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-text-secondary hover:bg-hover-bg transition-colors">
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
          {knowledgeBases.map((kb) => {
            const isActiveKb = activeKbId === kb.id;
            const kbGroups = groups.filter((g) => g.kbId === kb.id).sort((a, b) => a.order - b.order);
            const kbDocs = documents.filter((d) => d.kbId === kb.id);
            const rootDocs = kbDocs.filter((d) => d.groupId === null);

            return (
              <li key={kb.id} className="space-y-0.5">
                <NavLink
                  to={`/kb/${kb.id}`}
                  className={({ isActive }) => 
                    `px-3 py-2 rounded-md cursor-pointer flex items-center justify-between hover:bg-hover-bg hover:text-text-primary transition-colors ${
                      isActive ? 'bg-indigo-50/80 text-accent font-semibold' : 'text-text-secondary'
                    }`
                  }
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder 
                      size={14} 
                      className="shrink-0 transition-colors"
                      style={{ color: kb.icon }}
                    />
                    <span className="truncate">{kb.name}</span>
                  </div>
                  {isActiveKb && kbDocs.length > 0 && (
                    <ChevronDown size={12} className="text-text-secondary" />
                  )}
                </NavLink>

                {/* Sub-tree for the active KB */}
                {isActiveKb && (
                  <ul className="ml-5 pl-2.5 border-l border-gray-200/60 space-y-1 py-1">
                    {/* Groups */}
                    {kbGroups.map((group) => {
                      const groupDocs = kbDocs.filter((d) => d.groupId === group.id);
                      const isExpanded = !collapsedGroups[group.id];

                      return (
                        <li key={group.id} className="space-y-0.5">
                          <div 
                            onClick={(e) => toggleGroup(group.id, e)}
                            className="px-2 py-1 rounded hover:bg-hover-bg hover:text-text-primary transition-colors flex items-center justify-between cursor-pointer text-xs font-semibold text-text-primary select-none"
                          >
                            <span className="truncate text-text-secondary">{group.name}</span>
                            {groupDocs.length > 0 && (
                              isExpanded ? <ChevronDown size={11} className="text-text-secondary shrink-0" /> : <ChevronRight size={11} className="text-text-secondary shrink-0" />
                            )}
                          </div>
                          {isExpanded && groupDocs.length > 0 && (
                            <ul className="space-y-0.5 ml-1">
                              {groupDocs.map((doc) => (
                                <li key={doc.id}>
                                  <NavLink
                                    to={`/kb/${kb.id}/doc/${doc.id}`}
                                    className={({ isActive }) => 
                                      `px-2.5 py-1 rounded text-[12px] hover:bg-hover-bg hover:text-text-primary transition-all flex items-center gap-1.5 ${
                                        isActive ? 'text-accent font-semibold bg-indigo-50/55 shadow-sm' : 'text-text-secondary'
                                      }`
                                    }
                                  >
                                    <FileText size={11} className="shrink-0 text-indigo-400" />
                                    <span className="truncate">{doc.title}</span>
                                  </NavLink>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}

                    {/* Root documents */}
                    {rootDocs.map((doc) => (
                      <li key={doc.id}>
                        <NavLink
                          to={`/kb/${kb.id}/doc/${doc.id}`}
                          className={({ isActive }) => 
                            `px-2 py-1 rounded text-[12px] hover:bg-hover-bg hover:text-text-primary transition-all flex items-center gap-1.5 ${
                              isActive ? 'text-accent font-semibold bg-indigo-50/55 shadow-sm' : 'text-text-secondary'
                            }`
                          }
                        >
                          <FileText size={11} className="shrink-0 text-indigo-400" />
                          <span className="truncate">{doc.title}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
