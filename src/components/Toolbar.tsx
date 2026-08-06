import { useState, useRef, useEffect, useCallback } from 'react'
import { getMarkRange, type Editor } from '@tiptap/core'
import { normalizeUrl } from '../utils/urlUtils'
import { useParams } from 'react-router-dom'
import { assetRepository } from '../assets/assetRepository'
import {
  Undo2, Redo2, RemoveFormatting, PaintRoller,
  Bold, Italic, Underline, Strikethrough,
  Superscript, Subscript, Code,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link, CodeSquare, Table,
  ChevronDown, Type, Trash2, Columns, Rows, Image as ImageIcon
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
      tabIndex={-1}
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
      tabIndex={-1}
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
        tabIndex={-1}
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
              tabIndex={-1}
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
        tabIndex={-1}
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
              tabIndex={-1}
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

// ─── 表格操作下拉 ─────────────────────────────────────────────
function TableActionsDropdown({ editor }: { editor: Editor }) {
  const { open, setOpen, ref } = useDropdown()

  if (!editor.isActive('table')) return null

  const items = [
    { label: '在上方插入行', action: () => editor.chain().focus().addRowBefore().run(), icon: <Rows size={13} /> },
    { label: '在下方插入行', action: () => editor.chain().focus().addRowAfter().run(), icon: <Rows size={13} /> },
    { label: '删除该行', action: () => editor.chain().focus().deleteRow().run(), icon: <Trash2 size={13} className="text-red-500" /> },
    { label: '在左侧插入列', action: () => editor.chain().focus().addColumnBefore().run(), icon: <Columns size={13} /> },
    { label: '在右侧插入列', action: () => editor.chain().focus().addColumnAfter().run(), icon: <Columns size={13} /> },
    { label: '删除该列', action: () => editor.chain().focus().deleteColumn().run(), icon: <Trash2 size={13} className="text-red-500" /> },
    { label: '删除表格', action: () => editor.chain().focus().deleteTable().run(), icon: <Trash2 size={13} className="text-red-500" /> },
  ]

  return (
    <>
      <Sep />
      <div className="relative" ref={ref}>
        <button
          title="表格操作"
          onClick={() => setOpen((o) => !o)}
          tabIndex={-1}
          className="flex items-center gap-1 px-2 h-7 rounded text-[13px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          表格操作 <ChevronDown size={12} />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 w-36 bg-white border border-border-color rounded-lg shadow-lg z-50 py-1">
            {items.map((it) => (
              <button
                key={it.label}
                tabIndex={-1}
                onMouseDown={(e) => { e.preventDefault(); it.action(); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-[13px] rounded hover:bg-gray-100 transition-colors flex items-center gap-2 text-text-primary"
              >
                {it.icon}{it.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ─── 插入图片按钮 ─────────────────────────────────────────────
function ImageUploadBtn({ editor }: { editor: Editor }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { docId, memoId } = useParams<{ docId?: string; memoId?: string }>()
  const currentDocId = docId || memoId

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    if (!currentDocId) {
      alert('无法识别当前文档 ID，插入图片失败')
      return
    }

    if (editor.state.selection.$from.parent.type.name === 'heading') {
      alert('文档标题处无法插入图片')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const file = files[0]
    try {
      const asset = await assetRepository.saveAsset(currentDocId, file)
      editor.chain().focus().insertContent({
        type: 'image',
        attrs: {
          assetId: asset.id,
          alt: file.name,
        },
      }).run()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '插入图片失败')
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
      <ToolBtn
        title="插入图片"
        onClick={() => {
          if (editor.state.selection.$from.parent.type.name === 'heading') {
            alert('文档标题处无法插入图片')
            return
          }
          fileInputRef.current?.click()
        }}
      >
        <ImageIcon size={15} />
      </ToolBtn>
    </>
  )
}

// ─── 链接插入弹出框 ─────────────────────────────────────────────
function LinkPopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [url, setUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const handleOpen = useCallback(() => {
    // 聚焦编辑器，确保我们能拿到正确的选区
    editor.commands.focus()
    
    // 获取之前的链接（如果有的话）
    const previousUrl = editor.getAttributes('link').href || ''
    setUrl(previousUrl)
    
    const { from } = editor.state.selection
    const coords = editor.view.coordsAtPos(from)
    
    const popoverWidth = 288 // Tailwind w-72 = 18rem = 288px
    
    // 弹窗的左边界直接对齐 Prosemirror 内部计算的 DOM 光标位置
    let leftPos = coords.left
    
    // 只要不溢出整个浏览器窗口即可
    const minLeft = 16
    const maxLeft = window.innerWidth - popoverWidth - 16
    leftPos = Math.max(minLeft, Math.min(leftPos, maxLeft))
    
    // 悬浮在光标/链接上一行：减去弹窗的高度（约 56px）
    setPos({ top: coords.top - 58, left: leftPos }) 
    setOpen(true)
    
    setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
  }, [editor])

  const handleSubmit = () => {
    const normalized = normalizeUrl(url)
    if (normalized) {
      const isEditingLink = editor.isActive('link')
      if (isEditingLink) {
        // 使用 getMarkRange 精确获取旧链接的边界范围
        const linkMarkType = editor.schema.marks.link
        let from = editor.state.selection.from
        let to = editor.state.selection.to
        
        if (linkMarkType) {
          const range = getMarkRange(editor.state.selection.$from, linkMarkType) || 
                        getMarkRange(editor.state.selection.$to, linkMarkType)
          if (range) {
            from = range.from
            to = range.to
          }
        }
        
        const linkText = editor.state.doc.textBetween(from, to, ' ').trim()
        const previousHref = editor.getAttributes('link').href || ''
        
        // 辅助对比函数：去除协议头 (http/https/www) 比较
        const clean = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
        
        const isUrlText = !linkText || 
                          clean(linkText) === clean(previousHref) || 
                          clean(linkText) === clean(url) || 
                          /^https?:\/\//i.test(linkText)
        
        if (isUrlText) {
          // 如果旧显示文本本来就是网址，强行删除旧范围，并在该位置插入新文本，防止发生重复追加 (prepend/append) 的 Bug
          editor.chain().focus()
            .deleteRange({ from, to })
            .insertContentAt(from, {
              type: 'text',
              text: url.trim(),
              marks: [
                {
                  type: 'link',
                  attrs: { href: normalized },
                },
              ],
            })
            .run()
        } else {
          // 如果旧显示文本是自定义词条，仅更新其 href 属性
          editor.chain().focus()
            .setTextSelection({ from, to })
            .setLink({ href: normalized })
            .run()
        }
      } else {
        const { from, to } = editor.state.selection
        if (from === to) {
          // 选区为空时：插入带有 link mark 的新文本
          editor.chain().focus()
            .insertContent({
              type: 'text',
              text: url.trim(),
              marks: [
                {
                  type: 'link',
                  attrs: { href: normalized },
                },
              ],
            })
            .run()
        } else {
          // 有选中文本时：对选中的文字应用链接属性
          editor.chain().focus()
            .setLink({ href: normalized })
            .run()
        }
      }
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    }
    setOpen(false)
  }

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // 监听外部触发的编辑事件
  useEffect(() => {
    const onCustomEdit = () => {
      handleOpen()
    }
    window.addEventListener('duet-edit-link', onCustomEdit)
    return () => window.removeEventListener('duet-edit-link', onCustomEdit)
  }, [handleOpen])

  // 按下 Esc 或 Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      setOpen(false)
      editor.commands.focus()
    }
  }

  return (
    <>
      <ToolBtn title="插入链接" active={editor.isActive('link')} onClick={handleOpen}>
        <Link size={15} />
      </ToolBtn>
      
      {open && (
        <div 
          ref={popoverRef}
          className="fixed z-[100] bg-white border border-border-color rounded-xl shadow-xl p-2 flex gap-2 w-72 animate-dropdown-fade-in"
          style={{ top: pos.top, left: pos.left }}
        >
          <input
            ref={inputRef}
            type="url"
            tabIndex={-1}
            placeholder="输入链接地址 (https://...)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 border border-border-color rounded px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={handleSubmit}
            tabIndex={-1}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            确定
          </button>
        </div>
      )}
    </>
  )
}

// ─── 表格插入弹出选择器 ─────────────────────────────────────────────
function TablePicker({ editor }: { editor: Editor }) {
  const { open, setOpen, ref } = useDropdown()
  const [hovered, setHovered] = useState({ r: 0, c: 0 })
  
  const MAX_ROWS = 8
  const MAX_COLS = 8

  const rows = Array.from({ length: MAX_ROWS })
  const cols = Array.from({ length: MAX_COLS })

  const handleInsert = (r: number, c: number) => {
    editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: true }).run()
    setOpen(false)
    setHovered({ r: 0, c: 0 })
  }

  const handleToggle = () => {
    setOpen((o) => !o)
  }

  return (
    <div className="relative flex items-center" ref={ref}>
      <div>
        <ToolBtn title="插入表格" onClick={handleToggle}>
          <Table size={15} />
        </ToolBtn>
      </div>
      {open && (
        <div 
          className="absolute top-full left-0 mt-1 bg-white border border-border-color rounded-lg shadow-lg z-50 p-3 select-none"
          onMouseLeave={() => setHovered({ r: 0, c: 0 })}
        >
          <div className="flex flex-col gap-[2px]">
            {rows.map((_, rIndex) => {
              const r = rIndex + 1
              return (
                <div key={r} className="flex gap-[2px]">
                  {cols.map((_, cIndex) => {
                    const c = cIndex + 1
                    const isHovered = r <= hovered.r && c <= hovered.c
                    return (
                      <div
                        key={c}
                        onMouseEnter={() => setHovered({ r, c })}
                        onClick={() => handleInsert(r, c)}
                        className={`w-[22px] h-[22px] rounded-[2px] border cursor-pointer transition-colors ${
                          isHovered 
                            ? 'bg-indigo-100 border-indigo-400' 
                            : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                        }`}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
          <div className="text-sm text-gray-500 mt-3 text-center font-medium">
            {hovered.r > 0 ? `${hovered.c} × ${hovered.r}` : '插入表格'}
          </div>
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
      <ImageUploadBtn editor={editor} />
      <LinkPopover editor={editor} />
      
      <ToolBtn title="插入代码块" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <CodeSquare size={15} />
      </ToolBtn>
      <TablePicker editor={editor} />

      {/* 9. 表格专有操作 (当激活时显示) */}
      <TableActionsDropdown editor={editor} />
    </div>
  )
}

