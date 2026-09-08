import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import AuthGuard from './components/auth/AuthGuard';
import MainLayout from './layouts/MainLayout';
import Workbench from './pages/Workbench';
import { useAIWritingStore } from './store/aiWritingStore';
import { useAuthStore } from './store/authStore';
import { useFavoritesStore } from './store/favoritesStore';
import { useKnowledgeBaseStore } from './store/knowledgeBaseStore';
import { useThemeStore } from './store/themeStore';

const KnowledgeBaseHome = lazy(() => import('./pages/KnowledgeBaseHome'));
const DocEdit = lazy(() => import('./pages/DocEdit'));
const AIWriting = lazy(() => import('./pages/AIWriting'));
const EmbeddingBenchmark = lazy(() => import('./pages/EmbeddingBenchmark'));
const LocalRetrievalSandbox = lazy(() => import('./pages/LocalRetrievalSandbox'));
const MemoHome = lazy(() => import('./pages/MemoHome'));
const MemoEdit = lazy(() => import('./pages/MemoEdit'));
const Favorites = lazy(() => import('./pages/Favorites'));
const DocHistory = lazy(() => import('./pages/DocHistory'));
const Login = lazy(() => import('./pages/Login'));

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

function DataGuard() {
  const [loading, setLoading] = useState(true);
  const userId = useAuthStore((state) => state.user?.id);
  const workspaceId = useAuthStore((state) => state.workspaceId);

  useEffect(() => {
    if (!userId || !workspaceId) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        await useKnowledgeBaseStore.getState().initStore();
        await Promise.all([
          useFavoritesStore.getState().initStore(),
          useAIWritingStore.getState().initStore(),
        ]);
      } catch (error) {
        console.error('Failed to load stores from IndexedDB:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [userId, workspaceId]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-main">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-100 border-t-accent" />
          <div className="text-sm font-medium text-text-primary">正在加载个人空间...</div>
          <div className="text-xs text-text-secondary">正在同步文档与对话</div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

function App() {
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initTheme = useThemeStore((state) => state.initTheme);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    return initTheme();
  }, [initTheme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={lazyRoute(<Login />)} />
        <Route element={<AuthGuard />}>
          <Route element={<DataGuard />}>
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
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
