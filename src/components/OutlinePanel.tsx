export default function OutlinePanel() {
  return (
    <aside className="w-[200px] min-w-[200px] border-l border-border-color p-5 bg-bg-panel">
      <div className="text-[13px] font-semibold text-text-primary mb-4 flex justify-between items-center">
        <span>大纲</span>
      </div>
      <ul className="list-none text-xs text-text-secondary leading-loose">
        <li className="font-medium text-text-primary mt-2 cursor-pointer hover:text-accent transition-colors truncate">Vite 原理解析</li>
        <li className="cursor-pointer hover:text-text-primary transition-colors truncate">一、整体架构</li>
        <li className="text-accent font-medium pl-4 cursor-pointer truncate">二、依赖预构建</li>
        <li className="cursor-pointer hover:text-text-primary transition-colors pl-4 truncate">三、开发服务器</li>
        <li className="cursor-pointer hover:text-text-primary transition-colors pl-4 truncate">四、生产构建</li>
      </ul>
    </aside>
  );
}
