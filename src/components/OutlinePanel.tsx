import { useEditorStore } from '../store';
import { useParams } from 'react-router-dom';
import { getOutlineHeadings } from './Editor/outlineHeadings';

// h1 -> 无缩进；h2 -> 缩进 1 级；h3+ -> 缩进 2 级
const indentClass: Record<number, string> = {
  1: '',
  2: 'pl-3',
  3: 'pl-6',
  4: 'pl-6',
  5: 'pl-6',
  6: 'pl-6',
};

const textClass: Record<number, string> = {
  1: 'font-semibold text-text-primary text-[13px]',
  2: 'text-[12px] text-text-secondary',
  3: 'text-[11px] text-text-secondary',
};

export default function OutlinePanel() {
  const { docId } = useParams<{ docId: string }>();
  const headings = useEditorStore((state) => state.headings);
  const editor = useEditorStore((state) => state.editorInstance);
  const activeDocumentId = useEditorStore((state) => state.activeEditorDocumentId);

  const scrollToHeading = (index: number) => {
    if (!editor || editor.isDestroyed || activeDocumentId !== docId) return;
    const target = getOutlineHeadings(editor.state.doc)[index];
    if (!target) return;
    const element = editor.view.nodeDOM(target.pos);
    if (element instanceof HTMLElement && editor.view.dom.contains(element)) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <aside className="w-[200px] min-w-[200px] border-l border-border-color bg-bg-panel flex flex-col h-full shrink-0 select-none overflow-hidden">
      {/* 顶部固定大纲标题 */}
      <div className="p-5 pb-3 text-[13px] font-semibold text-text-primary shrink-0">大纲</div>

      {/* 独立可滚动的标题列表区 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-5">
        {headings.length === 0 ? (
          <p className="text-[12px] text-text-secondary leading-relaxed">
            暂无标题，在文档中使用标题格式即可显示大纲。
          </p>
        ) : (
          <ul className="list-none space-y-1">
            {headings.map((item, idx) => (
              <li key={`${item.pos}-${idx}`}>
                <button
                  type="button"
                  className={[
                    'w-full cursor-pointer truncate text-left leading-snug py-1 px-1.5 rounded transition-colors',
                    'hover:text-accent hover:bg-hover-bg focus-visible:outline-2 focus-visible:outline-accent',
                    indentClass[item.level] ?? 'pl-6',
                    textClass[item.level] ?? 'text-[11px] text-text-secondary',
                  ].join(' ')}
                  title={item.text}
                  onClick={() => scrollToHeading(idx)}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
