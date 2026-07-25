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
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { GhostTextExtension } from '../../extensions/GhostTextExtension';
import { buildGhostTextPrompt, cleanGhostText } from '../../ai/ghostText';
import { AIDispatcher } from '../../ai/dispatcher';
import type { CloudAITask } from '../../ai/types';
import { AIAssistantPopover } from './AIAssistantPopover';
import { normalizeUrl } from '../../utils/urlUtils';
import LocalImageExtension from '../../extensions/LocalImageExtension';

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
  // AI 润色的定时器和当前文档 ID 的 ref，用于在选区更新时请求润色建议，并在文档切换时清理定时器
  const ghostTextTimerRef = useRef<number | null>(null);
  const currentDocIdRef = useRef<string | undefined>(currentDocId);

  // AI 智能助手悬浮输入框状态
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantPos, setAssistantPos] = useState<BubblePos | null>(null);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantTask, setAssistantTask] = useState<CloudAITask>('rewrite');
  const [savedSelection, setSavedSelection] = useState<{ from: number; to: number; text: string } | null>(null);
  const assistantRef = useRef<HTMLDivElement>(null);

  // 用 Ref 同步状态，以供 ProseMirror 插件访问，避免重建插件导致编辑器重新实例化
  const isAssistantOpenRef = useRef(isAssistantOpen);
  const savedSelectionRef = useRef(savedSelection);

  useEffect(() => {
    isAssistantOpenRef.current = isAssistantOpen;
  }, [isAssistantOpen]);

  useEffect(() => {
    savedSelectionRef.current = savedSelection;
  }, [savedSelection]);

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

  // 幽灵文本调度函数：在选区更新时调用，清理先前的定时器和请求，根据当前文档内容和光标位置构建提示，延迟请求润色建议，并在返回后验证请求是否仍然相关，最后设置幽灵文本
  const scheduleGhostText = useCallback((editor: TiptapEditor) => {
    if (ghostTextTimerRef.current) {
      window.clearTimeout(ghostTextTimerRef.current);
    }

    editor.commands.clearGhostText();
    AIDispatcher.clearGhostTextRequest();

    if (!currentDocId) return;

    const promptInput = buildGhostTextPrompt(editor);
    if (!promptInput) return;

    const requestDocId = currentDocId;
    const requestCursorPos = promptInput.cursorPos;

    ghostTextTimerRef.current = window.setTimeout(async () => {
      const result = await AIDispatcher.requestGhostText({
        messages: promptInput.messages,
        docId: requestDocId,
        cursorPos: requestCursorPos,
        maxNewTokens: 16,
      });

      if (!result?.text) return;
      if (requestDocId !== currentDocIdRef.current) return;
      if (editor.isDestroyed) return;

      const { from, to } = editor.state.selection;
      if (from !== to) return;
      if (from !== requestCursorPos) return;

      const text = cleanGhostText(result.text, promptInput.contextText);
      if (!text) return;

      editor.commands.setGhostText({
        text,
        pos: requestCursorPos,
        requestId: result.requestId,
      });
    }, 500);
  }, [currentDocId]);



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
      Link.configure({ 
        openOnClick: false, 
        autolink: true,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'text-accent underline hover:text-indigo-700 cursor-pointer',
        },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      GhostTextExtension,
      LocalImageExtension.configure({
        getDocId: () => currentDocIdRef.current || null,
      }),
      Extension.create({
        name: 'assistantSelectionHighlight',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              props: {
                decorations(state) {
                  if (isAssistantOpenRef.current && savedSelectionRef.current) {
                    const { from, to } = savedSelectionRef.current;
                    if (from < to && to <= state.doc.content.size) {
                      const deco = Decoration.inline(from, to, {
                        class: 'duet-blur-selection',
                      });
                      return DecorationSet.create(state.doc, [deco]);
                    }
                  }
                  return DecorationSet.empty;
                },
              },
            }),
          ];
        },
      }),
    ],
    content: doc ? (doc.content.trim().startsWith('{') ? JSON.parse(doc.content) : doc.content) : '',
    onCreate: ({ editor }) => {
      syncHeadings(editor);
      AIDispatcher.loadGhostTextModel();
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
      syncHeadings(editor);
      scheduleGhostText(editor);
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

  // 唤起智能助手输入框
  const openAssistant = useCallback((defaultText: string, task: CloudAITask = 'rewrite') => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ');
    setSavedSelection({ from, to, text });
    setAssistantInput(defaultText);
    setAssistantTask(task);

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && editorContainerRef.current) {
      const range = selection.getRangeAt(0);
      const rects = range.getClientRects();
      // 获取选区最后一个矩形作为纵向定位基准
      const lastRect = rects[rects.length - 1] || range.getBoundingClientRect();
      // 获取整个选区的包围盒作为横向定位基准
      const rangeRect = range.getBoundingClientRect();
      
      // 获取编辑器容器的视口矩形，用于精确对齐编辑区边缘
      const containerRect = editorContainerRef.current.getBoundingClientRect();

      const assistantWidth = 460;
      const assistantHeight = 46; // 输入框大致高度
      const viewportHeight = window.innerHeight;

      // 1. 横向定位：将输入框的中心对齐选区的水平中心
      const selectionCenterX = rangeRect.left + rangeRect.width / 2;
      let left = selectionCenterX - assistantWidth / 2;

      // 限制输入框不超出编辑区边界（考虑 px-16 的左右 40px 边距，即正文文字对齐线）
      const minLeft = containerRect.left + 64;
      const maxLeft = containerRect.right - 64 - assistantWidth;
      left = Math.max(minLeft, Math.min(left, maxLeft));

      // 2. 纵向定位：默认定位在选区底部下方 12px 处（留出刚好露出选中行文字的空间）
      let top = lastRect.bottom + 12;

      // 如果下方空间不足（会超出视口底部），则定位在选区上方
      if (top + assistantHeight > viewportHeight - 16) {
        const firstRect = rects[0] || range.getBoundingClientRect();
        top = firstRect.top - assistantHeight - 12;
      }

      setAssistantPos({ top, left });
    }
    setIsAssistantOpen(true);
    setBubblePos(null); // 隐藏气泡菜单
  }, [editor]);

  // 当助手打开状态改变时，强制 ProseMirror 重绘以更新高亮 Decoration
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.view.dispatch(editor.view.state.tr);
    }
  }, [isAssistantOpen, editor]);

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
      if (ghostTextTimerRef.current) {
        clearTimeout(ghostTextTimerRef.current);
      }
      AIDispatcher.clearGhostTextRequest();
    }
  }, [])

  useEffect(() => {
    if (ghostTextTimerRef.current) {
      clearTimeout(ghostTextTimerRef.current);
    }

    AIDispatcher.clearGhostTextRequest();
    editor?.commands.clearGhostText();
  }, [currentDocId, editor]);

  // 监听 AI Worker 空闲且之前有丢弃请求的自定义事件，以触发冷却重试
  useEffect(() => {
    if (!editor) return;

    const handleIdle = () => {
      if (!editor.isDestroyed) {
        scheduleGhostText(editor);
      }
    };

    window.addEventListener('ghost-text-idle', handleIdle);
    return () => {
      window.removeEventListener('ghost-text-idle', handleIdle);
    };
  }, [editor, scheduleGhostText]);

  // 点击助手悬浮框外部关闭逻辑
  useEffect(() => {
    if (!isAssistantOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      // 如果点击的目标元素已经不在 document.body 中（如被卸载的气泡菜单组件），则忽略关闭
      if (!document.body.contains(e.target as Node)) {
        return;
      }
      if (assistantRef.current && assistantRef.current.contains(e.target as Node)) {
        return;
      }
      const bubbleMenu = document.querySelector('.animate-pop-in');
      if (bubbleMenu && bubbleMenu.contains(e.target as Node)) {
        return;
      }
      setIsAssistantOpen(false);
      setAssistantPos(null);
      setAssistantInput('');
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isAssistantOpen]);

  // 同步外部 content 状态
  useEffect(() => {
    if (editor && doc) {
      const isJson = doc.content.trim().startsWith('{')
      const currentContent = isJson ? JSON.stringify(editor.getJSON()) : editor.getHTML()
      if (doc.content !== currentContent) {
        editor.commands.clearGhostText();
        AIDispatcher.clearGhostTextRequest();
        editor.commands.setContent(isJson ? JSON.parse(doc.content) : doc.content, { emitUpdate: false })
        syncHeadings(editor)
      }
    }
  }, [doc?.content, editor, syncHeadings])

  // 拦截链接点击（包含 CTRL+点击 / CMD+点击），确保始终在外部新标签页中打开规范化外链
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor && container.contains(anchor)) {
        // 如果是按住 Ctrl / Cmd 点击链接，或者目标为外链
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          const rawHref = anchor.getAttribute('href') || '';
          const targetUrl = normalizeUrl(rawHref);
          if (targetUrl) {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
          }
        }
      }
    };

    container.addEventListener('click', handleLinkClick, true);
    return () => {
      container.removeEventListener('click', handleLinkClick, true);
    };
  }, []);

  // 文档切换时清理 AI 润色的定时器和请求
  useEffect(() => {
    currentDocIdRef.current = currentDocId;
  }, [currentDocId]);

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
                e.stopPropagation()
                openAssistant('', 'rewrite')
              }}
            >
              <Sparkles size={14} /> AI 润色
            </div>
            <div className="w-[1px] h-4 bg-gray-600 mx-1" />
            <div
              className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                openAssistant('用更正式的口吻改写以下内容', 'rewrite')
              }}
            >更正式</div>
            <div
              className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                openAssistant('扩写选中的文本内容', 'expand')
              }}
            >扩写</div>
            <div
              className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                openAssistant('解释一下这段话的意思', 'explain')
              }}
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

      {/* 智能助手悬浮输入框与预览区 */}
      {isAssistantOpen && assistantPos && (
        <AIAssistantPopover
          assistantPos={assistantPos}
          assistantRef={assistantRef}
          task={assistantTask}
          defaultInstruction={assistantInput}
          savedSelection={savedSelection}
          editor={editor}
          onClose={() => {
            setIsAssistantOpen(false);
            setAssistantPos(null);
            setAssistantInput('');
          }}
        />
      )}
      
      <LinkHoverPopover editor={editor} containerRef={editorContainerRef} />

      <EditorContent editor={editor} />
    </div>
  )
}
