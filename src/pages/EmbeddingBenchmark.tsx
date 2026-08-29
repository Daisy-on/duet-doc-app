import { ArrowLeft, RotateCcw, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  runEmbeddingBenchmark,
  type EmbeddingBenchmarkResult,
  type EmbeddingDtype,
  type EmbeddingProgress,
} from '../embedding-test';

const precisionOptions: Array<{ dtype: EmbeddingDtype; label: string; size: string }> = [
  { dtype: 'fp16', label: 'FP16', size: '555 MB' },
  { dtype: 'int8', label: 'INT8', size: '278 MB' },
];

const STORAGE_PREFIX = 'duet-doc:embedding-benchmark:';

function loadSavedResults(): Partial<Record<EmbeddingDtype, EmbeddingBenchmarkResult>> {
  const savedResults: Partial<Record<EmbeddingDtype, EmbeddingBenchmarkResult>> = {};

  for (const { dtype } of precisionOptions) {
    const rawResult = localStorage.getItem(`${STORAGE_PREFIX}${dtype}`);
    if (rawResult) {
      savedResults[dtype] = JSON.parse(rawResult) as EmbeddingBenchmarkResult;
    }
  }

  return savedResults;
}

function formatMilliseconds(milliseconds: number) {
  return `${milliseconds.toFixed(1)} ms`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border-color py-3 last:border-0">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-text-primary tabular-nums">{value}</dd>
    </div>
  );
}

export default function EmbeddingBenchmark() {
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [progress, setProgress] = useState<EmbeddingProgress | null>(null);
  const [result, setResult] = useState<EmbeddingBenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedResults, setSavedResults] = useState(loadSavedResults);

  async function handleRun(dtype: EmbeddingDtype) {
    setIsRunning(true);
    setHasRun(false);
    setProgress(null);
    setResult(null);
    setError(null);

    try {
      const benchmarkResult = await runEmbeddingBenchmark({
        dtype,
        onProgress: setProgress,
      });
      setResult(benchmarkResult);
      localStorage.setItem(`${STORAGE_PREFIX}${dtype}`, JSON.stringify(benchmarkResult));
      setSavedResults((current) => ({ ...current, [dtype]: benchmarkResult }));
      setHasRun(true);
    } catch (caughtError) {
      console.error('[embedding-benchmark] test failed:', caughtError);
      setError(caughtError instanceof Error ? caughtError.message : '模型测试失败，请查看控制台。');
    } finally {
      setIsRunning(false);
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
          <p className="text-sm font-medium text-accent">Developer benchmark</p>
          <h1 className="mt-2 text-2xl font-bold">Multilingual E5 本地向量性能测试</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
            测试同一段查询在 WebGPU 下的加载时间、首次推理、热推理延迟与小批量文档编码表现。
          </p>
        </header>

        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex gap-2">
            <TriangleAlert className="mt-0.5 shrink-0" size={17} />
            <p>
              每次页面只测试一种精度。完成一轮后请刷新页面，再测试下一种，避免已加载的模型占用 GPU
              内存而影响结果。
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          {precisionOptions.map((option) => (
            <button
              key={option.dtype}
              type="button"
              disabled={isRunning || hasRun}
              onClick={() => handleRun(option.dtype)}
              className="rounded-lg border border-border-color bg-white p-4 text-left transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block text-sm font-semibold">测试 {option.label}</span>
              <span className="mt-1 block text-xs text-text-secondary">权重约 {option.size}</span>
            </button>
          ))}
        </section>

        {(isRunning || progress) && (
          <section className="mt-6 rounded-lg border border-border-color bg-white p-5">
            <p className="text-sm font-medium">{isRunning ? '正在测试' : '加载进度'}</p>
            <p className="mt-2 break-all font-mono text-xs text-text-secondary">
              {progress ? `${progress.file} ${progress.percent}%` : '正在初始化模型...'}
            </p>
          </section>
        )}

        {error && (
          <section className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            <p className="font-semibold">测试未完成</p>
            <p className="mt-2 break-words font-mono text-xs">{error}</p>
          </section>
        )}

        {savedResults.fp16 && savedResults.int8 && (
          <section className="mt-6 rounded-lg border border-border-color bg-white p-5">
            <h2 className="text-sm font-semibold">FP16 / INT8 对照</h2>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              这是固定样例的冒烟对比，只能观察量化后的排序和分数偏移，不能替代真实 RAG 评测集。
            </p>
            <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
              <Metric
                label="FP16 热推理 P50"
                value={formatMilliseconds(savedResults.fp16.p50InferenceMs)}
              />
              <Metric
                label="INT8 热推理 P50"
                value={formatMilliseconds(savedResults.int8.p50InferenceMs)}
              />
              <Metric
                label="Top 1 是否一致"
                value={
                  savedResults.fp16.ranking[0]?.passage === savedResults.int8.ranking[0]?.passage
                    ? '一致'
                    : '不一致'
                }
              />
              <Metric
                label="候选分数最大偏移"
                value={Math.max(
                  ...savedResults.fp16.ranking.map((fp16Item) => {
                    const int8Item = savedResults.int8?.ranking.find(
                      (candidate) => candidate.passage === fp16Item.passage,
                    );
                    return Math.abs(fp16Item.score - (int8Item?.score ?? fp16Item.score));
                  }),
                ).toFixed(6)}
              />
            </dl>
          </section>
        )}

        {result && (
          <>
            <section className="mt-6 rounded-lg border border-border-color bg-white p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">{result.dtype.toUpperCase()} / WebGPU</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    详细输出已同步打印至浏览器控制台。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-2 rounded-md border border-border-color px-3 py-2 text-sm hover:bg-hover-bg"
                >
                  <RotateCcw size={14} />
                  刷新后测下一组
                </button>
              </div>

              <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
                <Metric label="模型加载" value={formatMilliseconds(result.modelLoadMs)} />
                <Metric label="首次推理" value={formatMilliseconds(result.firstInferenceMs)} />
                <Metric
                  label="热推理平均值（10 次）"
                  value={formatMilliseconds(result.averageInferenceMs)}
                />
                <Metric label="热推理 P50" value={formatMilliseconds(result.p50InferenceMs)} />
                <Metric label="热推理 P95" value={formatMilliseconds(result.p95InferenceMs)} />
                <Metric
                  label={`批量编码（${result.batchSize} 段）`}
                  value={formatMilliseconds(result.batchInferenceMs)}
                />
                <Metric label="Embedding 维度" value={String(result.embeddingDimension)} />
              </dl>
            </section>

            <section className="mt-6 rounded-lg border border-border-color bg-white p-5">
              <h2 className="text-sm font-semibold">检索正确性</h2>
              <p className="mt-1 text-xs text-text-secondary">
                查询内容与 WebGPU 相关的 passage 应位于第一名，向量维度应为 768。
              </p>
              <ol className="mt-4 space-y-3">
                {result.ranking.map((item, index) => (
                  <li key={item.passage} className="border-l-2 border-border-color pl-3">
                    <div className="flex items-center justify-between gap-4 text-xs text-text-secondary">
                      <span>#{index + 1}</span>
                      <span className="font-mono">{item.score.toFixed(4)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6">{item.passage}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-6 rounded-lg border border-border-color bg-white p-5 text-sm">
              <h2 className="font-semibold">显存观察</h2>
              <p className="mt-2 leading-6 text-text-secondary">
                浏览器不会通过 WebGPU 暴露准确显存占用。测试前打开 Windows 任务管理器的“性能 →
                GPU”，记录“专用 GPU
                内存”基线；模型加载完成后记录峰值，两者之差可作为本轮的近似显存占用。
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
