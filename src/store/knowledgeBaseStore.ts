import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { db, deleteDocumentsCascadeInTx } from '../db';
import { useFavoritesStore } from './favoritesStore';
import { saveCoordinator, type SaveUpdates, type DeleteHandle } from '../utils/SaveCoordinator';
import { extractAssetIds } from '../utils/assetUtils';
import { runAssetGC } from '../assets/runAssetGC';

export const MEMO_KB_ID = 'kb-memo-system';

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
  updatedAt: number;
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

  initStore: () => Promise<void>;

  // Knowledge Base CRUD
  createKnowledgeBase: (name: string, description: string, icon?: string) => string;
  updateKnowledgeBase: (id: string, data: Partial<KnowledgeBase>) => void;
  deleteKnowledgeBase: (id: string) => Promise<void>;

  // Group CRUD
  createGroup: (kbId: string, parentGroupId: string | null, name?: string) => string;
  updateGroup: (id: string, data: Partial<Group>) => void;
  deleteGroup: (id: string) => Promise<void>;

  // Document CRUD
  createDocument: (kbId: string, groupId?: string | null, title?: string) => string;
  updateDocument: (id: string, data: Partial<Document>) => void;
  scheduleDocumentAutosave: (id: string, updates: SaveUpdates) => void;
  persistDocumentNow: (id: string, updates: SaveUpdates) => Promise<void>;
  flushDocumentAutosave: (id: string) => Promise<void>;
  createManualVersion: (docId: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;

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

  // Memo operations
  getMemos: () => Document[];
  createMemo: (title?: string) => string;
  moveDocument: (id: string, targetKbId: string, targetGroupId: string | null) => void;
  moveGroup: (id: string, targetKbId: string, targetParentGroupId: string | null) => { success: boolean; error?: string };
  restoreVersion: (versionId: string) => Promise<{ restored: boolean; missingAssetIds?: string[] }>;
}

const generateId = () => nanoid(12);

const enforceVersionLimitInTx = async (tx: any, docId: string) => {
  try {
    const versions = await tx.table('documentVersions').where('docId').equals(docId).toArray();
    const targetVersions = versions
      .filter((v: any) => v.saveType === 'auto' || v.saveType === 'manual')
      .sort((a: any, b: any) => a.createdAt - b.createdAt);
    if (targetVersions.length > 50) {
      const toDeleteCount = targetVersions.length - 50;
      const autoVersions = targetVersions.filter((v: any) => v.saveType === 'auto');
      const toDeleteIds = (autoVersions.length >= toDeleteCount ? autoVersions : targetVersions)
        .slice(0, toDeleteCount)
        .map((v: any) => v.id);
      await tx.table('documentVersions').bulkDelete(toDeleteIds);
    }
  } catch (err) {
    console.error('Failed to enforce version limit:', err);
    throw err;
  }
};

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
  {
    id: MEMO_KB_ID,
    name: '小记',
    description: '轻量化小记知识库',
    icon: '#ec4899', // Pink
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 1,
    updatedAt: Date.now() - 1000 * 60 * 60 * 2,
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
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
  },
  {
    id: 'group-html',
    kbId: 'kb-frontend',
    parentGroupId: 'group-basic',
    depth: 1,
    name: 'HTML',
    order: 1,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3.9,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 3.9,
  },
  {
    id: 'group-css',
    kbId: 'kb-frontend',
    parentGroupId: 'group-basic',
    depth: 1,
    name: 'CSS',
    order: 2,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3.8,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 3.8,
  },
  {
    id: 'group-eng',
    kbId: 'kb-frontend',
    parentGroupId: null,
    depth: 0,
    name: '02. 工程化',
    order: 2,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
  },
  {
    id: 'group-perf',
    kbId: 'kb-frontend',
    parentGroupId: null,
    depth: 0,
    name: '03. 性能优化',
    order: 3,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
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
  {
    id: 'memo-1',
    kbId: MEMO_KB_ID,
    groupId: null,
    title: '今日待办与灵感',
    content: `
      <h1>今日待办与灵感</h1>
      <p>这里记录了今天的一些灵感：</p>
      <ul>
        <li>调研 TipTap 扩展支持</li>
        <li>梳理 AI 写作的界面交互流</li>
        <li>下班买点水果</li>
      </ul>
    `,
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
    updatedAt: Date.now() - 1000 * 60 * 60 * 4,
  },
  {
    id: 'memo-2',
    kbId: MEMO_KB_ID,
    groupId: null,
    title: 'React 19 Concurrent Features 笔记',
    content: `
      <h1>React 19 Concurrent Features 笔记</h1>
      <p>主要是对 <code>useActionState</code> 和 <code>useOptimistic</code> 的使用场景进行对比。前者用于处理异步 Action 的 State 转换，后者用于处理乐观更新。</p>
    `,
    createdAt: Date.now() - 1000 * 60 * 60 * 20,
    updatedAt: Date.now() - 1000 * 60 * 60 * 18,
  },
];

const internalPersistDocument = async (id: string, updates: SaveUpdates) => {
  const now = Date.now();
  await db.transaction('rw', [db.documents, db.documentVersions, db.assets], async (tx) => {
    const docTable = tx.table('documents');
    const verTable = tx.table('documentVersions');

    const existingDoc = await docTable.get(id);
    if (!existingDoc) return;

    const oldContent = existingDoc.content || '';
    const newContent = updates.content !== undefined ? updates.content : oldContent;
    const newTitle = updates.title !== undefined ? updates.title : existingDoc.title;

    await docTable.update(id, {
      title: newTitle,
      content: newContent,
      updatedAt: now,
    });

    if (updates.content !== undefined) {
      const oldAssets = extractAssetIds(oldContent);
      const newAssets = extractAssetIds(newContent);

      let isStructuralDelete = false;
      for (const assetId of oldAssets) {
        if (!newAssets.has(assetId)) {
          isStructuralDelete = true;
          break;
        }
      }

      const versions = await verTable.where('docId').equals(id).toArray();
      const autoVersions = versions
        .filter((v: any) => v.saveType === 'auto')
        .sort((a: any, b: any) => a.createdAt - b.createdAt);
      const latestVersion = autoVersions[autoVersions.length - 1];
      const FIVE_MINUTES = 5 * 60 * 1000;

      if (!isStructuralDelete && latestVersion && (now - latestVersion.createdAt < FIVE_MINUTES)) {
        await verTable.update(latestVersion.id, {
          content: newContent,
          title: newTitle,
        });
      } else {
        if (isStructuralDelete) {
          const checkpointId = `ver-${nanoid(12)}`;
          await verTable.add({
            id: checkpointId,
            docId: id,
            title: existingDoc.title,
            content: oldContent,
            createdAt: now - 1,
            saveType: 'auto',
          });
        }

        const versionId = `ver-${nanoid(12)}`;
        await verTable.add({
          id: versionId,
          docId: id,
          title: newTitle,
          content: newContent,
          createdAt: now,
          saveType: 'auto',
        });

        await enforceVersionLimitInTx(tx, id);
      }
    }
  });

  if (updates.content !== undefined) {
    runAssetGC(id).catch((err) => console.error('Asset GC error:', err));
  }
};

export const useKnowledgeBaseStore = create<KnowledgeBaseStore>((set, get) => ({
  knowledgeBases: [],
  groups: [],
  documents: [],

  initStore: async () => {
    try {
      const kbCount = await db.knowledgeBases.count();
      if (kbCount === 0) {
        await db.knowledgeBases.bulkAdd(initialKBs);
        await db.groups.bulkAdd(initialGroups);
        await db.documents.bulkAdd(initialDocs);
      }
      
      const kbs = await db.knowledgeBases.toArray();
      const grps = await db.groups.toArray();
      const docs = await db.documents.toArray();
      
      set({
        knowledgeBases: kbs,
        groups: grps.sort((a, b) => a.order - b.order),
        documents: docs,
      });
    } catch (error) {
      console.error('Failed to initialize KnowledgeBaseStore from Dexie:', error);
    }
  },



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
    db.knowledgeBases.add(newKB).catch(err => console.error('Dexie error:', err));
    set((state) => ({
      knowledgeBases: [...state.knowledgeBases, newKB],
    }));
    return id;
  },

  updateKnowledgeBase: (id, data) => {
    const updatedAt = Date.now();
    db.knowledgeBases.update(id, { ...data, updatedAt }).catch(err => console.error('Dexie error:', err));
    set((state) => ({
      knowledgeBases: state.knowledgeBases.map((kb) =>
          kb.id === id ? { ...kb, ...data, updatedAt } : kb
      ),
    }));
  },

  deleteKnowledgeBase: async (id) => {
    let docIds: string[] = [];
    let handle: DeleteHandle | null = null;

    try {
      // 1. 在开启写事务前预先从 DB 识别并建立保存屏障（切勿在 Dexie 事务回调内 await 非 IDB 的外部 Promise）
      const initialDocs = await db.documents.where('kbId').equals(id).toArray();
      docIds = initialDocs.map((d) => d.id);
      handle = await saveCoordinator.prepareDelete(docIds);

      // 2. 开启原子写事务
      await db.transaction(
        'rw',
        [db.knowledgeBases, db.groups, db.documents, db.documentVersions, db.assets, db.favoriteItems],
        async (tx) => {
          const dbDocs = await tx.table('documents').where('kbId').equals(id).toArray();
          const dbGroups = await tx.table('groups').where('kbId').equals(id).toArray();
          docIds = dbDocs.map((d) => d.id);
          const groupIds = dbGroups.map((g) => g.id);

          await tx.table('knowledgeBases').delete(id);
          if (groupIds.length > 0) {
            await tx.table('groups').bulkDelete(groupIds);
          }
          if (docIds.length > 0) {
            await deleteDocumentsCascadeInTx(tx, docIds);
          }
        }
      );
    } catch (err) {
      const h = handle as DeleteHandle | null;
      if (h) h.rollback(internalPersistDocument);
      console.error(`Failed to delete knowledge base ${id} in Dexie transaction:`, err);
      throw err;
    }

    // 数据库物理删除成功后，提交屏障并更新内存状态
    const h = handle as DeleteHandle | null;
    if (h) h.commit();

    try {
      if (docIds.length > 0) {
        const docIdSet = new Set(docIds);
        useFavoritesStore.setState((state) => ({
          items: state.items.filter((item) => !docIdSet.has(item.docId)),
        }));
      }

      set((state) => ({
        knowledgeBases: state.knowledgeBases.filter((kb) => kb.id !== id),
        groups: state.groups.filter((g) => g.kbId !== id),
        documents: state.documents.filter((d) => d.kbId !== id),
      }));
    } catch (postCommitErr) {
      console.error('Post-commit state sync failed, re-initializing stores from DB:', postCommitErr);
      await Promise.all([
        get().initStore(),
        useFavoritesStore.getState().initStore(),
      ]);
    }
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
      updatedAt: Date.now(),
    };
    db.groups.add(newGroup).catch(err => console.error('Dexie error:', err));
    set((state) => ({
      groups: [...state.groups, newGroup],
    }));
    return id;
  },

  updateGroup: (id, data) => {
    const updatedAt = Date.now();
    db.groups.update(id, { ...data, updatedAt }).catch(err => console.error('Dexie error:', err));
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, ...data, updatedAt } : g)),
    }));
  },

  deleteGroup: async (id) => {
    let docIds: string[] = [];
    let deleteGroupIdsSet = new Set<string>([id]);
    let handle: DeleteHandle | null = null;

    try {
      // 1. 事务前收集分组与文档并建立屏障
      const allGroupsInit = await db.groups.toArray();
      deleteGroupIdsSet = new Set<string>([id]);
      let addedInit = true;
      while (addedInit) {
        addedInit = false;
        for (const g of allGroupsInit) {
          if (g.parentGroupId && deleteGroupIdsSet.has(g.parentGroupId) && !deleteGroupIdsSet.has(g.id)) {
            deleteGroupIdsSet.add(g.id);
            addedInit = true;
          }
        }
      }
      const initialDocs = await db.documents.toArray();
      docIds = initialDocs.filter((d) => d.groupId && deleteGroupIdsSet.has(d.groupId)).map((d) => d.id);
      handle = await saveCoordinator.prepareDelete(docIds);

      // 2. 开启原子写事务
      await db.transaction(
        'rw',
        [db.groups, db.documents, db.documentVersions, db.assets, db.favoriteItems],
        async (tx) => {
          const allGroups = await tx.table('groups').toArray();
          deleteGroupIdsSet = new Set<string>([id]);
          
          let added = true;
          while (added) {
            added = false;
            for (const g of allGroups) {
              if (g.parentGroupId && deleteGroupIdsSet.has(g.parentGroupId) && !deleteGroupIdsSet.has(g.id)) {
                deleteGroupIdsSet.add(g.id);
                added = true;
              }
            }
          }

          const deleteGroupIds = Array.from(deleteGroupIdsSet);
          const dbDocs = await tx.table('documents').toArray();
          docIds = dbDocs.filter((d) => d.groupId && deleteGroupIdsSet.has(d.groupId)).map((d) => d.id);

          await tx.table('groups').bulkDelete(deleteGroupIds);
          if (docIds.length > 0) {
            await deleteDocumentsCascadeInTx(tx, docIds);
          }
        }
      );
    } catch (err) {
      const h = handle as DeleteHandle | null;
      if (h) h.rollback(internalPersistDocument);
      console.error(`Failed to delete group ${id} in Dexie transaction:`, err);
      throw err;
    }

    const h = handle as DeleteHandle | null;
    if (h) h.commit();

    try {
      if (docIds.length > 0) {
        const docIdSet = new Set(docIds);
        useFavoritesStore.setState((state) => ({
          items: state.items.filter((item) => !docIdSet.has(item.docId)),
        }));
      }

      set((state) => ({
        groups: state.groups.filter((g) => !deleteGroupIdsSet.has(g.id)),
        documents: state.documents.filter((doc) => !deleteGroupIdsSet.has(doc.groupId || '')),
      }));
    } catch (postCommitErr) {
      console.error('Post-commit state sync failed, re-initializing stores from DB:', postCommitErr);
      await Promise.all([
        get().initStore(),
        useFavoritesStore.getState().initStore(),
      ]);
    }
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
    db.documents.add(newDoc).catch(err => console.error('Dexie error:', err));
    set((state) => ({
      documents: [...state.documents, newDoc],
    }));
    return id;
  },

  scheduleDocumentAutosave: (id, updates) => {
    saveCoordinator.scheduleDocumentAutosave(id, updates, internalPersistDocument);
  },

  persistDocumentNow: async (id, updates) => {
    await saveCoordinator.persistDocumentNow(id, updates, internalPersistDocument);
  },

  flushDocumentAutosave: async (id) => {
    await saveCoordinator.pauseAndFlush(id, internalPersistDocument);
    saveCoordinator.resume(id, internalPersistDocument);
  },

  createManualVersion: async (docId) => {
    await saveCoordinator.pauseAndFlush(docId, internalPersistDocument);
    return await saveCoordinator.runExclusive(docId, async () => {
      try {
        const now = Date.now();
        await db.transaction('rw', [db.documents, db.documentVersions], async (tx) => {
          const docTable = tx.table('documents');
          const verTable = tx.table('documentVersions');

          const latestDbDoc = await docTable.get(docId);
          if (!latestDbDoc) return;

          const versionId = `ver-${nanoid(12)}`;
          await verTable.add({
            id: versionId,
            docId,
            title: latestDbDoc.title,
            content: latestDbDoc.content,
            createdAt: now,
            saveType: 'manual',
          });

          await enforceVersionLimitInTx(tx, docId);
        });
      } finally {
        saveCoordinator.resume(docId, internalPersistDocument);
      }
    });
  },

  updateDocument: (id, data) => {
    const updatedAt = Date.now();
    // 1. Synchronously update Zustand memory state for immediate UI feedback (optimistic update)
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, ...data, updatedAt } : doc
      ),
    }));

    // 2. Schedule or persist updates
    const updates: SaveUpdates = {
      content: data.content,
      title: data.title,
    };

    if (data.content !== undefined) {
      saveCoordinator.scheduleDocumentAutosave(id, updates, internalPersistDocument);
    } else if (data.title !== undefined) {
      saveCoordinator.persistDocumentNow(id, updates, internalPersistDocument);
    }
  },

  restoreVersion: async (versionId) => {
    const version = await db.documentVersions.get(versionId);
    if (!version) throw new Error('Version not found');

    const docId = version.docId;

    // 1. Safely pause and flush any pending autosaves for this docId
    await saveCoordinator.pauseAndFlush(docId, internalPersistDocument);

    // 2. Run inside exclusive lock for docId
    return await saveCoordinator.runExclusive(docId, async () => {
      try {
        // 3. Perform ALL operations inside a single atomic Dexie transaction!
        const result = await db.transaction('rw', [db.documents, db.documentVersions, db.assets], async (tx) => {
          const docTable = tx.table('documents');
          const verTable = tx.table('documentVersions');
          const assetTable = tx.table('assets');

          const targetVer = await verTable.get(versionId);
          if (!targetVer) throw new Error('Target version not found');

          const latestDbDoc = await docTable.get(docId);
          if (!latestDbDoc) throw new Error('Document not found in DB');

          // Pre-flight check: verify all assetIds in targetVer content exist in IndexedDB and asset.docId === docId
          const requiredAssetIds = extractAssetIds(targetVer.content);
          const missingAssetIds: string[] = [];
          for (const assetId of requiredAssetIds) {
            const asset = await assetTable.get(assetId);
            if (!asset || !asset.blob || asset.docId !== docId) {
              missingAssetIds.push(assetId);
            }
          }

          if (missingAssetIds.length > 0) {
            return { restored: false, missingAssetIds };
          }

          const now = Date.now();

          // Backup current document state into documentVersions table before restoring
          const backupVersionId = `ver-${nanoid(12)}`;
          await verTable.add({
            id: backupVersionId,
            docId: docId,
            title: latestDbDoc.title,
            content: latestDbDoc.content,
            createdAt: now - 1,
            saveType: 'auto',
          });

          await enforceVersionLimitInTx(tx, docId);

          // Update document with target version content
          await docTable.update(docId, {
            title: targetVer.title,
            content: targetVer.content,
            updatedAt: now,
          });

          return { restored: true, title: targetVer.title, content: targetVer.content, updatedAt: now };
        });

        if (!result.restored || !result.title || !result.content || !result.updatedAt) {
          return { restored: false, missingAssetIds: result.missingAssetIds };
        }

        const { title: restoredTitle, content: restoredContent, updatedAt: restoredUpdatedAt } = result;

        // 4. Update Zustand after transaction succeeds
        useKnowledgeBaseStore.setState((state) => ({
          documents: state.documents.map((d) =>
            d.id === docId ? { ...d, title: restoredTitle, content: restoredContent, updatedAt: restoredUpdatedAt } : d
          ),
        }));

        // Run Asset GC after restoring
        runAssetGC(docId).catch((err) => console.error('Asset GC error after restore:', err));

        return { restored: true };
      } finally {
        saveCoordinator.resume(docId, internalPersistDocument);
      }
    });
  },

  deleteDocument: async (id) => {
    let handle: DeleteHandle | null = null;

    try {
      handle = await saveCoordinator.prepareDelete([id]);

      await db.transaction(
        'rw',
        [db.documents, db.documentVersions, db.assets, db.favoriteItems],
        async (tx) => {
          await deleteDocumentsCascadeInTx(tx, [id]);
        }
      );
    } catch (err) {
      const h = handle as DeleteHandle | null;
      if (h) h.rollback(internalPersistDocument);
      console.error(`Failed to delete document ${id} in Dexie transaction:`, err);
      throw err;
    }

    const h = handle as DeleteHandle | null;
    if (h) h.commit();

    try {
      useFavoritesStore.setState((state) => ({
        items: state.items.filter((item) => item.docId !== id),
      }));

      set((state) => ({
        documents: state.documents.filter((doc) => doc.id !== id),
      }));
    } catch (postCommitErr) {
      console.error('Post-commit state sync failed, re-initializing stores from DB:', postCommitErr);
      await Promise.all([
        get().initStore(),
        useFavoritesStore.getState().initStore(),
      ]);
    }
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

  // Memo operations
  getMemos: () => {
    return get().documents.filter((d) => d.kbId === MEMO_KB_ID);
  },

  createMemo: (title = '未命名小记') => {
    return get().createDocument(MEMO_KB_ID, null, title);
  },

  moveDocument: (id, targetKbId, targetGroupId) => {
    const updatedAt = Date.now();
    db.documents.update(id, { kbId: targetKbId, groupId: targetGroupId, updatedAt }).catch(err => console.error('Dexie error:', err));
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, kbId: targetKbId, groupId: targetGroupId, updatedAt } : doc
      ),
    }));
  },

  moveGroup: (groupId, targetKbId, targetParentGroupId) => {
    const G = get().groups.find((g) => g.id === groupId);
    if (!G) return { success: false, error: '未找到源分组' };

    // 1. Circularity check
    const descendantIds = get().getDescendantGroupIds(groupId);
    if (targetParentGroupId === groupId || (targetParentGroupId && descendantIds.includes(targetParentGroupId))) {
      return { success: false, error: '不能将分组移动到自身或其子分组下' };
    }

    // 2. Depth check
    const descendants = descendantIds.map((id) => get().groups.find((g) => g.id === id)!).filter(Boolean);
    const oldDepthOfG = G.depth;
    let newDepthOfG = 0;
    if (targetParentGroupId) {
      const targetParent = get().groups.find((g) => g.id === targetParentGroupId);
      if (!targetParent) return { success: false, error: '未找到目标父分组' };
      newDepthOfG = targetParent.depth + 1;
    }

    const maxSubtreeDepthDiff = descendants.reduce((max, d) => Math.max(max, d.depth - oldDepthOfG), 0);
    if (newDepthOfG + maxSubtreeDepthDiff > 5) {
      return { success: false, error: '移动后层级深度超过了系统最大 6 层限制' };
    }

    // 3. Move group, descendants and all their documents
    const allGroupIds = [groupId, ...descendantIds];
    
    // Save updates in Dexie
    db.groups.update(groupId, { kbId: targetKbId, parentGroupId: targetParentGroupId, depth: newDepthOfG, updatedAt: Date.now() }).catch(err => console.error(err));
    descendantIds.forEach((descId) => {
      const descG = get().groups.find(g => g.id === descId);
      if (descG) {
        db.groups.update(descId, { kbId: targetKbId, depth: newDepthOfG + (descG.depth - oldDepthOfG), updatedAt: Date.now() }).catch(err => console.error(err));
      }
    });
    db.documents.where('groupId').anyOf(allGroupIds).modify({ kbId: targetKbId, updatedAt: Date.now() }).catch(err => console.error(err));

    set((state) => {
      // Update groups
      const updatedGroups = state.groups.map((g) => {
        if (g.id === groupId) {
          return {
            ...g,
            kbId: targetKbId,
            parentGroupId: targetParentGroupId,
            depth: newDepthOfG,
            updatedAt: Date.now(),
          };
        } else if (descendantIds.includes(g.id)) {
          return {
            ...g,
            kbId: targetKbId,
            depth: newDepthOfG + (g.depth - oldDepthOfG),
            updatedAt: Date.now(),
          };
        }
        return g;
      });

      // Update documents
      const updatedDocs = state.documents.map((doc) => {
        if (doc.groupId && allGroupIds.includes(doc.groupId)) {
          return {
            ...doc,
            kbId: targetKbId,
            updatedAt: Date.now(),
          };
        }
        return doc;
      });

      return {
        groups: updatedGroups,
        documents: updatedDocs,
      };
    });

    return { success: true };
  },
}));
