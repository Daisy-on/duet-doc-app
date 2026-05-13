import CatalogPanel from '../components/CatalogPanel';
import OutlinePanel from '../components/OutlinePanel';
import { 
  CloudUpload, ShieldHalf, Star, Share2, History, MoreHorizontal,
  Undo2, Redo2, ChevronDown, Bold, Italic, Underline, Strikethrough,
  Link, Code, Image, Table, Sparkles, MoreVertical
} from 'lucide-react';

export default function Edit() {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 2. 中间目录面板 */}
      <CatalogPanel />

      {/* 3. 右侧编辑器区域 */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-main relative">
        {/* 顶部栏 */}
        <header className="h-[60px] border-b border-border-color flex justify-between items-center px-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-[15px] font-semibold text-text-primary">Vite 原理解析</div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-text-secondary flex items-center gap-1">
                <CloudUpload size={14} /> 已自动保存 10:42
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
        <div className="p-3 px-6 border-b border-border-color flex items-center gap-4 text-text-secondary text-sm shrink-0">
          <div className="flex items-center gap-3 border-r border-border-color pr-4">
            <Undo2 size={16} className="cursor-pointer hover:text-text-primary transition-colors" />
            <Redo2 size={16} className="cursor-pointer hover:text-text-primary transition-colors" />
          </div>
          <div className="flex items-center gap-3 border-r border-border-color pr-4">
            <span className="cursor-pointer hover:text-text-primary transition-colors flex items-center gap-1">正文 <ChevronDown size={14} /></span>
          </div>
          <div className="flex items-center gap-3 border-r border-border-color pr-4">
            <Bold size={16} className="cursor-pointer hover:text-text-primary transition-colors" />
            <Italic size={16} className="cursor-pointer hover:text-text-primary transition-colors" />
            <Underline size={16} className="cursor-pointer hover:text-text-primary transition-colors" />
            <Strikethrough size={16} className="cursor-pointer hover:text-text-primary transition-colors" />
          </div>
          <div className="flex items-center gap-3">
            <Link size={16} className="cursor-pointer hover:text-text-primary transition-colors" />
            <Code size={16} className="cursor-pointer hover:text-text-primary transition-colors" />
            <Image size={16} className="cursor-pointer hover:text-text-primary transition-colors" />
            <Table size={16} className="cursor-pointer hover:text-text-primary transition-colors" />
          </div>
        </div>

        {/* 编辑内容区 */}
        <div className="flex-1 px-16 py-10 overflow-y-auto relative">
          <h1 className="text-[32px] font-bold mb-6 text-text-primary">Vite 原理解析</h1>
          <p className="text-[15px] leading-relaxed text-gray-700 mb-4">Vite 是一种新型的前端构建工具，它利用浏览器原生 ES 模块导入的能力，提供了极快的冷启动和热更新体验。</p>
          
          <h2 className="text-[20px] font-semibold my-6 text-text-primary">一、整体架构</h2>
          
          <p className="text-[15px] leading-relaxed text-gray-700 mb-4">
            Vite 的核心思想是<span className="bg-selection-bg text-text-primary py-0.5 rounded-sm">将开发服务器作为 ESM 的载体</span>，在开发环境下直接返回原生 ES 模块，浏览器按需加载，从而跳过了打包这一耗时步骤。
          </p>

          {/* Floating Toolbar 悬浮润色窗 */}
          <div className="absolute top-[280px] left-[200px] bg-gray-800 text-white rounded-lg p-1.5 flex items-center gap-1 shadow-xl z-10">
            <div className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer flex items-center gap-1.5 text-indigo-200 hover:bg-gray-700 transition-colors">
              <Sparkles size={14} /> AI 润色
            </div>
            <div className="w-[1px] h-4 bg-gray-600 mx-1"></div>
            <div className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors">更正式</div>
            <div className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors">扩写</div>
            <div className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors">解释一下</div>
            <div className="px-2 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors"><MoreVertical size={14} /></div>
            
            {/* 三角箭头 */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-solid border-t-gray-800 border-t-[6px] border-x-transparent border-x-[6px] border-b-0"></div>
          </div>

          <h2 className="text-[20px] font-semibold my-6 text-text-primary">二、依赖预构建</h2>
          <p className="text-[15px] leading-relaxed text-gray-700 mb-4">
            Vite 使用 esbuild 对依赖进行预构建，
            <span className="text-text-ghost inline-block pointer-events-none">将 CommonJS 或 UMD 格式的依赖转换为 ESM 格式，缓存在 node_modules/.vite 中。
              <span className="inline-block px-1.5 py-0.5 ml-1.5 rounded bg-gray-100 border border-gray-300 text-[11px] text-gray-500 font-mono">Tab 采纳</span>
            </span>
          </p>
        </div>
      </main>

      {/* 4. 最右侧大纲面板 */}
      <OutlinePanel />
    </div>
  );
}
