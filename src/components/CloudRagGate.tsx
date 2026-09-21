import { useEffect, useState } from 'react';
import { Cloud, Loader2 } from 'lucide-react';
import { db } from '../db';
import { inspectModelInstallation } from '../models/modelCache';
import {
  createCloudRagRun,
  getCloudRagCoverage,
  getCloudRagPlan,
  getCloudRagRun,
  type CloudRagPlan,
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
  const [isVisible, setIsVisible] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [plan, setPlan] = useState<CloudRagPlan | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !workspaceId) return;
    const controller = new AbortController();
    void (async () => {
      const [installation, localIndexCount] = await Promise.all([
        inspectModelInstallation('multilingual-e5-base-fp16'),
        db.documentIndexStates.where('status').equals('indexed').count(),
      ]);
      if (installation || localIndexCount > 0 || controller.signal.aborted) {
        if (!controller.signal.aborted) setIsVisible(false);
        return;
      }
      const coverage = await getCloudRagCoverage(workspaceId);
      if (!controller.signal.aborted) {
        setActiveRunId(coverage.active_run_id);
        setIsVisible(Boolean(coverage.active_run_id) || !coverage.has_any_index);
      }
    })().catch(() => {
      // The assistant remains usable when the optional cloud-index check is offline.
    });
    return () => controller.abort();
  }, [lastSyncAt, userId, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !activeRunId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const run = await getCloudRagRun(workspaceId, activeRunId);
        if (cancelled || run.status === 'pending' || run.status === 'running') return;
        setActiveRunId(null);
        if (run.status === 'completed') {
          setIsVisible(false);
          onMessage('云端语义索引已建立');
        } else {
          setIsVisible(true);
          onMessage('云端索引任务未完全成功，可以重新尝试');
        }
      } catch {
        // Keep the passive status visible and retry on the next interval.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeRunId, onMessage, workspaceId]);

  const prepare = async () => {
    if (!workspaceId || isPreparing) return;
    setIsPreparing(true);
    setError(null);
    try {
      const nextPlan = await getCloudRagPlan(workspaceId);
      if (nextPlan.total_jobs === 0) {
        onMessage('暂无可建立索引的云端文档，请先完成同步');
        return;
      }
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
    try {
      const run = await createCloudRagRun(workspaceId);
      onMessage(`已创建云端索引任务（${run.total_jobs} 项）`);
      setPlan(null);
      setActiveRunId(run.run_id);
      setIsVisible(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建云端索引任务失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible || !userId || !workspaceId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void prepare()}
        disabled={isPreparing || Boolean(activeRunId)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-950"
        title="当前工作区尚未配置可用的语义索引"
      >
        {isPreparing || activeRunId ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Cloud size={13} />
        )}
        <span className="hidden sm:inline">{activeRunId ? '索引建立中' : '建立语义索引'}</span>
      </button>
      {plan && (
        <CloudRagSetupModal
          plan={plan}
          isSubmitting={isSubmitting}
          error={error}
          onConfirm={() => void confirm()}
          onDecline={() => setPlan(null)}
        />
      )}
    </>
  );
}
