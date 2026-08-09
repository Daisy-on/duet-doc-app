import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table';
import { TableHeader } from '@tiptap/extension-table';
import { CustomCodeBlock } from './CodeBlockExtension';
import LinkHoverPopover from './LinkHoverPopover';
import { common, createLowlight } from 'lowlight';
import { useParams } from 'react-router-dom';
import { useEditorStore, type HeadingItem } from '../../store';
import { useKnowledgeBaseStore } from '../../store/knowledgeBaseStore';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Sparkles, MoreVertical } from 'lucide-react';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { GhostTextExtension } from '../../extensions/GhostTextExtension';
import { buildGhostTextPrompt, cleanGhostText } from '../../ai/ghostText';
import { AIDispatcher } from '../../ai/dispatcher';
import type { CloudAITask } from '../../ai/types';
import { AIAssistantPopover } from './AIAssistantPopover';
import { normalizeUrl } from '../../utils/urlUtils';
import LocalImageExtension from '../../extensions/LocalImageExtension';
import { runAssetGC } from '../../assets/runAssetGC';
import { logAITrace, type AITrace } from '../../ai/aiLogger';

interface BubblePos {
  top: number;
  left: number;
}

type GhostTextDiscardReason = NonNullable<AITrace['discardReason']>;

const GHOST_TEXT_PRELOAD_DELAY_MS = 2000;
const GHOST_TEXT_IDLE_TIMEOUT_MS = 3000;
const HEADING_SYNC_DELAY_MS = 150;
const EDITOR_UPDATE_DELAY_MS = 200;

function logGhostTextUIOutcome(
  requestId: string,
  status: 'rendered' | 'discarded',
  options?: { discardReason?: GhostTextDiscardReason; outputChars?: number },
): void {
  logAITrace({
    requestId,
    runtime: 'local',
    kind: 'generation',
    task: 'ghost-text-ui',
    status,
    ...options,
  });
}

// 从 ProseMirror 文档树中提取标题列表
function extractHeadings(editor: TiptapEditor): HeadingItem[] {
  const items: HeadingItem[] = [];
  const counter: Record<string, number> = {};
  editor.state.doc.forEach((node) => {
    if (node.type.name === 'heading') {
      const text = node.textContent;
      const key = text.slice(0, 20);
      counter[key] = (counter[key] ?? 0) + 1;
      const id = `heading-${key.replace(/\s+/g, '-')}-${counter[key]}`;
      items.push({ level: node.attrs.level as number, text, id });
    }
  });
  return items;
}

// 给编辑器 DOM 里的标题元素打上 data-heading-id，用于点击大纲滚动
function stampHeadingIds(editorEl: HTMLElement | null, headings: HeadingItem[]) {
  if (!editorEl) return;
  const domHeadings = editorEl.querySelectorAll('h1,h2,h3,h4,h5,h6');
  domHeadings.forEach((el, i) => {
    if (headings[i]) {
      el.setAttribute('data-heading-id', headings[i].id);
    }
  });
}

const assistantHighlightPluginKey = new PluginKey<{
  isOpen: boolean;
  from: number;
  to: number;
}>('assistantSelectionHighlight');

const assistantSelectionHighlightExtension = Extension.create({
  name: 'assistantSelectionHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: assistantHighlightPluginKey,
        state: {
          init() {
            return { isOpen: false, from: 0, to: 0 };
          },
          apply(tr, value) {
            const meta = tr.getMeta(assistantHighlightPluginKey);
            if (meta) {
              return meta;
            }
            if (value.from || value.to) {
              return {
                ...value,
                from: tr.mapping.map(value.from),
                to: tr.mapping.map(value.to),
              };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = assistantHighlightPluginKey.getState(state);
            if (
              pluginState?.isOpen &&
              pluginState.from < pluginState.to &&
              pluginState.to <= state.doc.content.size
            ) {
              const deco = Decoration.inline(pluginState.from, pluginState.to, {
                class: 'duet-blur-selection',
              });
              return DecorationSet.create(state.doc, [deco]);
            }
            return DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

export default function Editor() {
  const { docId, memoId } = useParams<{ docId?: string; memoId?: string }>();
  const currentDocId = docId || memoId;
  const doc = useKnowledgeBaseStore((state) =>
    state.documents.find((item) => item.id === currentDocId),
  );
  const updateDocument = useKnowledgeBaseStore((state) => state.updateDocument);

  const setSelectedText = useEditorStore((state) => state.setSelectedText);
  const setHeadings = useEditorStore((state) => state.setHeadings);
  const setEditorInstance = useEditorStore((state) => state.setEditorInstance);
  const setActiveEditorDocumentId = useEditorStore((state) => state.setActiveEditorDocumentId);
  const setEditorUpdateController = useEditorStore((state) => state.setEditorUpdateController);

  const [bubblePos, setBubblePos] = useState<BubblePos | null>(null);
  const timerRef = useRef<number | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const ghostTextTimerRef = useRef<number | null>(null);
  const headingSyncTimerRef = useRef<number | null>(null);
  const headingRafRef = useRef<number | null>(null);
  const lastHeadingSignatureRef = useRef('');
  const editorUpdateTimerRef = useRef<number | null>(null);
  const pendingDocumentUpdateRef = useRef<{
    documentId: string;
    editor: TiptapEditor;
  } | null>(null);
  const lastAppliedDocumentContentRef = useRef<{
    documentId: string | undefined;
    content: string | undefined;
  }>({ documentId: currentDocId, content: doc?.content });
  const currentDocIdRef = useRef<string | undefined>(currentDocId);

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantPos, setAssistantPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantTask, setAssistantTask] = useState<CloudAITask>('rewrite');
  const [savedSelection, setSavedSelection] = useState<{
    from: number;
    to: number;
    text: string;
  } | null>(null);
  const assistantRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentDocIdRef.current && currentDocIdRef.current !== currentDocId) {
      useEditorStore.getState().flushPendingDocumentUpdate(currentDocIdRef.current);
    }
    currentDocIdRef.current = currentDocId;
    setActiveEditorDocumentId(currentDocId ?? null);

    return () => {
      if (useEditorStore.getState().activeEditorDocumentId === currentDocId) {
        setActiveEditorDocumentId(null);
      }
    };
  }, [currentDocId, setActiveEditorDocumentId]);

  // 解析并同步标题到 Zustand，然后给 DOM 打标记。
  // 普通输入延迟合并；创建编辑器或外部替换内容时可强制立即同步。
  const commitHeadings = useCallback(
    (editor: TiptapEditor, force = false) => {
      if (editor.isDestroyed) return;

      const headings = extractHeadings(editor);
      const signature = JSON.stringify(headings.map(({ level, id, text }) => [level, id, text]));
      const hasChanged = signature !== lastHeadingSignatureRef.current;

      if (!hasChanged && !force) return;

      if (hasChanged) {
        lastHeadingSignatureRef.current = signature;
        setHeadings(headings);
      }

      if (headingRafRef.current !== null) {
        cancelAnimationFrame(headingRafRef.current);
      }

      // 等 DOM 更新完再打 id，并保证同一时刻最多只有一个待执行帧。
      headingRafRef.current = requestAnimationFrame(() => {
        headingRafRef.current = null;
        const editorEl = editorContainerRef.current?.querySelector(
          '.ProseMirror',
        ) as HTMLElement | null;
        stampHeadingIds(editorEl, headings);
      });
    },
    [setHeadings],
  );

  const syncHeadings = useCallback(
    (editor: TiptapEditor, immediate = false) => {
      if (headingSyncTimerRef.current !== null) {
        window.clearTimeout(headingSyncTimerRef.current);
        headingSyncTimerRef.current = null;
      }

      if (immediate) {
        commitHeadings(editor, true);
        return;
      }

      headingSyncTimerRef.current = window.setTimeout(() => {
        headingSyncTimerRef.current = null;
        commitHeadings(editor);
      }, HEADING_SYNC_DELAY_MS);
    },
    [commitHeadings],
  );

  // 幽灵文本调度函数：在选区更新时调用，清理先前的定时器和请求，根据当前文档内容和光标位置构建提示，延迟请求润色建议，并在返回后验证请求是否仍然相关，最后设置幽灵文本
  const scheduleGhostText = useCallback(
    (editor: TiptapEditor) => {
      if (ghostTextTimerRef.current) {
        window.clearTimeout(ghostTextTimerRef.current);
      }

      if (editor.isDestroyed) return;

      editor.commands.clearGhostText();
      AIDispatcher.clearGhostTextRequest();

      if (!currentDocId) return;

      const requestDocId = currentDocId;

      ghostTextTimerRef.current = window.setTimeout(async () => {
        ghostTextTimerRef.current = null;

        if (editor.isDestroyed || requestDocId !== currentDocIdRef.current) {
          return;
        }

        // 仅在用户停止输入、定时器真正触发时读取最新的编辑器上下文，
        // 避免每次 onUpdate 都遍历文档并创建临时 Prompt 数据。
        const promptInput = buildGhostTextPrompt(editor);
        if (!promptInput) return;

        const requestCursorPos = promptInput.cursorPos;
        const result = await AIDispatcher.requestGhostText({
          messages: promptInput.messages,
          docId: requestDocId,
          cursorPos: requestCursorPos,
          maxNewTokens: 16,
        });

        if (!result) return;
        if (!result.text) {
          logGhostTextUIOutcome(result.requestId, 'discarded', {
            discardReason: 'empty_result',
          });
          return;
        }
        if (requestDocId !== currentDocIdRef.current) {
          logGhostTextUIOutcome(result.requestId, 'discarded', {
            discardReason: 'document_changed',
            outputChars: result.text.length,
          });
          return;
        }
        if (editor.isDestroyed) {
          logGhostTextUIOutcome(result.requestId, 'discarded', {
            discardReason: 'editor_destroyed',
            outputChars: result.text.length,
          });
          return;
        }

        const { from, to } = editor.state.selection;
        if (from !== to) {
          logGhostTextUIOutcome(result.requestId, 'discarded', {
            discardReason: 'selection_changed',
            outputChars: result.text.length,
          });
          return;
        }
        if (from !== requestCursorPos) {
          logGhostTextUIOutcome(result.requestId, 'discarded', {
            discardReason: 'cursor_changed',
            outputChars: result.text.length,
          });
          return;
        }

        const text = cleanGhostText(result.text, promptInput.contextText);
        if (!text) {
          logGhostTextUIOutcome(result.requestId, 'discarded', {
            discardReason: 'empty_after_clean',
            outputChars: 0,
          });
          return;
        }

        const wasSet = editor.commands.setGhostText({
          text,
          pos: requestCursorPos,
          requestId: result.requestId,
        });
        logGhostTextUIOutcome(result.requestId, wasSet ? 'rendered' : 'discarded', {
          discardReason: wasSet ? undefined : 'command_rejected',
          outputChars: text.length,
        });
      }, 500);
    },
    [currentDocId],
  );

  const persistEditorContent = useCallback(
    (documentId: string, editor: TiptapEditor) => {
      if (editor.isDestroyed) return;

      const jsonStr = JSON.stringify(editor.getJSON());
      let firstH1Text = '';
      editor.state.doc.forEach((node) => {
        if (node.type.name === 'heading' && node.attrs.level === 1 && !firstH1Text) {
          firstH1Text = node.textContent;
        }
      });

      const latestDocument = useKnowledgeBaseStore
        .getState()
        .documents.find((item) => item.id === documentId);
      const updates: { content: string; title?: string } = { content: jsonStr };
      if (firstH1Text && firstH1Text !== latestDocument?.title) {
        updates.title = firstH1Text;
      }

      lastAppliedDocumentContentRef.current = {
        documentId,
        content: jsonStr,
      };
      updateDocument(documentId, updates);
    },
    [updateDocument],
  );

  const flushPendingDocumentUpdate = useCallback(
    (documentId?: string): string | null => {
      const pendingUpdate = pendingDocumentUpdateRef.current;
      if (!pendingUpdate || (documentId && pendingUpdate.documentId !== documentId)) {
        return null;
      }

      if (editorUpdateTimerRef.current !== null) {
        window.clearTimeout(editorUpdateTimerRef.current);
        editorUpdateTimerRef.current = null;
      }
      pendingDocumentUpdateRef.current = null;

      if (pendingUpdate.editor.isDestroyed) return null;
      persistEditorContent(pendingUpdate.documentId, pendingUpdate.editor);
      return pendingUpdate.documentId;
    },
    [persistEditorContent],
  );

  const cancelPendingDocumentUpdate = useCallback((documentId?: string) => {
    const pendingUpdate = pendingDocumentUpdateRef.current;
    if (!pendingUpdate || (documentId && pendingUpdate.documentId !== documentId)) {
      return;
    }

    if (editorUpdateTimerRef.current !== null) {
      window.clearTimeout(editorUpdateTimerRef.current);
      editorUpdateTimerRef.current = null;
    }
    pendingDocumentUpdateRef.current = null;
  }, []);

  const scheduleDocumentUpdate = useCallback(
    (editor: TiptapEditor) => {
      const documentId = currentDocIdRef.current;
      if (!documentId || editor.isDestroyed) return;

      const pendingUpdate = pendingDocumentUpdateRef.current;
      if (pendingUpdate && pendingUpdate.documentId !== documentId) {
        flushPendingDocumentUpdate();
      }

      pendingDocumentUpdateRef.current = { documentId, editor };
      if (editorUpdateTimerRef.current !== null) {
        window.clearTimeout(editorUpdateTimerRef.current);
      }
      editorUpdateTimerRef.current = window.setTimeout(() => {
        editorUpdateTimerRef.current = null;
        flushPendingDocumentUpdate(documentId);
      }, EDITOR_UPDATE_DELAY_MS);
    },
    [flushPendingDocumentUpdate],
  );

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
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
        getDocId: () => useEditorStore.getState().activeEditorDocumentId,
      }),
      assistantSelectionHighlightExtension,
    ],
    [],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content: doc
        ? doc.content.trim().startsWith('{')
          ? JSON.parse(doc.content)
          : doc.content
        : '',
      onCreate: ({ editor }) => {
        syncHeadings(editor, true);
      },
      onUpdate: ({ editor }) => {
        scheduleDocumentUpdate(editor);
        syncHeadings(editor);
        scheduleGhostText(editor);
      },
      onSelectionUpdate: ({ editor }) => {
        const { from, to } = editor.state.selection;

        // 清除先前的定时器
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }

        if (from !== to) {
          // 如果选区在代码块内，或者是代码块的节点选择，不显示润色气泡
          const selection = editor.state.selection;
          const isCodeBlockSelection =
            editor.isActive('codeBlock') ||
            (selection instanceof NodeSelection && selection.node.type.name === 'codeBlock');

          if (isCodeBlockSelection) {
            setSelectedText('');
            setBubblePos(null);
            return;
          }

          // 同步选中文本到 Zustand
          const text = editor.state.doc.textBetween(from, to, ' ');
          setSelectedText(text);

          // 延迟 500ms 显示气泡
          timerRef.current = window.setTimeout(() => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              const rects = range.getClientRects();
              // 获取第一行选区的矩形，如果不存在则退回到 getBoundingClientRect
              const firstRect = rects[0] || range.getBoundingClientRect();

              // 气泡显示在第一行选区右上角：left 对齐第一行选区右侧，top 在第一行选区上方
              setBubblePos({
                top: firstRect.top - 12, // 距离第一行选区上沿 12px（留给三角箭头）
                left: firstRect.right,
              });
            }
          }, 500);
        } else {
          setSelectedText('');
          setBubblePos(null);
        }
      },
    },
    [],
  );

  useEffect(() => {
    const controller = {
      flush: flushPendingDocumentUpdate,
      cancel: cancelPendingDocumentUpdate,
    };
    setEditorUpdateController(controller);

    return () => {
      flushPendingDocumentUpdate();
      if (useEditorStore.getState().editorUpdateController === controller) {
        setEditorUpdateController(null);
      }
    };
  }, [cancelPendingDocumentUpdate, flushPendingDocumentUpdate, setEditorUpdateController]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;

      const flushedDocumentId = flushPendingDocumentUpdate();
      if (flushedDocumentId) {
        useKnowledgeBaseStore
          .getState()
          .flushDocumentAutosave(flushedDocumentId)
          .catch((err) => console.error('Failed to flush hidden document:', err));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushPendingDocumentUpdate]);

  // 首屏稳定后空闲预热端侧模型；用户开始编辑时可立即抢占加载。
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const initialStatus = AIDispatcher.getGhostTextStatus();
    if (initialStatus === 'loading' || initialStatus === 'ready') return;

    let preloadTimerId: number | null = null;
    let idleCallbackId: number | null = null;
    let fallbackIdleTimerId: number | null = null;
    let autoDelayElapsed = false;
    let started = false;

    const cancelPendingSchedule = () => {
      if (preloadTimerId !== null) {
        window.clearTimeout(preloadTimerId);
        preloadTimerId = null;
      }
      if (idleCallbackId !== null) {
        window.cancelIdleCallback(idleCallbackId);
        idleCallbackId = null;
      }
      if (fallbackIdleTimerId !== null) {
        window.clearTimeout(fallbackIdleTimerId);
        fallbackIdleTimerId = null;
      }
    };

    const startLoading = (allowErrorRetry: boolean) => {
      if (started || document.visibilityState !== 'visible') return;

      const status = AIDispatcher.getGhostTextStatus();
      if (status === 'loading' || status === 'ready') {
        started = true;
        cancelPendingSchedule();
        return;
      }
      if (status === 'error' && !allowErrorRetry) return;

      started = true;
      cancelPendingSchedule();
      AIDispatcher.loadGhostTextModel();
    };

    const scheduleIdlePreload = () => {
      if (
        started ||
        idleCallbackId !== null ||
        fallbackIdleTimerId !== null ||
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      if (typeof window.requestIdleCallback === 'function') {
        idleCallbackId = window.requestIdleCallback(
          () => {
            idleCallbackId = null;
            startLoading(false);
          },
          { timeout: GHOST_TEXT_IDLE_TIMEOUT_MS },
        );
      } else {
        fallbackIdleTimerId = window.setTimeout(() => {
          fallbackIdleTimerId = null;
          startLoading(false);
        }, 0);
      }
    };

    const handleUserIntent = () => {
      startLoading(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && autoDelayElapsed && !started) {
        scheduleIdlePreload();
      }
    };

    preloadTimerId = window.setTimeout(() => {
      preloadTimerId = null;
      autoDelayElapsed = true;
      scheduleIdlePreload();
    }, GHOST_TEXT_PRELOAD_DELAY_MS);

    const editorElement = editor.view.dom;
    editorElement.addEventListener('pointerdown', handleUserIntent, { once: true });
    editorElement.addEventListener('keydown', handleUserIntent, { once: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelPendingSchedule();
      editorElement.removeEventListener('pointerdown', handleUserIntent);
      editorElement.removeEventListener('keydown', handleUserIntent);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [editor]);

  // 当文档切换时，在 Render 阶段推导重置 AI 助手弹窗与选区气泡，防止跨文档残留
  const [prevDocId, setPrevDocId] = useState(currentDocId);
  if (prevDocId !== currentDocId) {
    setPrevDocId(currentDocId);
    setIsAssistantOpen(false);
    setSavedSelection(null);
    setAssistantPos(null);
    setBubblePos(null);
  }

  // 唤起智能助手输入框
  const openAssistant = useCallback(
    (defaultText: string, task: CloudAITask = 'rewrite') => {
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

        const assistantWidth = 560;
        const viewportHeight = window.innerHeight;

        // 1. 横向定位：将输入框的中心对齐选区的水平中心
        const selectionCenterX = rangeRect.left + rangeRect.width / 2;
        let left = selectionCenterX - assistantWidth / 2;

        // 限制输入框不超出编辑区边界（考虑 px-16 的左右 40px 边距，即正文文字对齐线）
        const minLeft = containerRect.left + 64;
        const maxLeft = containerRect.right - 64 - assistantWidth;
        left = Math.max(minLeft, Math.min(left, maxLeft));

        // 2. 纵向定位：默认定位在选区底部下方 12px 处（留出刚好露出选中行文字的空间）
        const top = lastRect.bottom + 12;
        let pos: { top?: number; bottom?: number; left: number };

        // 如果下方空间不足（预测展开后高度约为300px），则定位在选区上方并设置 bottom 以使其向上扩展
        if (top + 300 > viewportHeight) {
          const firstRect = rects[0] || range.getBoundingClientRect();
          const bottom = viewportHeight - firstRect.top + 12;
          pos = { bottom, left };
        } else {
          pos = { top, left };
        }

        setAssistantPos(pos);
      }
      setIsAssistantOpen(true);
      setBubblePos(null); // 隐藏气泡菜单
    },
    [
      editor,
      setSavedSelection,
      setAssistantInput,
      setAssistantTask,
      setAssistantPos,
      setIsAssistantOpen,
      setBubblePos,
    ],
  );

  // 当助手打开状态改变或选区改变时，通过 Meta 事务强类型更新 ProseMirror Plugin State
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      queueMicrotask(() => {
        if (!editor.isDestroyed) {
          const tr = editor.view.state.tr;
          tr.setMeta(assistantHighlightPluginKey, {
            isOpen: isAssistantOpen,
            from: savedSelection?.from ?? 0,
            to: savedSelection?.to ?? 0,
          });
          editor.view.dispatch(tr);
        }
      });
    }
  }, [isAssistantOpen, savedSelection, editor]);

  // 同步 editor 实例到全局 store
  useEffect(() => {
    setEditorInstance(editor);
    if (import.meta.env.DEV && editor) {
      window.editor = editor;
    }
    return () => {
      setEditorInstance(null);
      if (import.meta.env.DEV) {
        delete window.editor;
      }
    };
  }, [editor, setEditorInstance]);

  // 组件卸载时清理定时器并异步拉起 GC
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (ghostTextTimerRef.current) {
        clearTimeout(ghostTextTimerRef.current);
      }
      if (headingSyncTimerRef.current !== null) {
        clearTimeout(headingSyncTimerRef.current);
      }
      if (headingRafRef.current !== null) {
        cancelAnimationFrame(headingRafRef.current);
      }
      if (editorUpdateTimerRef.current !== null) {
        clearTimeout(editorUpdateTimerRef.current);
      }
      AIDispatcher.clearGhostTextRequest();
      if (currentDocIdRef.current) {
        runAssetGC(currentDocIdRef.current).catch((err) =>
          console.error('Asset GC error on unmount:', err),
        );
      }
    };
  }, []);

  useEffect(() => {
    if (ghostTextTimerRef.current) {
      clearTimeout(ghostTextTimerRef.current);
    }

    AIDispatcher.clearGhostTextRequest();
    if (editor && !editor.isDestroyed) {
      editor.commands.clearGhostText();
    }
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
  const docContent = doc?.content;
  useEffect(() => {
    if (!editor || !docContent || editor.isDestroyed) return;

    const currentDocumentId = currentDocIdRef.current;
    const lastAppliedContent = lastAppliedDocumentContentRef.current;
    if (
      lastAppliedContent.documentId === currentDocumentId &&
      lastAppliedContent.content === docContent
    ) {
      return;
    }

    flushPendingDocumentUpdate();
    queueMicrotask(() => {
      if (editor.isDestroyed) return;

      const latestDocumentId = currentDocIdRef.current;
      const latestContent = useKnowledgeBaseStore
        .getState()
        .documents.find((item) => item.id === latestDocumentId)?.content;
      if (!latestDocumentId || !latestContent) return;

      const latestAppliedContent = lastAppliedDocumentContentRef.current;
      if (
        latestAppliedContent.documentId === latestDocumentId &&
        latestAppliedContent.content === latestContent
      ) {
        return;
      }

      const isJson = latestContent.trim().startsWith('{');
      editor.commands.clearGhostText();
      AIDispatcher.clearGhostTextRequest();
      editor.commands.setContent(isJson ? JSON.parse(latestContent) : latestContent, {
        emitUpdate: false,
      });
      lastAppliedDocumentContentRef.current = {
        documentId: latestDocumentId,
        content: latestContent,
      };
      syncHeadings(editor, true);
    });
  }, [docContent, editor, flushPendingDocumentUpdate, syncHeadings]);

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
                e.preventDefault(); // 防止点击时失去选区
                e.stopPropagation();
                openAssistant('', 'rewrite');
              }}
            >
              <Sparkles size={14} /> AI 润色
            </div>
            <div className="w-[1px] h-4 bg-gray-600 mx-1" />
            <div
              className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openAssistant('用更正式的口吻改写以下内容', 'rewrite');
              }}
            >
              更正式
            </div>
            <div
              className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openAssistant('扩写选中的文本内容', 'expand');
              }}
            >
              扩写
            </div>
            <div
              className="px-3 py-1.5 text-[13px] font-medium rounded-md cursor-pointer hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openAssistant('解释一下这段话的意思', 'explain');
              }}
            >
              解释一下
            </div>
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
  );
}
