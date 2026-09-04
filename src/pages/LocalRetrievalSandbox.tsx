import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ClipboardList,
  Database,
  Download,
  FileJson,
  Play,
  RefreshCw,
  Search,
  Square,
  Upload,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { rebuildLocalDocumentIndex } from '../rag/documentIndexer';
import {
  createRetrievalEvaluationReport,
  getRetrievalEvaluationCorpusStats,
  listRetrievalEvaluationSources,
  parseRetrievalEvaluationCases,
  runRetrievalEvaluation,
  validateRetrievalEvaluationSources,
  warmupRetrievalEvaluation,
  type RetrievalEvaluationCase,
  type RetrievalEvaluationCorpusStats,
  type RetrievalEvaluationReport,
  type RetrievalEvaluationRun,
} from '../rag/retrievalEvaluation';
import { searchLocalKnowledge } from '../rag/localRetriever';
import type {
  IndexProgress,
  IndexRunResult,
  LocalRetrievalStrategy,
  RetrievedChunk,
} from '../rag/types';

const EVALUATION_CASES_STORAGE_KEY = 'duet-doc:local-rag:evaluation-cases';
const DEFAULT_EVALUATION_LABEL = 'V0-vector-baseline';

function getStoredEvaluationCases(): string {
  return window.localStorage.getItem(EVALUATION_CASES_STORAGE_KEY) ?? '';
}

function getStoredEvaluationCaseDefinitions(): RetrievalEvaluationCase[] {
  const raw = getStoredEvaluationCases();
  if (!raw) return [];

  try {
    return parseRetrievalEvaluationCases(raw);
  } catch {
    return [];
  }
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(value: number): string {
  return `${Math.round(value)} ms`;
}

function getErrorMessage(caughtError: unknown, fallback: string): string {
  return caughtError instanceof Error ? caughtError.message : fallback;
}

function sanitizeFileName(value: string): string {
  const withoutControlCharacters = Array.from(value, (character) =>
    character.charCodeAt(0) < 32 ? '-' : character,
  ).join('');
  return withoutControlCharacters.replace(/[<>:"/\\|?*]/g, '-').trim() || 'local-rag-evaluation';
}

export default function LocalRetrievalSandbox() {
  const [isIndexing, setIsIndexing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [query, setQuery] = useState('浏览器中的本地 AI 模型推理');
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [indexResult, setIndexResult] = useState<IndexRunResult | null>(null);
  const [results, setResults] = useState<RetrievedChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [evaluationInput, setEvaluationInput] = useState(getStoredEvaluationCases);
  const [evaluationCases, setEvaluationCases] = useState(getStoredEvaluationCaseDefinitions);
  const [evaluationLabel, setEvaluationLabel] = useState(DEFAULT_EVALUATION_LABEL);
  const [retrievalStrategy, setRetrievalStrategy] = useState<LocalRetrievalStrategy>('vector');
  const [evaluationProgress, setEvaluationProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [warmupMs, setWarmupMs] = useState<number | null>(null);
  const [corpusStats, setCorpusStats] = useState<RetrievalEvaluationCorpusStats | null>(null);
  const [evaluationRun, setEvaluationRun] = useState<RetrievalEvaluationRun | null>(null);
  const [report, setReport] = useState<RetrievalEvaluationReport | null>(null);
  const [sources, setSources] = useState<Array<{ id: string; title: string }> | null>(null);
  const stopEvaluationRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshCorpusStats(): Promise<RetrievalEvaluationCorpusStats> {
    const stats = await getRetrievalEvaluationCorpusStats();
    setCorpusStats(stats);
    return stats;
  }

  async function handleBuildIndex() {
    setIsIndexing(true);
    setError(null);
    setIndexResult(null);

    try {
      const result = await rebuildLocalDocumentIndex(setProgress);
      setIndexResult(result);
      await refreshCorpusStats();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '本地索引建立失败。'));
    } finally {
      setIsIndexing(false);
    }
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);

    try {
      setResults(await searchLocalKnowledge(query, { strategy: retrievalStrategy }));
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '本地检索失败。'));
    } finally {
      setIsSearching(false);
    }
  }

  async function handleLoadEvaluationCases(raw = evaluationInput) {
    try {
      const parsedCases = parseRetrievalEvaluationCases(raw);
      const availableSources = await listRetrievalEvaluationSources();
      validateRetrievalEvaluationSources(parsedCases, availableSources);
      window.localStorage.setItem(EVALUATION_CASES_STORAGE_KEY, raw);
      setEvaluationInput(raw);
      setEvaluationCases(parsedCases);
      setSources(availableSources);
      setEvaluationRun(null);
      setReport(null);
      setError(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '评测集载入失败。'));
    }
  }

  async function handleUploadEvaluationCases(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await handleLoadEvaluationCases(await file.text());
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '无法读取评测集文件。'));
    } finally {
      event.target.value = '';
    }
  }

  async function handleListSources() {
    try {
      setSources(await listRetrievalEvaluationSources());
      await refreshCorpusStats();
      setError(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '无法读取本地文档清单。'));
    }
  }

  async function handleWarmup() {
    setIsWarmingUp(true);
    setError(null);

    try {
      const stats = await refreshCorpusStats();
      if (stats.chunkCount === 0) {
        throw new Error('当前没有已建立索引的文档，请先建立本地索引。');
      }
      setWarmupMs(await warmupRetrievalEvaluation());
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '模型预热失败。'));
    } finally {
      setIsWarmingUp(false);
    }
  }

  async function handleRunEvaluation() {
    if (evaluationCases.length === 0) {
      setError('请先载入至少一条评测用例。');
      return;
    }

    setIsEvaluating(true);
    setError(null);
    setEvaluationProgress({ completed: 0, total: evaluationCases.length });
    stopEvaluationRef.current = false;

    try {
      const stats = await refreshCorpusStats();
      if (stats.chunkCount === 0) {
        throw new Error('当前没有已建立索引的文档，请先建立本地索引。');
      }
      const availableSources = await listRetrievalEvaluationSources();
      validateRetrievalEvaluationSources(evaluationCases, availableSources);
      setSources(availableSources);

      let activeWarmupMs = warmupMs;
      if (activeWarmupMs === null) {
        setIsWarmingUp(true);
        activeWarmupMs = await warmupRetrievalEvaluation();
        setWarmupMs(activeWarmupMs);
        setIsWarmingUp(false);
      }

      const run = await runRetrievalEvaluation(evaluationCases, {
        strategy: retrievalStrategy,
        shouldContinue: () => !stopEvaluationRef.current,
        onProgress: (completed, total) => setEvaluationProgress({ completed, total }),
      });
      setEvaluationRun(run);
      setReport(createRetrievalEvaluationReport(evaluationLabel, activeWarmupMs, stats, run));
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '批量评测失败。'));
    } finally {
      setIsWarmingUp(false);
      setIsEvaluating(false);
    }
  }

  function handleStopEvaluation() {
    stopEvaluationRef.current = true;
  }

  function handleExportReport() {
    if (!report) return;

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFileName(report.label)}-${report.createdAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-bg-panel px-5 py-8 text-text-primary sm:px-8">
      <div className="mx-auto max-w-5xl">
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
          <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
            使用浏览器端 FP16 Embedding
            模型建立文档和小记索引，并对固定问题集进行可重复的本地检索评测。
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
          {corpusStats && (
            <p className="mt-4 border-t border-border-color pt-3 text-xs text-text-secondary">
              当前语料：{corpusStats.documentCount} 篇文档，{corpusStats.indexedSourceCount}{' '}
              个已索引来源，
              {corpusStats.chunkCount} 个分块。
            </p>
          )}
        </section>

        <section className="mt-6 border border-border-color bg-white p-5">
          <h2 className="text-sm font-semibold">单次检索</h2>
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
        </section>

        <section className="mt-6 border border-border-color bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList size={17} className="text-accent" />
                <h2 className="text-sm font-semibold">批量评测</h2>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                载入固定问题集后顺序执行本地检索，计算 Hit@K、MRR、来源召回率、Keyword Recall@K
                和热查询耗时。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleListSources()}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border-color px-3 text-sm font-medium hover:bg-hover-bg"
              >
                <RefreshCw size={15} />
                刷新来源 ID
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border-color px-3 text-sm font-medium hover:bg-hover-bg"
              >
                <Upload size={15} />
                导入 JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={(event) => void handleUploadEvaluationCases(event)}
                className="hidden"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_220px]">
            <label className="text-xs font-medium text-text-secondary">
              评测标签
              <input
                value={evaluationLabel}
                onChange={(event) => setEvaluationLabel(event.target.value)}
                className="mt-1 h-9 w-full border border-border-color px-3 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <div className="text-xs font-medium text-text-secondary">
              检索策略
              <div className="mt-1 flex h-9 overflow-hidden rounded-md border border-border-color">
                {(['vector', 'hybrid'] as const).map((strategy) => (
                  <button
                    key={strategy}
                    type="button"
                    onClick={() => setRetrievalStrategy(strategy)}
                    disabled={isEvaluating}
                    className={`px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      retrievalStrategy === strategy
                        ? 'bg-accent text-white'
                        : 'bg-white text-text-primary hover:bg-hover-bg'
                    }`}
                  >
                    {strategy === 'vector' ? '纯向量' : '混合检索'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => void handleWarmup()}
                disabled={isWarmingUp || isEvaluating}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border-color px-3 text-sm font-medium hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Zap size={15} />
                {isWarmingUp ? '预热中' : '预热模型'}
              </button>
              <button
                type="button"
                onClick={handleExportReport}
                disabled={!report || isEvaluating}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border-color px-3 text-sm font-medium hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={15} />
                导出报告
              </button>
            </div>
          </div>

          <label className="mt-4 block text-xs font-medium text-text-secondary">
            评测集 JSON
            <span className="mt-1 block font-normal leading-5">
              id 是用例编号；expectedSourceIds 必须填写下方“可用来源 ID”中的实际
              ID，不能填写文档标题。
            </span>
            <textarea
              value={evaluationInput}
              onChange={(event) => setEvaluationInput(event.target.value)}
              className="mt-1 min-h-56 w-full resize-y border border-border-color p-3 font-mono text-xs leading-5 text-text-primary outline-none focus:border-accent"
              placeholder={
                '[\n  {\n    "id": "semantic-001",\n    "category": "semantic",\n    "query": "我有没有写过浏览器运行 AI 的内容？",\n    "expectedSourceIds": ["你的文档 ID"],\n    "expectedChunkKeywords": ["WebGPU"]\n  }\n]'
              }
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleLoadEvaluationCases()}
              disabled={isEvaluating}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border-color px-3 text-sm font-medium hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileJson size={15} />
              载入评测集
            </button>
            <button
              type="button"
              onClick={() => void handleRunEvaluation()}
              disabled={isEvaluating || isWarmingUp || evaluationCases.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={15} />
              运行评测
            </button>
            {isEvaluating && (
              <button
                type="button"
                onClick={handleStopEvaluation}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                <Square size={14} />
                停止后续查询
              </button>
            )}
            <span className="text-xs text-text-secondary">
              已载入 {evaluationCases.length} 条用例
              {warmupMs !== null ? ` · 预热 ${formatDuration(warmupMs)}` : ''}
            </span>
          </div>

          {evaluationProgress && (
            <p className="mt-4 text-sm text-text-secondary">
              评测进度：{evaluationProgress.completed} / {evaluationProgress.total}
              {isEvaluating ? '，正在执行当前批次。' : ''}
            </p>
          )}

          {sources && (
            <details className="mt-5 border-t border-border-color pt-4">
              <summary className="cursor-pointer text-sm font-medium text-text-primary">
                可用来源 ID（{sources.length}）
              </summary>
              <div className="mt-3 max-h-56 overflow-y-auto border border-border-color">
                {sources.map((source) => (
                  <div
                    key={source.id}
                    className="grid gap-1 border-b border-border-color px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <span className="truncate text-sm" title={source.title}>
                      {source.title}
                    </span>
                    <code className="break-all font-mono text-xs text-text-secondary">
                      {source.id}
                    </code>
                  </div>
                ))}
              </div>
            </details>
          )}

          {evaluationRun && (
            <div className="mt-6 border-t border-border-color pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">本轮结果</h3>
                  <p className="mt-1 text-xs text-text-secondary">
                    {evaluationRun.cancelled
                      ? `已在 ${evaluationRun.summary.completedCases} 条用例后停止。`
                      : `已完成 ${evaluationRun.summary.completedCases} 条用例。`}
                    {' · '}
                    {evaluationRun.strategy === 'hybrid' ? '混合检索' : '纯向量'}
                  </p>
                </div>
                {report && (
                  <span className="text-xs text-text-secondary">报告已生成，可导出 JSON。</span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 border border-border-color text-sm sm:grid-cols-4">
                <Metric label="Hit@1" value={formatPercent(evaluationRun.summary.hitAt1)} />
                <Metric label="Hit@3" value={formatPercent(evaluationRun.summary.hitAt3)} />
                <Metric label="Hit@5" value={formatPercent(evaluationRun.summary.hitAt5)} />
                <Metric label="MRR" value={evaluationRun.summary.mrr.toFixed(3)} />
                <Metric
                  label="Source Recall@1"
                  value={formatPercent(evaluationRun.summary.sourceRecallAt1)}
                />
                <Metric
                  label="Source Recall@3"
                  value={formatPercent(evaluationRun.summary.sourceRecallAt3)}
                />
                <Metric
                  label="Source Recall@5"
                  value={formatPercent(evaluationRun.summary.sourceRecallAt5)}
                />
                <Metric
                  label="Keyword Recall@1"
                  value={
                    evaluationRun.summary.averageKeywordRecallAt1 === null
                      ? '未标注'
                      : formatPercent(evaluationRun.summary.averageKeywordRecallAt1)
                  }
                />
                <Metric
                  label="Keyword Recall@3"
                  value={
                    evaluationRun.summary.averageKeywordRecallAt3 === null
                      ? '未标注'
                      : formatPercent(evaluationRun.summary.averageKeywordRecallAt3)
                  }
                />
                <Metric
                  label="Keyword Recall@5"
                  value={
                    evaluationRun.summary.averageKeywordRecallAt5 === null
                      ? '未标注'
                      : formatPercent(evaluationRun.summary.averageKeywordRecallAt5)
                  }
                />
                <Metric
                  label="平均耗时"
                  value={formatDuration(evaluationRun.summary.averageDurationMs)}
                />
                <Metric label="P50" value={formatDuration(evaluationRun.summary.p50DurationMs)} />
                <Metric label="P95" value={formatDuration(evaluationRun.summary.p95DurationMs)} />
              </div>

              <div className="mt-5 overflow-x-auto border border-border-color">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-bg-panel text-text-secondary">
                    <tr>
                      <th className="px-3 py-2 font-medium">状态</th>
                      <th className="px-3 py-2 font-medium">分类</th>
                      <th className="min-w-64 px-3 py-2 font-medium">查询</th>
                      <th className="px-3 py-2 font-medium">首个正确排名</th>
                      <th className="min-w-32 px-3 py-2 font-medium">来源召回</th>
                      <th className="min-w-48 px-3 py-2 font-medium">关键词覆盖</th>
                      <th className="px-3 py-2 font-medium">耗时</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluationRun.cases.map((result) => (
                      <tr key={result.caseId} className="border-t border-border-color align-top">
                        <td className="px-3 py-3">
                          <span className={result.hitAt5 ? 'text-success-color' : 'text-rose-600'}>
                            {result.hitAt5 ? '命中' : '未命中'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-text-secondary">{result.category}</td>
                        <td className="px-3 py-3">
                          <p className="max-w-md leading-5">{result.query}</p>
                          <p className="mt-1 max-w-md break-all text-text-secondary">
                            期望来源：{result.expectedSourceIds.join(', ')}
                          </p>
                          <details className="mt-2 text-text-secondary">
                            <summary className="cursor-pointer">查看 Top 5</summary>
                            <ol className="mt-2 space-y-3">
                              {result.topResults.map((source, index) => (
                                <li
                                  key={`${source.sourceId}-${source.chunkIndex}`}
                                  className="border-l-2 border-border-color pl-3"
                                >
                                  <p className="font-medium text-text-primary">
                                    #{index + 1} {source.title} · 分块 {source.chunkIndex} ·{' '}
                                    {source.score.toFixed(4)}
                                  </p>
                                  <p className="mt-1 break-all font-mono text-[11px]">
                                    来源 ID：{source.sourceId}
                                  </p>
                                  <p className="mt-1 font-mono text-[11px]">
                                    向量：
                                    {source.vectorRank
                                      ? `#${source.vectorRank} / ${source.vectorScore?.toFixed(4)}`
                                      : '-'}
                                    {' · '}关键词：
                                    {source.lexicalRank
                                      ? `#${source.lexicalRank} / ${source.lexicalScore?.toFixed(4)}`
                                      : '-'}
                                    {source.matchedTerms?.length
                                      ? ` · 命中词：${source.matchedTerms.join('、')}`
                                      : ''}
                                    {source.matchedPhrase
                                      ? ` · 完整短语：${source.matchedPhrase} (+${source.phraseBonus})`
                                      : ''}
                                  </p>
                                  {source.headingPath.length > 0 && (
                                    <p className="mt-1">章节：{source.headingPath.join(' / ')}</p>
                                  )}
                                  <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-sm bg-bg-panel p-2 leading-5 text-text-primary">
                                    {source.content}
                                  </p>
                                </li>
                              ))}
                            </ol>
                          </details>
                        </td>
                        <td className="px-3 py-3 font-mono">
                          {result.firstRelevantRank === null ? '-' : `#${result.firstRelevantRank}`}
                        </td>
                        <td className="px-3 py-3 font-mono leading-5">
                          <p>R@1 {formatPercent(result.sourceRecallAt1)}</p>
                          <p>R@3 {formatPercent(result.sourceRecallAt3)}</p>
                          <p>R@5 {formatPercent(result.sourceRecallAt5)}</p>
                        </td>
                        <td className="px-3 py-3 leading-5">
                          {result.keywordRecallAt5 === undefined ? (
                            '-'
                          ) : (
                            <>
                              <div className="font-mono">
                                <p>K@1 {formatPercent(result.keywordRecallAt1 ?? 0)}</p>
                                <p>K@3 {formatPercent(result.keywordRecallAt3 ?? 0)}</p>
                                <p>K@5 {formatPercent(result.keywordRecallAt5)}</p>
                                <p>
                                  完整覆盖{' '}
                                  {result.firstFullKeywordRank === null
                                    ? '未达到'
                                    : `#${result.firstFullKeywordRank}`}
                                </p>
                              </div>
                              <p className="mt-1 text-success-color">
                                已命中：{result.matchedKeywords?.join('、') || '无'}
                              </p>
                              <p className="mt-1 text-rose-600">
                                未命中：{result.missingKeywords?.join('、') || '无'}
                              </p>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono">{formatDuration(result.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {error && <p className="mt-6 text-sm text-rose-600">{error}</p>}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-border-color p-3 last:border-r-0 even:border-r-0 sm:even:border-r sm:nth-[4n]:border-r-0">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 font-mono text-base font-semibold text-text-primary">{value}</p>
    </div>
  );
}
