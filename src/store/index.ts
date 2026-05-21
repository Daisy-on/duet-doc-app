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
  content: `
    <h1>Vite 原理解析</h1>
    <p>Vite 是一种新型的前端构建工具，它利用浏览器原生 ES 模块导入的能力，提供了极快的冷启动和热更新体验。</p>
    <h2>一、整体架构</h2>
    <p>Vite 的核心思想是将开发服务器作为 ESM 的载体，在开发环境下直接返回原生 ES 模块，浏览器按需加载，从而跳过了打包这一耗时步骤。</p>
    <h2>二、依赖预构建</h2>
    <p>Vite 使用 esbuild 对依赖进行预构建，将 CommonJS 或 UMD 格式的依赖转换为 ESM 格式，缓存在 node_modules/.vite 中。</p>
    <h2>三、代码示例</h2>
    <pre><code class="language-javascript">&lt;script setup lang="ts" name="Category"&gt;
import {reactive} from 'vue'
let games = reactive([
  {id:'asgdytsa01',name:'英雄联盟'},
  {id:'asgdytsa02',name:'王者荣耀'},
  {id:'asgdytsa03',name:'红色警戒'},
  {id:'asgdytsa04',name:'斗罗大陆'}
])
&lt;/script&gt;</code></pre>
  `,
  setContent: (content) => set({ content }),
  selectedText: '',
  setSelectedText: (text) => set({ selectedText: text }),
  headings: [],
  setHeadings: (headings) => set({ headings }),
  editorInstance: null,
  setEditorInstance: (editor) => set({ editorInstance: editor }),
}));

