import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEditorStore } from '../../store'
import { useEffect, useState } from 'react'
import { Sparkles, MoreVertical } from 'lucide-react'

interface BubblePos {
  top: number
  left: number
}

export default function Editor() {
  const content = useEditorStore((state) => state.content)
  const setContent = useEditorStore((state) => state.setContent)
  const setSelectedText = useEditorStore((state) => state.setSelectedText)

  const [bubblePos, setBubblePos] = useState<BubblePos | null>(null)

  const editor = useEditor({
    extensions: [StarterKit],
    content: content,
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML())
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection

      if (from !== to) {
        // 同步选中文本到 Zustand
        const text = editor.state.doc.textBetween(from, to, ' ')
        setSelectedText(text)

        // 计算气泡位置：获取浏览器选区的 bounding rect
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          const rect = range.getBoundingClientRect()
          // 气泡显示在选区右上角：left 对齐选区右侧，top 在选区上方
          setBubblePos({
            top: rect.top - 12,   // 距离选区上沿 12px（留给三角箭头）
            left: rect.right,
          })
        }
      } else {
        setSelectedText('')
        setBubblePos(null)
      }
    },
  })

  // 同步外部 content 状态
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false)
    }
  }, [content, editor])

  return (
    <div className="flex-1 px-16 py-10 overflow-y-auto relative">
      {/* 气泡菜单：fixed 定位跟随选区 */}
      {bubblePos && (
        <div
          className="fixed z-50"
          style={{
            top: bubblePos.top,
            left: bubblePos.left,
            transform: 'translate(-100%, -100%)',
          }}
        >
          <div className="bg-gray-800 text-white rounded-lg p-1.5 flex items-center gap-1 shadow-xl relative">
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

      <EditorContent editor={editor} />
    </div>
  )
}
