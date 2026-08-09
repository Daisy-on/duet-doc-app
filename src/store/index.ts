import { create } from 'zustand';
import type { Editor } from '@tiptap/core';

export interface HeadingItem {
  level: number; // 1 | 2 | 3 | 4 | 5 | 6
  text: string;
  id: string; // 用于滚动锚点
}

interface EditorUpdateController {
  flush: (documentId?: string) => string | null;
  cancel: (documentId?: string) => void;
}

interface EditorState {
  selectedText: string;
  setSelectedText: (text: string) => void;
  headings: HeadingItem[];
  setHeadings: (headings: HeadingItem[]) => void;
  activeEditorDocumentId: string | null;
  setActiveEditorDocumentId: (documentId: string | null) => void;
  // 编辑器实例（由 Editor 组件写入，供 Toolbar 读取）
  editorInstance: Editor | null;
  setEditorInstance: (editor: Editor | null) => void;
  editorUpdateController: EditorUpdateController | null;
  setEditorUpdateController: (controller: EditorUpdateController | null) => void;
  flushPendingDocumentUpdate: (documentId?: string) => string | null;
  cancelPendingDocumentUpdate: (documentId?: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  selectedText: '',
  setSelectedText: (text) => set({ selectedText: text }),
  headings: [],
  setHeadings: (headings) => set({ headings }),
  activeEditorDocumentId: null,
  setActiveEditorDocumentId: (documentId) => set({ activeEditorDocumentId: documentId }),
  editorInstance: null,
  setEditorInstance: (editor) => set({ editorInstance: editor }),
  editorUpdateController: null,
  setEditorUpdateController: (controller) => set({ editorUpdateController: controller }),
  flushPendingDocumentUpdate: (documentId) =>
    get().editorUpdateController?.flush(documentId) ?? null,
  cancelPendingDocumentUpdate: (documentId) => get().editorUpdateController?.cancel(documentId),
}));

export * from './layoutStore';
