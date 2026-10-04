import { useEffect } from 'react';
import { Check, Download, Loader2, RotateCcw, X, Search, Sparkles } from 'lucide-react';
import { formatBytes, MODEL_DEFINITIONS, type ModelId } from '../../models/catalog';
import { useModelStore } from '../../store/modelStore';

interface ModelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ModelManagerModal({ isOpen, onClose }: ModelManagerModalProps) {
  const initialized = useModelStore((state) => state.initialized);
  const activeModelId = useModelStore((state) => state.activeModelId);
  const models = useModelStore((state) => state.models);
  const initialize = useModelStore((state) => state.initialize);
  const install = useModelStore((state) => state.install);
  const cancel = useModelStore((state) => state.cancel);

  useEffect(() => {
    if (isOpen) void initialize();
  }, [initialize, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const installedCount = MODEL_DEFINITIONS.filter(
    (definition) => models[definition.id].status === 'installed',
  ).length;

  const installModel = (modelId: ModelId) => void install(modelId);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-[414px] max-w-full overflow-hidden rounded-2xl border border-border-color/80 bg-bg-main shadow-2xl animate-dropdown-fade-in">
        <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-text-primary">端侧模型</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 border border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/40">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              已安装 {installedCount}/{MODEL_DEFINITIONS.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-ghost transition-colors hover:bg-hover-bg hover:text-text-primary cursor-pointer"
            aria-label="关闭"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 px-4 pb-4 pt-1">
          {MODEL_DEFINITIONS.map((definition) => {
            const model = models[definition.id];
            const totalBytes = model.totalBytes || definition.estimatedSizeBytes;
            const percent = Math.min(
              100,
              totalBytes > 0 ? Math.round((model.downloadedBytes / totalBytes) * 100) : 0,
            );
            const isEmbedding = definition.id.includes('bge');
            return (
              <div
                key={definition.id}
                className="rounded-xl border border-border-color/60 bg-hover-bg/30 p-3 transition-all hover:border-border-color/90 hover:bg-hover-bg/60"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      isEmbedding
                        ? 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400 border border-sky-100/80 dark:border-sky-900/40'
                        : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-100/80 dark:border-indigo-900/40'
                    }`}
                  >
                    {isEmbedding ? <Search size={16} /> : <Sparkles size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text-primary">
                        {definition.name}
                      </span>
                      <span className="shrink-0 rounded bg-bg-main border border-border-color/60 px-1.5 py-0.5 text-[10px] font-mono text-text-secondary">
                        {definition.precision}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-text-secondary">
                      {definition.modelName} · {formatBytes(totalBytes)}
                    </div>
                  </div>

                  {!initialized || model.status === 'checking' ? (
                    <Loader2 size={16} className="animate-spin text-text-secondary" />
                  ) : model.status === 'installed' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50/80 px-2.5 py-1 text-xs font-medium text-emerald-600 border border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/40">
                      <Check size={13} className="shrink-0" /> 已安装
                    </span>
                  ) : model.status === 'downloading' ? (
                    <button
                      type="button"
                      onClick={() => cancel(definition.id)}
                      className="flex h-7 items-center gap-1.5 rounded-lg border border-border-color bg-bg-main px-2.5 text-xs font-medium text-text-primary hover:bg-hover-bg transition-colors cursor-pointer"
                    >
                      <X size={13} /> 取消
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={activeModelId !== null || !navigator.onLine}
                      onClick={() => installModel(definition.id)}
                      className="flex h-7 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                    >
                      {model.status === 'error' ? <RotateCcw size={13} /> : <Download size={13} />}
                      {model.status === 'error' ? '重试' : '下载'}
                    </button>
                  )}
                </div>

                {model.status === 'downloading' && (
                  <div className="ml-11 mt-2.5">
                    <div className="h-1.5 overflow-hidden rounded-full bg-border-color/40">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-150"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between font-mono text-[11px] text-text-secondary">
                      <span>
                        {formatBytes(model.downloadedBytes)} / {formatBytes(totalBytes)}
                      </span>
                      <span>{percent}%</span>
                    </div>
                  </div>
                )}
                {model.error && model.status === 'error' && (
                  <p className="ml-11 mt-2 text-xs text-red-500">{model.error}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
