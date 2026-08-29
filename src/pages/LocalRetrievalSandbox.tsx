import { useState } from 'react';
import { ArrowLeft, Database, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { rebuildLocalDocumentIndex } from '../rag/documentIndexer';
import { searchLocalKnowledge } from '../rag/localRetriever';
import type { IndexProgress, IndexRunResult, RetrievedChunk } from '../rag/types';

export default function LocalRetrievalSandbox() {
  const [isIndexing, setIsIndexing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState('浏览器中的本地 AI 模型推理');
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [indexResult, setIndexResult] = useState<IndexRunResult | null>(null);
  const [results, setResults] = useState<RetrievedChunk[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleBuildIndex() {
    setIsIndexing(true);
    setError(null);
    setIndexResult(null);

    try {
      const result = await rebuildLocalDocumentIndex(setProgress);
      setIndexResult(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '本地索引建立失败。');
    } finally {
      setIsIndexing(false);
    }
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);

    try {
      setResults(await searchLocalKnowledge(query));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '本地检索失败。');
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg-panel px-5 py-8 text-text-primary sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft size={16} />
          返回工作台
        </Link>

        <header className="mt-8 border-b border-border-color pb-6">
          <p className="text-sm font-medium text-accent">Developer sandbox</p>
          <h1 className="mt-2 text-2xl font-bold">本地知识库检索验证</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
            使用浏览器端 FP16 Embedding 模型建立文档和小记索引；文档正文与向量均保留在 IndexedDB。
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            当前本地数据源：<code className="font-mono">{window.location.origin}</code>
          </p>
        </header>

        <section className="mt-6 border border-border-color bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">建立或更新索引</h2>
              <p className="mt-1 text-xs text-text-secondary">
                首次执行会加载本地模型；之后只会重建内容、标题或分块规则发生变化的文档。
              </p>
            </div>
            <button
              type="button"
              onClick={handleBuildIndex}
              disabled={isIndexing}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Database size={15} />
              {isIndexing ? '正在建立索引' : '建立本地索引'}
            </button>
          </div>

          {progress && (
            <p className="mt-4 text-sm text-text-secondary">
              {progress.completedDocuments} / {progress.totalDocuments}：{progress.title}
            </p>
          )}
          {indexResult && (
            <div className="mt-4 text-sm text-text-secondary">
              <p>
                本次完成：新增或更新 {indexResult.indexedDocuments} 篇，跳过{' '}
                {indexResult.skippedDocuments} 篇，失败 {indexResult.failedDocuments} 篇。
              </p>
              {indexResult.failures.length > 0 && (
                <ul className="mt-3 space-y-1 border-l-2 border-rose-200 pl-3 text-xs text-rose-700">
                  {indexResult.failures.slice(0, 3).map((failure) => (
                    <li key={failure.sourceId}>
                      {failure.title}：{failure.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="mt-6 border border-border-color bg-white p-5">
          <h2 className="text-sm font-semibold">检索</h2>
          <div className="mt-4 flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSearch();
              }}
              className="h-10 min-w-0 flex-1 border border-border-color px-3 text-sm outline-none focus:border-accent"
              placeholder="例如：我以前记录过 WebGPU 性能优化吗？"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={isSearching}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border-color px-3 text-sm font-medium hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Search size={15} />
              {isSearching ? '检索中' : '检索'}
            </button>
          </div>

          {results.length > 0 && (
            <ol className="mt-5 space-y-3">
              {results.map((result, index) => (
                <li key={result.id} className="border-l-2 border-accent/40 pl-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
                    <span>
                      #{index + 1} {result.sourceType === 'memo' ? '小记' : '文档'} · {result.title}
                    </span>
                    <span className="font-mono">{result.score.toFixed(4)}</span>
                  </div>
                  {result.headingPath.length > 0 && (
                    <p className="mt-1 text-xs text-text-secondary">
                      {result.headingPath.join(' > ')}
                    </p>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{result.content}</p>
                </li>
              ))}
            </ol>
          )}

          {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
        </section>
      </div>
    </main>
  );
}
