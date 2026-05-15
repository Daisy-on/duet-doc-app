import { useEditorStore } from '../store'
import type { HeadingItem } from '../store'

// h1 -> 无缩进；h2 -> 缩进 1 级；h3+ -> 缩进 2 级
const indentClass: Record<number, string> = {
  1: '',
  2: 'pl-3',
  3: 'pl-6',
  4: 'pl-6',
  5: 'pl-6',
  6: 'pl-6',
}

const textClass: Record<number, string> = {
  1: 'font-semibold text-text-primary text-[13px]',
  2: 'text-[12px] text-text-secondary',
  3: 'text-[11px] text-text-secondary',
}

function scrollToHeading(item: HeadingItem) {
  const el = document.querySelector(`[data-heading-id="${item.id}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function OutlinePanel() {
  const headings = useEditorStore((state) => state.headings)

  return (
    <aside className="w-[200px] min-w-[200px] border-l border-border-color p-5 bg-bg-panel">
      <div className="text-[13px] font-semibold text-text-primary mb-4">
        大纲
      </div>

      {headings.length === 0 ? (
        <p className="text-[12px] text-text-secondary leading-relaxed">
          暂无标题，在文档中使用标题格式即可显示大纲。
        </p>
      ) : (
        <ul className="list-none space-y-1">
          {headings.map((item, idx) => (
            <li
              key={`${item.id}-${idx}`}
              className={[
                'cursor-pointer truncate leading-snug py-0.5 rounded transition-colors',
                'hover:text-accent',
                indentClass[item.level] ?? 'pl-6',
                textClass[item.level] ?? 'text-[11px] text-text-secondary',
              ].join(' ')}
              title={item.text}
              onClick={() => scrollToHeading(item)}
            >
              {item.text}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
