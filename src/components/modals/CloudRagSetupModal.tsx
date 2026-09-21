import { Cloud, Loader2, X } from 'lucide-react';
import type { CloudRagPlan } from '../../rag/cloudRagClient';

interface Props {
  plan: CloudRagPlan;
  isSubmitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onDecline: () => void;
}

export default function CloudRagSetupModal({
  plan,
  isSubmitting,
  error,
  onConfirm,
  onDecline,
}: Props) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
      <section className="w-[460px] max-w-[calc(100vw-32px)] rounded-xl border border-border-color bg-bg-main p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60">
            <Cloud size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-text-primary">建立云端语义索引</h3>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              当前设备未安装语义检索模型。建立后可在本设备直接使用 Duet 检索，也能在其他设备复用。
            </p>
          </div>
          <button
            type="button"
            onClick={onDecline}
            disabled={isSubmitting}
            className="rounded-md p-1 text-text-ghost hover:bg-hover-bg hover:text-text-primary disabled:opacity-40"
            title="稍后处理"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 divide-x divide-border-color rounded-xl border border-border-color bg-bg-panel py-3 text-center">
          <div>
            <strong className="block text-sm text-text-primary">{plan.document_count}</strong>
            <span className="text-xs text-text-secondary">篇文档</span>
          </div>
          <div>
            <strong className="block text-sm text-text-primary">{plan.text_chunk_count}</strong>
            <span className="text-xs text-text-secondary">个文本块</span>
          </div>
          <div>
            <strong className="block text-sm text-text-primary">{plan.image_count}</strong>
            <span className="text-xs text-text-secondary">张图片</span>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-text-secondary">
          仅在你确认后调用云端模型。以后修改文档不会自动产生新的云端向量任务。
        </p>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDecline}
            disabled={isSubmitting}
            className="rounded-md border border-border-color px-4 py-2 text-sm text-text-primary hover:bg-hover-bg disabled:opacity-40"
          >
            暂不建立
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {isSubmitting && <Loader2 size={15} className="animate-spin" />}
            {isSubmitting ? '正在创建任务' : '确认建立'}
          </button>
        </div>
      </section>
    </div>
  );
}
