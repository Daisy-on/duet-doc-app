import { lazy, Suspense, useState, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Workbench from './pages/Workbench';
import { useKnowledgeBaseStore } from './store/knowledgeBaseStore';
import { useFavoritesStore } from './store/favoritesStore';
import { useAIWritingStore } from './store/aiWritingStore';

const KnowledgeBaseHome = lazy(() => import('./pages/KnowledgeBaseHome'));
const DocEdit = lazy(() => import('./pages/DocEdit'));
const AIWriting = lazy(() => import('./pages/AIWriting'));
const EmbeddingBenchmark = lazy(() => import('./pages/EmbeddingBenchmark'));
const LocalRetrievalSandbox = lazy(() => import('./pages/LocalRetrievalSandbox'));
const MemoHome = lazy(() => import('./pages/MemoHome'));
const MemoEdit = lazy(() => import('./pages/MemoEdit'));
const Favorites = lazy(() => import('./pages/Favorites'));
const DocHistory = lazy(() => import('./pages/DocHistory'));

function RouteLoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-bg-main text-sm text-text-secondary">
      页面加载中...
    </div>
  );
}

function lazyRoute(element: ReactNode) {
  return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        await useKnowledgeBaseStore.getState().initStore();
        await Promise.all([
          useFavoritesStore.getState().initStore(),
          useAIWritingStore.getState().initStore(),
        ]);
      } catch (err) {
        console.error('Failed to load stores from IndexedDB:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-main">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-accent to-pink-500 flex items-center justify-center text-white shadow-lg animate-spin">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <div className="text-sm font-bold text-text-primary mt-2">系统初始化中...</div>
          <div className="text-xs text-text-secondary">正在载入本地知识库与会话</div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Workbench />} />
          <Route path="kb/:kbId" element={lazyRoute(<KnowledgeBaseHome />)} />
          <Route path="kb/:kbId/doc/:docId" element={lazyRoute(<DocEdit />)} />
          <Route path="ai-writing/*" element={lazyRoute(<AIWriting />)} />
          <Route path="memo" element={lazyRoute(<MemoHome />)} />
          <Route path="memo/:memoId" element={lazyRoute(<MemoEdit />)} />
          <Route path="favorites" element={lazyRoute(<Favorites />)} />
        </Route>
        <Route path="kb/:kbId/doc/:docId/history" element={lazyRoute(<DocHistory />)} />
        <Route path="dev/embedding-benchmark" element={lazyRoute(<EmbeddingBenchmark />)} />
        <Route path="dev/local-retrieval" element={lazyRoute(<LocalRetrievalSandbox />)} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
