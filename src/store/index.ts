import { create } from 'zustand';

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
}

export const useEditorStore = create<EditorState>((set) => ({
  content: `
    <h1>Vite 原理解析</h1>
    <p>Vite 是一种新型的前端构建工具，它利用浏览器原生 ES 模块导入的能力，提供了极快的冷启动和热更新体验。</p>
    <h2>一、整体架构</h2>
    <p>Vite 的核心思想是将开发服务器作为 ESM 的载体，在开发环境下直接返回原生 ES 模块，浏览器按需加载，从而跳过了打包这一耗时步骤。</p>
    <h2>二、依赖预构建</h2>
    <p>Vite 使用 esbuild 对依赖进行预构建，将 CommonJS 或 UMD 格式的依赖转换为 ESM 格式，缓存在 node_modules/.vite 中。</p>
  `,
  setContent: (content) => set({ content }),
  selectedText: '',
  setSelectedText: (text) => set({ selectedText: text }),
  headings: [],
  setHeadings: (headings) => set({ headings }),
}));
