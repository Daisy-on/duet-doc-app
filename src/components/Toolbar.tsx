import { useState, useRef, useEffect, useCallback } from 'react'
import type { Editor } from '@tiptap/core'
import {
  Undo2, Redo2, RemoveFormatting, PaintRoller,
  Bold, Italic, Underline, Strikethrough,
  Superscript, Subscript, Code,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link, CodeSquare, Table,
  ChevronDown, Type,
} from 'lucide-react'

// ─── 通用工具按钮 ─────────────────────────────────────────────
interface ToolBtnProps {
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}
function ToolBtn({ title, active, disabled, onClick, children }: ToolBtnProps) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex items-center justify-center w-7 h-7 rounded transition-colors text-[14px]',
        'hover:bg-gray-100 hover:text-text-primary',
        active
          ? 'bg-indigo-50 text-indigo-600 font-semibold'
          : 'text-text-secondary',
        disabled ? 'opacity-30 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ─── 分隔符 ────────────────────────────────────────────────────
function Sep() {
  return <div className="w-px h-4 bg-border-color mx-1 shrink-0" />
}

// ─── 下拉容器 Hook ─────────────────────────────────────────────
function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return { open, setOpen, ref }
}

// ─── 下拉菜单项 ────────────────────────────────────────────────
interface DropItemProps {
  label: string
  active?: boolean
  onClick: () => void
  className?: string
}
function DropItem({ label, active, onClick, className = '' }: DropItemProps) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className={[
        'w-full text-left px-3 py-1.5 text-[13px] rounded hover:bg-gray-100 transition-colors',
        active ? 'text-indigo-600 font-medium bg-indigo-50' : 'text-text-primary',
        className,
      ].join(' ')}
    >
      {label}
    </button>
  )
}

// ─── 正文 / 标题 选择下拉 ─────────────────────────────────────
function BlockTypeDropdown({ editor }: { editor: Editor }) {
  const { open, setOpen, ref } = useDropdown()

  const currentLabel = (() => {
    if (editor.isActive('heading', { level: 1 })) return 'H1 标题'
    if (editor.isActive('heading', { level: 2 })) return 'H2 标题'
    if (editor.isActive('heading', { level: 3 })) return 'H3 标题'
    if (editor.isActive('heading', { level: 4 })) return 'H4 标题'
    if (editor.isActive('heading', { level: 5 })) return 'H5 标题'
    if (editor.isActive('heading', { level: 6 })) return 'H6 标题'
    return '正文'
  })()

  const items = [
    { label: '正文', action: () => editor.chain().focus().setParagraph().run() },
    { label: 'H1 标题', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), style: 'text-[18px] font-bold' },
    { label: 'H2 标题', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), style: 'text-[16px] font-semibold' },
    { label: 'H3 标题', action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), style: 'text-[14px] font-semibold' },
    { label: 'H4 标题', action: () => editor.chain().focus().toggleHeading({ level: 4 }).run() },
    { label: 'H5 标题', action: () => editor.chain().focus().toggleHeading({ level: 5 }).run() },
    { label: 'H6 标题', action: () => editor.chain().focus().toggleHeading({ level: 6 }).run() },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        title="段落样式"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 h-7 rounded text-[13px] font-medium text-text-primary hover:bg-gray-100 transition-colors cursor-pointer whitespace-nowrap"
      >
        <Type size={13} className="text-text-secondary" />
        {currentLabel}
        <ChevronDown size={12} className="text-text-secondary" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-32 bg-white border border-border-color rounded-lg shadow-lg z-50 py-1">
          {items.map((it) => (
            <DropItem
              key={it.label}
              label={it.label}
              className={it.style}
              active={currentLabel === it.label}
              onClick={() => { it.action(); setOpen(false) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 更多文本样式下拉 ─────────────────────────────────────────
function TextStyleDropdown({ editor }: { editor: Editor }) {
  const { open, setOpen, ref } = useDropdown()

  const items = [
    {
      label: '上标',
      active: editor.isActive('superscript'),
      action: () => editor.chain().focus().toggleSuperscript().run(),
      icon: <Superscript size={13} />,
    },
    {
      label: '下标',
      active: editor.isActive('subscript'),
      action: () => editor.chain().focus().toggleSubscript().run(),
      icon: <Subscript size={13} />,
    },
    {
      label: '行内代码',
      active: editor.isActive('code'),
      action: () => editor.chain().focus().toggleCode().run(),
      icon: <Code size={13} />,
    },
  ]

  return (
    <div className="relative" ref={ref}>
      <ToolBtn title="更多文本样式" active={open} onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-0.5">A<ChevronDown size={10} /></span>
      </ToolBtn>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-32 bg-white border border-border-color rounded-lg shadow-lg z-50 py-1">
          {items.map((it) => (
            <button
              key={it.label}
              onMouseDown={(e) => { e.preventDefault(); it.action(); setOpen(false) }}
              className={[
                'w-full text-left px-3 py-1.5 text-[13px] rounded hover:bg-gray-100 transition-colors flex items-center gap-2',
                it.active ? 'text-indigo-600 font-medium bg-indigo-50' : 'text-text-primary',
              ].join(' ')}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 对齐方式下拉 ─────────────────────────────────────────────
function AlignDropdown({ editor }: { editor: Editor }) {
  const { open, setOpen, ref } = useDropdown()

  const alignments = [
    { label: '左对齐', value: 'left', icon: <AlignLeft size={14} /> },
    { label: '居中对齐', value: 'center', icon: <AlignCenter size={14} /> },
    { label: '右对齐', value: 'right', icon: <AlignRight size={14} /> },
    { label: '两端对齐', value: 'justify', icon: <AlignJustify size={14} /> },
  ]

  const activeIcon = alignments.find((a) => editor.isActive({ textAlign: a.value }))?.icon
    ?? <AlignLeft size={14} />

  return (
    <div className="relative" ref={ref}>
      <button
        title="对齐方式"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-0.5 w-8 h-7 rounded text-text-secondary hover:bg-gray-100 hover:text-text-primary transition-colors cursor-pointer justify-center"
      >
        {activeIcon}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-32 bg-white border border-border-color rounded-lg shadow-lg z-50 py-1">
          {alignments.map((a) => (
            <button
              key={a.value}
              onMouseDown={(e) => {
                e.preventDefault()
                editor.chain().focus().setTextAlign(a.value).run()
                setOpen(false)
              }}
              className={[
                'w-full text-left px-3 py-1.5 text-[13px] rounded hover:bg-gray-100 transition-colors flex items-center gap-2',
                editor.isActive({ textAlign: a.value })
                  ? 'text-indigo-600 font-medium bg-indigo-50'
                  : 'text-text-primary',
              ].join(' ')}
            >
              {a.icon}{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 主工具栏 ─────────────────────────────────────────────────
interface ToolbarProps {
  editor: Editor | null
}

export default function Toolbar({ editor }: ToolbarProps) {
  const [formatPainterActive, setFormatPainterActive] = useState(false)

  const handleFormatPainter = useCallback(() => {
    // 格式刷：暂记激活状态，实际复制逻辑后续对接
    setFormatPainterActive((v) => !v)
  }, [])

  if (!editor) return null

  return (
    <div className="px-6 py-2 border-b border-border-color flex items-center gap-1 text-text-secondary shrink-0 flex-wrap">

      {/* 1. 撤销 / 重做 */}
      <ToolBtn title="撤销 (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 size={15} />
      </ToolBtn>
      <ToolBtn title="重做 (Ctrl+Y)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 size={15} />
      </ToolBtn>

      <Sep />

      {/* 2. 清除格式 / 格式刷 */}
      <ToolBtn title="清除格式" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
        <RemoveFormatting size={15} />
      </ToolBtn>
      <ToolBtn title="格式刷" active={formatPainterActive} onClick={handleFormatPainter}>
        <PaintRoller size={15} />
      </ToolBtn>

      <Sep />

      {/* 3. 段落 / 标题 */}
      <BlockTypeDropdown editor={editor} />

      <Sep />

      {/* 4. 基础文字格式 */}
      <ToolBtn title="粗体 (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={15} />
      </ToolBtn>
      <ToolBtn title="斜体 (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={15} />
      </ToolBtn>
      <ToolBtn title="下划线 (Ctrl+U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline size={15} />
      </ToolBtn>
      <ToolBtn title="删除线" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough size={15} />
      </ToolBtn>

      {/* 5. 更多文本样式 */}
      <TextStyleDropdown editor={editor} />

      <Sep />

      {/* 6. 对齐方式 */}
      <AlignDropdown editor={editor} />

      <Sep />

      {/* 7. 列表 */}
      <ToolBtn title="无序列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={15} />
      </ToolBtn>
      <ToolBtn title="有序列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={15} />
      </ToolBtn>

      <Sep />

      {/* 8. 插入类 */}
      <ToolBtn title="插入链接" onClick={() => {
        const url = window.prompt('输入链接地址')
        if (url) editor.chain().focus().setLink({ href: url }).run()
      }}>
        <Link size={15} />
      </ToolBtn>
      <ToolBtn title="插入代码块" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <CodeSquare size={15} />
      </ToolBtn>
      <ToolBtn title="插入表格" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <Table size={15} />
      </ToolBtn>
    </div>
  )
}
