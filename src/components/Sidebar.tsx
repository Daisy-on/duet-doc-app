import { Home, Sparkles, StickyNote, Star, Folder, Search } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  return (
    <aside className="w-[220px] min-w-[220px] bg-bg-sidebar border-r border-border-color flex flex-col p-5">
      {/* Brand & User Zone */}
      <div className="flex items-center gap-3 mb-6 cursor-pointer">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-200 to-pink-200 shadow-sm" />
        <div className="font-bold text-[16px] text-text-primary">DuetDoc</div>
      </div>

      {/* Search Box */}
      <div className="flex items-center justify-between bg-bg-main border border-transparent px-3 py-2 rounded-lg text-[13px] text-text-secondary mb-6 cursor-text hover:border-border-color transition-colors shadow-sm">
        <div className="flex items-center gap-2">
          <Search size={14} />
          <span className="truncate w-[90px]">搜索知识库...</span>
        </div>
        <span className="bg-white px-1.5 py-0.5 rounded border border-border-color text-[11px] shadow-sm">⌘K</span>
      </div>

      {/* Nav Menu */}
      <ul className="list-none mb-6 space-y-1">
        <li>
          <NavLink to="/" end className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-indigo-50 text-accent' : 'text-text-secondary hover:bg-hover-bg'}`}>
            <Home size={16} /> 开始
          </NavLink>
        </li>
        <li>
          <NavLink to="/edit" className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-indigo-50 text-accent' : 'text-text-secondary hover:bg-hover-bg'}`}>
            {({ isActive }) => (
              <>
                <Sparkles size={16} className={isActive ? 'text-accent' : ''} /> AI 写作
              </>
            )}
          </NavLink>
        </li>
        <li>
          <NavLink to="/memo" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-text-secondary hover:bg-hover-bg transition-colors">
            <StickyNote size={16} /> 小记
          </NavLink>
        </li>
        <li>
          <NavLink to="/favorites" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-text-secondary hover:bg-hover-bg transition-colors">
            <Star size={16} /> 收藏
          </NavLink>
        </li>
      </ul>

      {/* Doc Tree */}
      <div className="text-[12px] text-text-secondary mb-3 pl-3 font-semibold tracking-wide">知识库列表</div>
      <ul className="list-none text-[13px] text-text-secondary space-y-1">
        <li className="px-3 py-2 rounded-md cursor-pointer flex items-center gap-2 hover:bg-hover-bg hover:text-text-primary transition-colors">
          <Folder size={14} className="text-blue-400" /> 核心产品规划
        </li>
        <li className="px-3 py-2 rounded-md cursor-pointer flex items-center gap-2 hover:bg-hover-bg hover:text-text-primary transition-colors">
          <Folder size={14} className="text-blue-400" /> 研发架构库
        </li>
        <li className="px-3 py-2 rounded-md cursor-pointer flex items-center gap-2 hover:bg-hover-bg hover:text-text-primary transition-colors">
          <Folder size={14} className="text-blue-400" /> 个人灵感收集
        </li>
      </ul>
    </aside>
  );
}
