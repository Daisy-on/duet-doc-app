import CatalogPanel from '../components/CatalogPanel';
import OutlinePanel from '../components/OutlinePanel';
import Editor from '../components/Editor';
import { 
  CloudUpload, ShieldHalf, Star, Share2, History, MoreHorizontal,
  Undo2, Redo2, ChevronDown, Bold, Italic, Underline, Strikethrough,
  Link, Code, Image, Table
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
        <Editor />
      </main>

      {/* 4. 最右侧大纲面板 */}
      <OutlinePanel />
    </div>
  );
}
