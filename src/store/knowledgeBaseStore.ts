import { create } from 'zustand';

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  icon: string; // Background color class or Hex color code
  createdAt: number;
  updatedAt: number;
}

export interface Group {
  id: string;
  kbId: string;
  parentGroupId: string | null;  // null = 知识库根级分组
  depth: number;                 // 0 = 根级，1 = 二级，最大 5
  name: string;
  order: number;
  createdAt: number;
}

export interface Document {
  id: string;
  kbId: string;
  groupId: string | null;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface KnowledgeBaseStore {
  knowledgeBases: KnowledgeBase[];
  groups: Group[];
  documents: Document[];

  // Knowledge Base CRUD
  createKnowledgeBase: (name: string, description: string, icon?: string) => string;
  updateKnowledgeBase: (id: string, data: Partial<KnowledgeBase>) => void;
  deleteKnowledgeBase: (id: string) => void;

  // Group CRUD
  createGroup: (kbId: string, parentGroupId: string | null, name?: string) => string;
  updateGroup: (id: string, data: Partial<Group>) => void;
  deleteGroup: (id: string) => void;

  // Document CRUD
  createDocument: (kbId: string, groupId?: string | null, title?: string) => string;
  updateDocument: (id: string, data: Partial<Document>) => void;
  deleteDocument: (id: string) => void;

  // Query helpers
  getKnowledgeBase: (id: string) => KnowledgeBase | undefined;
  getGroupsByKb: (kbId: string) => Group[];
  getDocumentsByKb: (kbId: string) => Document[];
  getDocumentsByGroup: (groupId: string) => Document[];
  getRootDocuments: (kbId: string) => Document[];
  
  // New nested group helpers
  getChildGroups: (parentGroupId: string | null, kbId: string) => Group[];
  getGroupDepth: (groupId: string) => number;
  getGroupAncestors: (groupId: string) => Group[];  // Breadcrumb helper
  getDescendantGroupIds: (groupId: string) => string[];  // Cascade delete helper
}

const generateId = () => Math.random().toString(36).substring(2, 9);

// Preset Mock Data
const initialKBs: KnowledgeBase[] = [
  {
    id: 'kb-frontend',
    name: '大前端',
    description: '大前端技术积累与架构演进，包含 HTML, CSS, TS, Vue/React, Webpack/Vite 等工程化基建。',
    icon: '#f97316', // Orange
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 1,
  },
  {
    id: 'kb-product',
    name: '核心产品规划',
    description: '核心产品的 PRD、路线图及年度规划文档。',
    icon: '#3b82f6', // Blue
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10,
    updatedAt: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: 'kb-arch',
    name: '研发架构库',
    description: '后端架构设计、微服务治理、前后端接口标准与协议规范。',
    icon: '#10b981', // Emerald
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 8,
    updatedAt: Date.now() - 1000 * 60 * 60 * 20,
  },
  {
    id: 'kb-inspiration',
    name: '个人灵感收集',
    description: '好玩的点子、交互参考、设计素材 and 日常碎片记录。',
    icon: '#a855f7', // Purple
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 20,
    updatedAt: Date.now() - 1000 * 60 * 60 * 22,
  },
];

const initialGroups: Group[] = [
  {
    id: 'group-basic',
    kbId: 'kb-frontend',
    parentGroupId: null,
    depth: 0,
    name: '01. 前端基础',
    order: 1,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
  },
  {
    id: 'group-html',
    kbId: 'kb-frontend',
    parentGroupId: 'group-basic',
    depth: 1,
    name: 'HTML',
    order: 1,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3.9,
  },
  {
    id: 'group-css',
    kbId: 'kb-frontend',
    parentGroupId: 'group-basic',
    depth: 1,
    name: 'CSS',
    order: 2,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3.8,
  },
  {
    id: 'group-eng',
    kbId: 'kb-frontend',
    parentGroupId: null,
    depth: 0,
    name: '02. 工程化',
    order: 2,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
  },
  {
    id: 'group-perf',
    kbId: 'kb-frontend',
    parentGroupId: null,
    depth: 0,
    name: '03. 性能优化',
    order: 3,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
  },
];

const initialDocs: Document[] = [
  {
    id: 'doc-html-semantic',
    kbId: 'kb-frontend',
    groupId: 'group-html',
    title: 'HTML 语义化总结',
    content: `
      <h1>HTML 语义化总结</h1>
      <p>HTML 语义化是指根据内容的结构化（内容泥沙俱下），选择合适的标签（划分区域）。合理地选择标签能够让页面内容结构化，便于浏览器、搜索引擎解析，提高可访问性。</p>
      <h2>一、语义化标签的优势</h2>
      <ul>
        <li><strong>利于 SEO</strong>：搜索引擎的爬虫依赖于标记来确定上下文和各个关键字的权重。</li>
        <li><strong>便于团队开发与维护</strong>：语义化使得代码更具可读性，方便开发者阅读和理解。</li>
        <li><strong>提升用户体验</strong>：例如在没有 CSS 样式时，页面也能呈现出清晰的结构。</li>
      </ul>
    `,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
  },
  {
    id: 'doc-css-layout',
    kbId: 'kb-frontend',
    groupId: 'group-css',
    title: 'CSS 布局指南',
    content: `
      <h1>CSS 布局指南</h1>
      <p>CSS 布局是网页设计的基石。从传统的 Float 浮动布局，到主流的 Flexbox 弹性盒子布局，再到二维的 Grid 网格布局，CSS 提供了强大的排版能力。</p>
      <h2>一、Flexbox 常用属性</h2>
      <p>Flex 容器属性有：<code>flex-direction</code>, <code>justify-content</code>, <code>align-items</code> 等。</p>
    `,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 1.5,
  },
  {
    id: 'doc-vite-analysis',
    kbId: 'kb-frontend',
    groupId: 'group-eng',
    title: 'Vite 原理解析',
    content: `
      <h1>Vite 原理解析</h1>
      <p>Vite 是一种新型的前端构建工具，它利用浏览器原生 ES 模块导入的能力，提供了极快的冷启动和热更新体验。</p>
      <h2>一、整体架构</h2>
      <p>Vite 的核心思想是将开发服务器作为 ESM 的载体，在开发环境下直接返回原生 ES 模块，浏览器按需加载，从而跳过了打包这一耗时步骤。</p>
      <h2>二、依赖预构建</h2>
      <p>Vite 使用 esbuild 对依赖进行预构建，将 CommonJS 或 UMD 格式 of 依赖转换为 ESM 格式，缓存在 node_modules/.vite 中。</p>
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
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    updatedAt: Date.now() - 1000 * 60 * 60 * 10,
  },
  {
    id: 'doc-webpack-vite',
    kbId: 'kb-frontend',
    groupId: 'group-eng',
    title: 'Webpack 与 Vite 对比',
    content: `
      <h1>Webpack 与 Vite 对比</h1>
      <p>Webpack 是一个传统的静态模块打包工具，需要先递归构建依赖图然后打包生成 bundle；而 Vite 利用原生 ESM 实现了按需编译，极大地加快了启动 and 更新速度。</p>
    `,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    updatedAt: Date.now() - 1000 * 60 * 60 * 11,
  },
  {
    id: 'doc-prd-ai',
    kbId: 'kb-product',
    groupId: null,
    title: '智能批改模块 - PRD需求文档与 AI Prompt 联调记录',
    content: `
      <h1>智能批改模块 - PRD需求文档与 AI Prompt 联调记录</h1>
      <p>本文档记录了智能批改模块的详细 PRD 规范，以及在与后端 LLM (Large Language Model) 联调过程中的 Prompt 版本迭代历史。</p>
      <h2>一、需求背景</h2>
      <p>通过 AI 对学生的实验报告、作业进行自动批改，指出错误并给出修改建议，降低教师批改负担。</p>
    `,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 1,
    updatedAt: Date.now() - 1000 * 60 * 60 * 9,
  },
  {
    id: 'doc-student-flow',
    kbId: 'kb-arch',
    groupId: null,
    title: '学生实验模块 - 前后端交互与数据流转架构设计',
    content: `
      <h1>学生实验模块 - 前后端交互与数据流转架构设计</h1>
      <p>详细规定了学生在实验过程中的实时步骤存档、数据同步策略、以及断网重连下的 LocalStorage 暂存机制。</p>
    `,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    updatedAt: Date.now() - 1000 * 60 * 60 * 22,
  },
  {
    id: 'doc-course-table',
    kbId: 'kb-arch',
    groupId: null,
    title: '课程知识库模块 - 数据表结构定义 (V1.2)',
    content: `
      <h1>课程知识库模块 - 数据表结构定义 (V1.2)</h1>
      <p>定义了 <code>course_kb</code>, <code>course_doc</code>, <code>doc_chunk</code>, <code>vector_index</code> 等数据表的关系以及主外键约束。</p>
    `,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    updatedAt: Date.now() - 1000 * 60 * 60 * 25,
  },
  {
    id: 'doc-bar-inspiration',
    kbId: 'kb-inspiration',
    groupId: null,
    title: '共振酒吧 (Resonance Bar) - 视觉素材与海报排版',
    content: `
      <h1>共振酒吧 (Resonance Bar) - 视觉素材与海报排版</h1>
      <p>一些关于共振酒吧 (Resonance Bar) 的视觉灵感。包含蒸汽波、赛博朋克霓虹色调以及网格排版系统参考。</p>
    `,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    updatedAt: Date.now() - 1000 * 60 * 60 * 8,
  },
];

export const useKnowledgeBaseStore = create<KnowledgeBaseStore>((set, get) => ({
  knowledgeBases: initialKBs,
  groups: initialGroups,
  documents: initialDocs,

  // Knowledge Base CRUD
  createKnowledgeBase: (name, description, icon = '#3b82f6') => {
    const id = `kb-${generateId()}`;
    const newKB: KnowledgeBase = {
      id,
      name,
      description,
      icon,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => ({
      knowledgeBases: [...state.knowledgeBases, newKB],
    }));
    return id;
  },

  updateKnowledgeBase: (id, data) => {
    set((state) => ({
      knowledgeBases: state.knowledgeBases.map((kb) =>
          kb.id === id ? { ...kb, ...data, updatedAt: Date.now() } : kb
      ),
    }));
  },

  deleteKnowledgeBase: (id) => {
    set((state) => ({
      knowledgeBases: state.knowledgeBases.filter((kb) => kb.id !== id),
      groups: state.groups.filter((g) => g.kbId !== id),
      documents: state.documents.filter((d) => d.kbId !== id),
    }));
  },

  // Group CRUD
  createGroup: (kbId, parentGroupId, name = '新建分组') => {
    const id = `group-${generateId()}`;
    const groups = get().groups;
    
    let depth = 0;
    if (parentGroupId) {
      const parent = groups.find((g) => g.id === parentGroupId);
      if (parent) {
        depth = parent.depth + 1;
      }
    }
    
    const siblingCount = groups.filter(
      (g) => g.kbId === kbId && g.parentGroupId === parentGroupId
    ).length;

    const newGroup: Group = {
      id,
      kbId,
      parentGroupId,
      depth,
      name,
      order: siblingCount + 1,
      createdAt: Date.now(),
    };
    
    set((state) => ({
      groups: [...state.groups, newGroup],
    }));
    return id;
  },

  updateGroup: (id, data) => {
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, ...data } : g)),
    }));
  },

  deleteGroup: (id) => {
    const descendantIds = get().getDescendantGroupIds(id);
    const deleteGroupIds = [id, ...descendantIds];
    
    set((state) => ({
      groups: state.groups.filter((g) => !deleteGroupIds.includes(g.id)),
      // Cascade delete: Remove documents belonging to any of these groups
      documents: state.documents.filter((doc) => !deleteGroupIds.includes(doc.groupId || '')),
    }));
  },

  // Document CRUD
  createDocument: (kbId, groupId = null, title = '无标题文档') => {
    const id = `doc-${generateId()}`;
    const newDoc: Document = {
      id,
      kbId,
      groupId,
      title,
      content: `<h1>${title}</h1><p>开始书写你的内容...</p>`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => ({
      documents: [...state.documents, newDoc],
    }));
    return id;
  },

  updateDocument: (id, data) => {
    set((state) => ({
      documents: state.documents.map((doc) =>
          doc.id === id ? { ...doc, ...data, updatedAt: Date.now() } : doc
      ),
    }));
  },

  deleteDocument: (id) => {
    set((state) => ({
      documents: state.documents.filter((doc) => doc.id !== id),
    }));
  },

  // Query helpers
  getKnowledgeBase: (id) => {
    return get().knowledgeBases.find((kb) => kb.id === id);
  },

  getGroupsByKb: (kbId) => {
    return get()
        .groups.filter((g) => g.kbId === kbId)
        .sort((a, b) => a.order - b.order);
  },

  getDocumentsByKb: (kbId) => {
    return get().documents.filter((d) => d.kbId === kbId);
  },

  getDocumentsByGroup: (groupId) => {
    return get().documents.filter((d) => d.groupId === groupId);
  },

  getRootDocuments: (kbId) => {
    return get().documents.filter((d) => d.kbId === kbId && d.groupId === null);
  },
  
  getChildGroups: (parentGroupId, kbId) => {
    return get()
      .groups.filter((g) => g.kbId === kbId && g.parentGroupId === parentGroupId)
      .sort((a, b) => a.order - b.order);
  },

  getGroupDepth: (groupId) => {
    const group = get().groups.find((g) => g.id === groupId);
    return group ? group.depth : 0;
  },

  getGroupAncestors: (groupId) => {
    const ancestors: Group[] = [];
    let currentId: string | null = groupId;
    const groups = get().groups;
    while (currentId) {
      const currentGroup = groups.find((g) => g.id === currentId);
      if (currentGroup) {
        ancestors.unshift(currentGroup);
        currentId = currentGroup.parentGroupId;
      } else {
        break;
      }
    }
    return ancestors;
  },

  getDescendantGroupIds: (groupId) => {
    const descendants: string[] = [];
    const traverse = (id: string) => {
      const children = get().groups.filter((g) => g.parentGroupId === id);
      children.forEach((child) => {
        descendants.push(child.id);
        traverse(child.id);
      });
    };
    traverse(groupId);
    return descendants;
  },
}));
