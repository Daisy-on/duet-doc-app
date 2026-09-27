import { Cloud, Loader2, X, ShieldCheck } from 'lucide-react';
import type { CloudRagPlan } from '../../rag/cloudRagClient';

interface Props {
  plan: CloudRagPlan;
  hasLocalModel: boolean;
  includeText: boolean;
  onIncludeTextChange: (value: boolean) => void;
  includeImages: boolean;
  onIncludeImagesChange: (value: boolean) => void;
  isSubmitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onDecline: () => void;
}

export default function CloudRagSetupModal({
  plan,
  hasLocalModel,
  includeText,
  onIncludeTextChange,
  includeImages,
  onIncludeImagesChange,
  isSubmitting,
  error,
  onConfirm,
  onDecline,
}: Props) {
  const isConfirmDisabled =
    isSubmitting ||
    (!hasLocalModel && includeText ? plan.document_count : 0) +
      (includeImages ? plan.image_count : 0) ===
      0;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-[3px] p-4">
      <section className="w-[460px] max-w-full rounded-2xl border border-border-color/80 bg-bg-main p-6 shadow-2xl animate-modal-scale-in">
        {/* 顶部标题栏 */}
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-900/60 dark:bg-indigo-950/50">
            <Cloud size={20} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-[17px] font-bold text-text-primary">建立云端语义索引</h3>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {hasLocalModel
                ? '文本可使用端侧模型本地建立索引；图片需要云端视觉模型处理。'
                : '未安装端侧语义模型，可按需建立云端文本索引。'}
            </p>
          </div>
          <button
            type="button"
            onClick={onDecline}
            disabled={isSubmitting}
            className="rounded-lg p-1 text-text-ghost hover:bg-hover-bg hover:text-text-primary transition-colors cursor-pointer disabled:opacity-40"
            title="稍后处理"
          >
            <X size={18} />
          </button>
        </div>

        {/* 三列核心数据统计卡片 (大数字 + 零值弱化) */}
        <div className="mt-5 grid grid-cols-3 divide-x divide-border-color/60 rounded-xl border border-border-color/80 bg-bg-panel/70 py-3.5 text-center">
          <div>
            <strong
              className={`block text-2xl font-bold tracking-tight ${
                plan.document_count > 0 ? 'text-text-primary' : 'text-text-ghost/60'
              }`}
            >
              {plan.document_count}
            </strong>
            <span className="text-[12px] font-medium text-text-secondary mt-0.5 block">篇文档</span>
          </div>
          <div>
            <strong
              className={`block text-2xl font-bold tracking-tight ${
                plan.text_chunk_count > 0 ? 'text-text-primary' : 'text-text-ghost/60'
              }`}
            >
              {plan.text_chunk_count}
            </strong>
            <span className="text-[12px] font-medium text-text-secondary mt-0.5 block">
              个文本块
            </span>
          </div>
          <div>
            <strong
              className={`block text-2xl font-bold tracking-tight ${
                plan.image_count > 0 ? 'text-text-primary' : 'text-text-ghost/60'
              }`}
            >
              {plan.image_count}
            </strong>
            <span className="text-[12px] font-medium text-text-secondary mt-0.5 block">张图片</span>
          </div>
        </div>

        {/* 统一的授权选项与说明整合卡片 (无分隔线) */}
        <div className="mt-4 overflow-hidden rounded-xl border border-border-color/80 bg-bg-panel/40">
          {!hasLocalModel && plan.document_count > 0 && (
            <label className="flex items-center gap-3 px-3.5 py-3 text-xs transition-colors hover:bg-hover-bg/60 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeText}
                onChange={(event) => onIncludeTextChange(event.target.checked)}
                disabled={isSubmitting}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
              />
              <span
                className={`font-medium transition-colors ${
                  includeText ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                同意将 {plan.document_count} 篇文档交由云端模型建立文本索引
              </span>
            </label>
          )}

          {plan.image_count > 0 && (
            <label className="flex items-center gap-3 px-3.5 py-3 text-xs transition-colors hover:bg-hover-bg/60 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(event) => onIncludeImagesChange(event.target.checked)}
                disabled={isSubmitting}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
              />
              <span
                className={`font-medium transition-colors ${
                  includeImages ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                同意将 {plan.image_count} 张图片交由云端视觉模型生成描述并建立索引
              </span>
            </label>
          )}

          {/* 整合卡片底部的免责与安全承诺便签 */}
          <div className="flex items-start gap-2 bg-hover-bg/30 px-3.5 py-2.5 text-[12px] leading-relaxed text-text-secondary">
            <ShieldCheck
              size={14}
              className="mt-0.5 shrink-0 text-amber-500 dark:text-indigo-400"
            />
            <span>仅在你确认后调用云端模型，后续修改文档不会自动产生新的云端向量任务。</span>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-rose-500 font-medium">{error}</p>}

        {/* 底部按钮 (适度增大尺寸，缩小与上卡片间距) */}
        <div className="mt-4 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onDecline}
            disabled={isSubmitting}
            className="rounded-xl border border-border-color px-4 py-2.5 text-[13px] font-medium text-text-secondary hover:bg-hover-bg hover:text-text-primary transition-colors cursor-pointer disabled:opacity-40"
          >
            暂不建立
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all ${
              isConfirmDisabled
                ? 'bg-gray-100 text-text-ghost cursor-not-allowed border border-border-color/40 dark:bg-gray-800/60 dark:text-gray-500'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-500/20 cursor-pointer'
            }`}
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>{isSubmitting ? '正在创建任务...' : '确认建立'}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
