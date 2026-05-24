import { create } from 'zustand';

export interface ReferencedDoc {
  id: string;
  title: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  // R1 Specific properties
  isThinking?: boolean;
  thinkingContent?: string;
  webSearchUrls?: { title: string; url: string; }[];
  referencedDocs?: ReferencedDoc[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
}

interface AIWritingStore {
  sessions: ChatSession[];
  messages: ChatMessage[];
  activeSessionId: string | null;
  isThinkingEnabled: boolean;
  isWebSearchEnabled: boolean;

  // Actions
  createSession: (title?: string) => string;
  deleteSession: (id: string) => void;
  setActiveSessionId: (id: string | null) => void;
  setIsThinkingEnabled: (enabled: boolean) => void;
  setIsWebSearchEnabled: (enabled: boolean) => void;
  sendMessage: (sessionId: string, content: string, referencedDocs?: ReferencedDoc[]) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

// Mock data sessions
const initialSessions: ChatSession[] = [
  {
    id: 'session-nextjs',
    title: '关于 Next.js 15 性能优化',
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: 'session-container-queries',
    title: 'CSS Container Queries 落地指南',
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  }
];

// Mock data messages
const initialMessages: ChatMessage[] = [
  {
    id: 'msg-nextjs-u1',
    sessionId: 'session-nextjs',
    role: 'user',
    content: '介绍一下 Next.js 15 App Router 的核心性能优化手段，特别是关于 PPR (Partial Prerendering) 和 Caching 的变化。',
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: 'msg-nextjs-a1',
    sessionId: 'session-nextjs',
    role: 'assistant',
    content: `在 Next.js 15 中，App Router 的缓存机制与渲染策略发生了一些重大更新。以下是针对 **PPR (部分预渲染)** 和 **缓存策略变化** 的核心优化指南：

### 1. 缓存策略的重要变化 (默认不缓存)
* **Fetch 请求**: 在 Next.js 15 中，\`fetch\` 请求默认不再进行强缓存（即 \`force-cache\`）。现在默认是 \`no-store\`，这保证了每次请求获取最新数据。如果需要缓存，必须显式声明 \`cache: 'force-cache'\`。
* **GET 路由处理程序 (Route Handlers)**: \`GET\` 方法的 Route Handlers 现在默认也不再缓存。如果需要缓存，可以使用 \`export const dynamic = 'force-static'\`。
* **客户端路由缓存 (Client Router Cache)**: 页面组件的客户端缓存时间现在默认是 \`0\`（之前是 30 秒），这意味着在页面间导航时，会重新获取 Server Components 数据。

### 2. PPR (Partial Prerendering)
* PPR 允许你在同一路由中结合静态和动态渲染。Next.js 会在构建时预渲染静态外壳（如侧边栏、导航栏），并将动态内容（如用户信息、购物车）用 \`Suspense\` 包裹。当用户访问时，立即发送静态外壳，同时在后台流式传输动态内容。
* **配置方式**: 在 \`next.config.js\` 中开启 \`experimental.ppr: 'incremental'\`，并在具体页面或布局中导出 \`experimental_ppr = true\`。`,
    createdAt: Date.now() - 1000 * 60 * 60 * 2 + 5000,
    thinkingContent: '用户问到了 Next.js 15 App Router 的性能优化，着重在 PPR 和 Caching。需要涵盖：\n1. PPR 的概念及工作原理\n2. Next.js 15 缓存策略的改变（默认从强缓存变为不缓存，如 fetch 的 cache 默认值）\n3. Client-side router cache 的变化\n4. Server Components 的渲染策略\n5. 提供代码或具体的配置指导。',
    webSearchUrls: [
      { title: 'Next.js 15 Caching Updates', url: 'https://nextjs.org/blog/next-15' },
      { title: 'Partial Prerendering in Next.js', url: 'https://nextjs.org/docs/app/building-your-application/rendering/partial-prerendering' }
    ]
  },
  {
    id: 'msg-cq-u1',
    sessionId: 'session-container-queries',
    role: 'user',
    content: 'Container Queries 相比 Media Queries 有什么核心优势？怎么在 React 组件中优雅地使用？',
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: 'msg-cq-a1',
    sessionId: 'session-container-queries',
    role: 'assistant',
    content: `Container Queries（容器查询）的核心优势在于它**基于父容器的宽度**而不是整个浏览器视口的宽度来进行样式响应。这使得真正的“组件化响应式设计”成为可能。

### 核心优势
1. **真正的组件独立性**：组件可以被放置在窄侧边栏、宽主体区或弹窗中，它会自动根据所处容器的大小调整样式，而不需要关心外部布局。
2. **可复用性极高**：避免了在父级页面为不同位置的同一组件编写冗余的媒体查询代码。

### 在 React 中使用
现代浏览器已原生支持 Container Queries。在 CSS 中：
\`\`\`css
/* 定义容器 */
.card-container {
  container-type: inline-size;
  container-name: card;
}

/* 编写容器查询 */
@container card (min-width: 400px) {
  .card-layout {
    display: flex;
    flex-direction: row;
  }
}
\`\`\`
在 React 组件中，可以通过设置一个容器 wrapper，并使用对应的 CSS module 或是 Tailwind (使用 \`@\` 语法如 \`@lg:flex-row\`) 来快速落地。`,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 + 4000,
    thinkingContent: '分析 Container Queries 相比 Media Queries 的优势，并给出在 React 中使用的最佳实践。需要举例说明容器设置和查询写法，最好提到现代 Tailwind 的容器查询插件用法。'
  }
];

export const useAIWritingStore = create<AIWritingStore>((set, get) => ({
  sessions: initialSessions,
  messages: initialMessages,
  activeSessionId: initialSessions[0]?.id || null,
  isThinkingEnabled: true,
  isWebSearchEnabled: false,

  createSession: (title = '新对话') => {
    const id = `session-${generateId()}`;
    const newSession: ChatSession = {
      id,
      title,
      createdAt: Date.now(),
    };
    set((state) => ({
      sessions: [newSession, ...state.sessions],
      activeSessionId: id,
    }));
    return id;
  },

  deleteSession: (id) => {
    set((state) => {
      const filteredSessions = state.sessions.filter((s) => s.id !== id);
      let newActiveId = state.activeSessionId;
      if (state.activeSessionId === id) {
        newActiveId = filteredSessions[0]?.id || null;
      }
      return {
        sessions: filteredSessions,
        messages: state.messages.filter((m) => m.sessionId !== id),
        activeSessionId: newActiveId,
      };
    });
  },

  setActiveSessionId: (id) => {
    set({ activeSessionId: id });
  },

  setIsThinkingEnabled: (enabled) => {
    set({ isThinkingEnabled: enabled });
  },

  setIsWebSearchEnabled: (enabled) => {
    set({ isWebSearchEnabled: enabled });
  },

  sendMessage: (sessionId, content, referencedDocs = []) => {
    const userMsgId = `msg-${generateId()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      sessionId,
      role: 'user',
      content,
      referencedDocs,
      createdAt: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
    }));

    // Update session title if it was default '新对话'
    const session = get().sessions.find((s) => s.id === sessionId);
    if (session && session.title === '新对话') {
      const newTitle = content.length > 15 ? content.substring(0, 15) + '...' : content;
      set((state) => ({
        sessions: state.sessions.map((s) => s.id === sessionId ? { ...s, title: newTitle } : s)
      }));
    }

    // Mock AI reply after 1.5 seconds
    setTimeout(() => {
      const assistantMsgId = `msg-${generateId()}`;
      const thinking = get().isThinkingEnabled;
      const search = get().isWebSearchEnabled;

      let replyContent = `关于您刚才提到的内容：\n\n"${content}"\n\n这是 Duet AI 自动生成的回复（Demo 静态展示）。在实际应用中，这里会接入大语言模型进行实时推理。`;
      
      if (referencedDocs.length > 0) {
        replyContent += `\n\n我已经关注到您引用的知识库文档：${referencedDocs.map(d => `「${d.title}」`).join(', ')}。我们将基于这些文档上下文为您进行智能写作。`;
      }

      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        sessionId,
        role: 'assistant',
        content: replyContent,
        createdAt: Date.now(),
        thinkingContent: thinking ? `深度思考中...\n当前收到用户输入："${content}"\n开启了思考模式，正在检索相关知识点并整理回复逻辑...\n已结合用户引用的 ${referencedDocs.length} 篇文档进行整合。` : undefined,
        webSearchUrls: search ? [
          { title: '谷歌搜索: ' + content.substring(0, 10), url: 'https://www.google.com' },
          { title: '百度百科', url: 'https://baike.baidu.com' }
        ] : undefined
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
      }));
    }, 1500);
  },
}));
