import { useEffect, useState } from 'react';
import { Cloud, Loader2, Check } from 'lucide-react';
import { inspectModelInstallation } from '../models/modelCache';
import {
  createCloudRagRun,
  getCloudRagCoverage,
  getCloudRagPlan,
  getCloudRagRun,
  type CloudRagPlan,
  type CloudRagCoverage,
} from '../rag/cloudRagClient';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import CloudRagSetupModal from './modals/CloudRagSetupModal';

interface Props {
  onMessage: (message: string) => void;
}

export default function CloudRagGate({ onMessage }: Props) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const workspaceId = useAuthStore((state) => state.workspaceId);
  const lastSyncAt = useSyncStore((state) => state.lastSyncAt);
  const [hasLocalModel, setHasLocalModel] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CloudRagCoverage | null>(null);
  const [activeRunProgress, setActiveRunProgress] = useState<{
    completed: number;
    total: number;
    taskType: 'text' | 'image' | 'hybrid';
  } | null>(null);
  const [plan, setPlan] = useState<CloudRagPlan | null>(null);
  const [includeText, setIncludeText] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !workspaceId) return;
    const controller = new AbortController();
    void (async () => {
      const installation = await inspectModelInstallation('bge-large-zh-v1.5-fp16');
      if (controller.signal.aborted) return;
      setHasLocalModel(Boolean(installation));
      const cov = await getCloudRagCoverage(workspaceId);
      if (!controller.signal.aborted) {
        setCoverage(cov);
        setActiveRunId(cov.active_run_id);
      }
    })().catch(() => {
      // The assistant remains usable when the optional cloud-index check is offline.
    });
    return () => controller.abort();
  }, [lastSyncAt, refreshKey, userId, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !activeRunId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const run = await getCloudRagRun(workspaceId, activeRunId);
        if (cancelled) return;
        if (run.total_jobs !== undefined) {
          setActiveRunProgress((prev) => ({
            completed: run.completed_jobs ?? prev?.completed ?? 0,
            total: run.total_jobs,
            taskType: prev?.taskType ?? (coverage?.pending_images ? 'image' : 'hybrid'),
          }));
        }
        if (run.status === 'pending' || run.status === 'running') return;
        setActiveRunId(null);
        setActiveRunProgress(null);
        setRefreshKey((value) => value + 1);
        if (run.status === 'completed') {
          onMessage('云端索引已全部建立就绪');
        } else {
          onMessage(
            `云端索引完成 ${run.completed_jobs ?? 0} 项，失败 ${run.failed_jobs ?? 0} 项。检查配置或网络后可手动重试。`,
          );
        }
      } catch {
        // Keep the passive status visible and retry on the next interval.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeRunId, coverage, onMessage, workspaceId]);

  const prepare = async () => {
    if (!workspaceId || isPreparing) return;
    setIsPreparing(true);
    setError(null);
    try {
      const nextPlan = await getCloudRagPlan(workspaceId, !hasLocalModel);
      if (nextPlan.total_jobs === 0) {
        onMessage('知识库所有文档与图片均已是最新索引');
        return;
      }
      setIncludeText(false);
      setIncludeImages(false);
      setPlan(nextPlan);
    } catch (reason) {
      onMessage(reason instanceof Error ? reason.message : '无法读取云端索引计划');
    } finally {
      setIsPreparing(false);
    }
  };

  const confirm = async () => {
    if (!workspaceId) return;
    setIsSubmitting(true);
    setError(null);
    const needText = !hasLocalModel && includeText;
    const needImages = includeImages;
    const taskType: 'text' | 'image' | 'hybrid' =
      needImages && needText ? 'hybrid' : needImages ? 'image' : 'text';
    try {
      const run = await createCloudRagRun(workspaceId, needText, needImages);
      onMessage(`已创建云端索引任务（${run.total_jobs} 项）`);
      setPlan(null);
      setActiveRunId(run.run_id);
      setActiveRunProgress({
        completed: 0,
        total: run.total_jobs,
        taskType,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建云端索引任务失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!userId || !workspaceId) return null;

  const hasPending =
    Boolean(activeRunId) ||
    Boolean(
      coverage &&
      (coverage.pending_images > 0 ||
        (!hasLocalModel && coverage.missing_sources + coverage.stale_sources > 0)),
    );

  const getRunningLabel = () => {
    const taskTypeLabel =
      activeRunProgress?.taskType === 'image'
        ? '多模态'
        : activeRunProgress?.taskType === 'text'
          ? '文本'
          : coverage?.pending_images
            ? '多模态'
            : '云端';
    if (activeRunProgress?.total) {
      return `正在建立${taskTypeLabel}索引 (${activeRunProgress.completed}/${activeRunProgress.total})...`;
    }
    return `正在建立${taskTypeLabel}索引...`;
  };

  return (
    <>
      {activeRunId ? (
        <button
          type="button"
          disabled
          className="flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200/90 bg-indigo-50/70 px-3 text-xs font-medium text-indigo-700 dark:border-indigo-800/80 dark:bg-indigo-950/40 dark:text-indigo-300 shadow-xs select-none"
          title="云端索引正在建立中"
        >
          <Loader2
            size={13}
            className="animate-spin text-indigo-600 dark:text-indigo-400 shrink-0"
          />
          <span className="hidden sm:inline">{getRunningLabel()}</span>
        </button>
      ) : hasPending ? (
        <button
          type="button"
          onClick={() => void prepare()}
          disabled={isPreparing}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200/90 bg-indigo-50/70 px-3 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 hover:border-indigo-300 dark:border-indigo-800/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50 shadow-xs cursor-pointer"
          title={
            coverage?.pending_images
              ? `有 ${coverage.pending_images} 张图片待建立多模态索引`
              : '为新增文档或资源建立云端索引'
          }
        >
          {isPreparing ? (
            <Loader2
              size={13}
              className="animate-spin text-indigo-600 dark:text-indigo-400 shrink-0"
            />
          ) : (
            <Cloud size={13.5} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
          )}
          <span className="hidden sm:inline">
            {coverage?.pending_images
              ? `建立云端索引 (${coverage.pending_images})`
              : '建立云端索引'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void prepare()}
          disabled={isPreparing}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border-color/80 bg-bg-panel/90 px-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary shadow-xs cursor-pointer select-none"
          title="所有文档与图片索引已就绪，点击可检测更新"
        >
          {isPreparing ? (
            <Loader2 size={13} className="animate-spin text-text-secondary shrink-0" />
          ) : (
            <Check size={13.5} className="text-emerald-500 shrink-0" />
          )}
          <span className="hidden sm:inline">就绪</span>
        </button>
      )}

      {plan && (
        <CloudRagSetupModal
          plan={plan}
          hasLocalModel={hasLocalModel}
          includeText={includeText}
          onIncludeTextChange={setIncludeText}
          includeImages={includeImages}
          onIncludeImagesChange={setIncludeImages}
          isSubmitting={isSubmitting}
          error={error}
          onConfirm={() => void confirm()}
          onDecline={() => setPlan(null)}
        />
      )}
    </>
  );
}
