import { ChevronLeft, Plus, Search, ChevronDown, ChevronRight, FileText } from 'lucide-react';

export default function CatalogPanel() {
  return (
    <aside className="w-[220px] min-w-[220px] bg-bg-panel border-r border-border-color flex flex-col">
      <div className="p-5 pb-3 flex justify-between items-center">
        <div className="text-[14px] font-semibold text-text-primary flex items-center gap-1.5 cursor-pointer">
          <ChevronLeft size={16} /> 大前端
        </div>
        <div className="text-text-secondary cursor-pointer hover:text-text-primary transition-colors p-1">
          <Plus size={16} />
        </div>
      </div>
      
      <div className="mx-4 mb-3 px-2.5 py-1.5 bg-white border border-border-color rounded-md text-xs text-text-secondary flex items-center gap-1.5 shadow-sm">
        <Search size={14} /> 搜索当前知识库...
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="text-xs font-semibold text-text-primary p-2 mt-2 flex items-center gap-1.5">
          <ChevronDown size={14} /> 01. 前端基础
        </div>
        <div className="text-[13px] text-text-secondary py-1.5 px-2 pr-2 pl-6 rounded-md cursor-pointer flex items-center gap-2 hover:bg-hover-bg transition-colors">
          <FileText size={14} /> HTML 语义化总结
        </div>
        <div className="text-[13px] text-text-secondary py-1.5 px-2 pr-2 pl-6 rounded-md cursor-pointer flex items-center gap-2 hover:bg-hover-bg transition-colors">
          <FileText size={14} /> CSS 布局指南
        </div>
        
        <div className="text-xs font-semibold text-text-primary p-2 mt-2 flex items-center gap-1.5">
          <ChevronDown size={14} /> 02. 工程化
        </div>
        <div className="text-[13px] text-accent font-medium bg-white shadow-sm py-1.5 px-2 pr-2 pl-6 rounded-md cursor-pointer flex items-center gap-2">
          <FileText size={14} /> Vite 原理解析
        </div>
        <div className="text-[13px] text-text-secondary py-1.5 px-2 pr-2 pl-6 rounded-md cursor-pointer flex items-center gap-2 hover:bg-hover-bg transition-colors">
          <FileText size={14} /> Webpack 与 Vite 对比
        </div>
        
        <div className="text-xs font-semibold text-text-primary p-2 mt-2 flex items-center gap-1.5">
          <ChevronRight size={14} /> 03. 性能优化
        </div>
      </div>
    </aside>
  );
}
