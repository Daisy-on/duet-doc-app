import { useEffect } from 'react';
import { Check, Download, HardDrive, Loader2, RotateCcw, X } from 'lucide-react';
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
      <div className="w-[420px] max-w-full overflow-hidden rounded-xl border border-border-color bg-bg-main shadow-xl">
        <div className="flex items-center justify-between border-b border-border-color px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-text-primary">端侧模型</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              已安装 {installedCount}/{MODEL_DEFINITIONS.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-text-ghost transition-colors hover:bg-hover-bg hover:text-text-primary"
            aria-label="关闭"
          >
            <X size={17} />
          </button>
        </div>

        <div className="divide-y divide-border-color px-5">
          {MODEL_DEFINITIONS.map((definition) => {
            const model = models[definition.id];
            const totalBytes = model.totalBytes || definition.estimatedSizeBytes;
            const percent = Math.min(
              100,
              totalBytes > 0 ? Math.round((model.downloadedBytes / totalBytes) * 100) : 0,
            );
            return (
              <div key={definition.id} className="py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-accent dark:bg-indigo-950/60">
                    <HardDrive size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text-primary">
                        {definition.name}
                      </span>
                      <span className="shrink-0 rounded bg-hover-bg px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                        {definition.precision}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-text-secondary">
                      {definition.modelName} · {formatBytes(totalBytes)}
                    </div>
                  </div>

                  {!initialized || model.status === 'checking' ? (
                    <Loader2 size={17} className="animate-spin text-text-secondary" />
                  ) : model.status === 'installed' ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Check size={14} /> 已安装
                    </span>
                  ) : model.status === 'downloading' ? (
                    <button
                      type="button"
                      onClick={() => cancel(definition.id)}
                      className="flex h-8 items-center gap-1.5 rounded-md border border-border-color px-2.5 text-xs font-medium text-text-primary hover:bg-hover-bg"
                    >
                      <X size={14} /> 取消
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={activeModelId !== null || !navigator.onLine}
                      onClick={() => installModel(definition.id)}
                      className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {model.status === 'error' ? <RotateCcw size={14} /> : <Download size={14} />}
                      {model.status === 'error' ? '重试' : '下载'}
                    </button>
                  )}
                </div>

                {model.status === 'downloading' && (
                  <div className="ml-12 mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-hover-bg">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-150"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-text-secondary">
                      <span>
                        {formatBytes(model.downloadedBytes)} / {formatBytes(totalBytes)}
                      </span>
                      <span>{percent}%</span>
                    </div>
                  </div>
                )}
                {model.error && model.status === 'error' && (
                  <p className="ml-12 mt-2 text-xs text-red-500">{model.error}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
