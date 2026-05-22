import { create } from 'zustand';
import type { Editor } from '@tiptap/core';

export interface HeadingItem {
  level: number;   // 1 | 2 | 3 | 4 | 5 | 6
  text: string;
  id: string;      // 用于滚动锚点
}

interface EditorState {
  content: string;
  setContent: (content: string) => void;
  selectedText: string;
  setSelectedText: (text: string) => void;
  headings: HeadingItem[];
  setHeadings: (headings: HeadingItem[]) => void;
  // 编辑器实例（由 Editor 组件写入，供 Toolbar 读取）
  editorInstance: Editor | null;
  setEditorInstance: (editor: Editor | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  content: '',
  setContent: (content) => set({ content }),
  selectedText: '',
  setSelectedText: (text) => set({ selectedText: text }),
  headings: [],
  setHeadings: (headings) => set({ headings }),
  editorInstance: null,
  setEditorInstance: (editor) => set({ editorInstance: editor }),
}));

