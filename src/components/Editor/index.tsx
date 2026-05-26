import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import { Link } from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table'
import { TableHeader } from '@tiptap/extension-table'
import { CustomCodeBlock } from './CodeBlockExtension'
import LinkHoverPopover from './LinkHoverPopover'
import { common, createLowlight } from 'lowlight'
import { useParams } from 'react-router-dom'
import { useEditorStore, type HeadingItem } from '../../store'
import { useKnowledgeBaseStore } from '../../store/knowledgeBaseStore'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Sparkles, MoreVertical } from 'lucide-react'
import type { Editor as TiptapEditor } from '@tiptap/core'

interface BubblePos {
  top: number
  left: number
}

// 从 ProseMirror 文档树中提取标题列表
function extractHeadings(editor: TiptapEditor): HeadingItem[] {
  const items: HeadingItem[] = []
  const counter: Record<string, number> = {}
  editor.state.doc.forEach((node) => {
    if (node.type.name === 'heading') {
      const text = node.textContent
      const key = text.slice(0, 20)
      counter[key] = (counter[key] ?? 0) + 1
      const id = `heading-${key.replace(/\s+/g, '-')}-${counter[key]}`
      items.push({ level: node.attrs.level as number, text, id })
    }
  })
  return items
}

// 给编辑器 DOM 里的标题元素打上 data-heading-id，用于点击大纲滚动
function stampHeadingIds(editorEl: HTMLElement | null, headings: HeadingItem[]) {
  if (!editorEl) return
  const domHeadings = editorEl.querySelectorAll('h1,h2,h3,h4,h5,h6')
  domHeadings.forEach((el, i) => {
    if (headings[i]) {
      el.setAttribute('data-heading-id', headings[i].id)
    }
  })
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: number | null = null
  return (...args: Parameters<T>) => {
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      fn(...args)
    }, delay)
  }
}

export default function Editor() {
  const { docId, memoId } = useParams<{ docId?: string; memoId?: string }>()
  const currentDocId = docId || memoId
  const { documents, updateDocument } = useKnowledgeBaseStore()
  const doc = documents.find((d) => d.id === currentDocId)

  const setSelectedText = useEditorStore((state) => state.setSelectedText)
  const setHeadings = useEditorStore((state) => state.setHeadings)
  const setEditorInstance = useEditorStore((state) => state.setEditorInstance)

  const [bubblePos, setBubblePos] = useState<BubblePos | null>(null)
  const timerRef = useRef<number | null>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)

  // Debounced updateDocument
  const debouncedUpdateDoc = useMemo(() => {
    return debounce((id: string, updates: { content: string; title?: string }) => {
      updateDocument(id, updates)
    }, 800)
  }, [updateDocument])

  // 解析并同步标题到 Zustand，然后给 DOM 打标记
  const syncHeadings = useCallback((editor: TiptapEditor) => {
    const headings = extractHeadings(editor)
    setHeadings(headings)
    // 等 DOM 更新完再打 id（RAF 保证在渲染后执行）
    requestAnimationFrame(() => {
      const editorEl = editorContainerRef.current?.querySelector('.ProseMirror') as HTMLElement | null
      stampHeadingIds(editorEl, headings)
    })
  }, [setHeadings])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CustomCodeBlock.configure({
        lowlight: createLowlight(common),
      }),
      Underline,
      Superscript,
      Subscript,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: doc ? (doc.content.trim().startsWith('{') ? JSON.parse(doc.content) : doc.content) : '',
    onCreate: ({ editor }) => {
      syncHeadings(editor)
    },
    onUpdate: ({ editor }) => {
      if (currentDocId) {
        const jsonStr = JSON.stringify(editor.getJSON())
        let firstH1Text = ''
        editor.state.doc.forEach((node) => {
          if (node.type.name === 'heading' && node.attrs.level === 1 && !firstH1Text) {
            firstH1Text = node.textContent
          }
        })
        
        const updates: { content: string; title?: string } = { content: jsonStr }
        if (firstH1Text && firstH1Text !== doc?.title) {
          updates.title = firstH1Text
        }
        debouncedUpdateDoc(currentDocId, updates)
      }
      syncHeadings(editor)
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection

      // 清除先前的定时器
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      if (from !== to) {
        // 如果选区在代码块内，或者是代码块的节点选择，不显示润色气泡
        const selection = editor.state.selection
        const isCodeBlockSelection = editor.isActive('codeBlock') ||
          ('node' in selection && (selection as any).node?.type.name === 'codeBlock')

        if (isCodeBlockSelection) {
          setSelectedText('')
          setBubblePos(null)
          return
        }

        // 同步选中文本到 Zustand
        const text = editor.state.doc.textBetween(from, to, ' ')
        setSelectedText(text)

        // 延迟 500ms 显示气泡
        timerRef.current = window.setTimeout(() => {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            const rects = range.getClientRects()
            // 获取第一行选区的矩形，如果不存在则退回到 getBoundingClientRect
            const firstRect = rects[0] || range.getBoundingClientRect()
            
            // 气泡显示在第一行选区右上角：left 对齐第一行选区右侧，top 在第一行选区上方
            setBubblePos({
              top: firstRect.top - 12,   // 距离第一行选区上沿 12px（留给三角箭头）
              left: firstRect.right,
            })
          }
        }, 500)
      } else {
        setSelectedText('')
        setBubblePos(null)
      }
    },
  })

  // 同步 editor 实例到全局 store
  useEffect(() => {
    setEditorInstance(editor)
    if (editor) {
      (window as any).editor = editor
    }
    return () => {
      setEditorInstance(null)
      delete (window as any).editor
    }
  }, [editor, setEditorInstance])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  // 同步外部 content 状态
  useEffect(() => {
    if (editor && doc) {
      const isJson = doc.content.trim().startsWith('{')
      const currentContent = isJson ? JSON.stringify(editor.getJSON()) : editor.getHTML()
      if (doc.content !== currentContent) {
        editor.commands.setContent(isJson ? JSON.parse(doc.content) : doc.content, { emitUpdate: false })
        syncHeadings(editor)
      }
    }
  }, [doc?.content, editor, syncHeadings])

  return (
    <div ref={editorContainerRef} className="flex-1 px-16 py-10 overflow-y-auto relative">
      {/* 气泡菜单：fixed 定位跟随选区，并加入弹出动画 */}
      {bubblePos && (
        <div
          className="fixed z-50 animate-pop-in"
          style={{
            top: bubblePos.top,
            left: bubblePos.left,
          }}
        >
          <div className="bg-gray-800 text-white rounded-lg p-1.5 flex items-center gap-1 shadow-xl relative whitespace-nowrap w-max">
            <div
              className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer flex items-center gap-1.5 text-indigo-200 hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault() // 防止点击时失去选区
                console.log('AI 润色：', useEditorStore.getState().selectedText)
              }}
            >
              <Sparkles size={14} /> AI 润色
            </div>
            <div className="w-[1px] h-4 bg-gray-600 mx-1" />
            <div
              className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
            >更正式</div>
            <div
              className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
            >扩写</div>
            <div
              className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
            >解释一下</div>
            <div
              className="px-2 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
            >
              <MoreVertical size={14} />
            </div>
            {/* 三角箭头：指向选区右上角，靠气泡右下方 */}
            <div className="absolute top-full right-4 border-solid border-t-gray-800 border-t-[6px] border-x-transparent border-x-[6px] border-b-0" />
          </div>
        </div>
      )}
      
      <LinkHoverPopover editor={editor} containerRef={editorContainerRef} />

      <EditorContent editor={editor} />
    </div>
  )
}
