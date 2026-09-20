import { useEffect, useState } from 'react';
import { db } from '../db';
import { inspectModelInstallation } from '../models/modelCache';
import {
  createCloudRagRun,
  getCloudRagCoverage,
  getCloudRagPlan,
  type CloudRagPlan,
} from '../rag/cloudRagClient';
import { useAuthStore } from '../store/authStore';
import CloudRagSetupModal from './modals/CloudRagSetupModal';

function declinedKey(userId: string, workspaceId: string) {
  return `duet-doc:cloud-rag-declined:${userId}:${workspaceId}`;
}

interface Props {
  onCreated: (jobCount: number) => void;
}

export default function CloudRagGate({ onCreated }: Props) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const workspaceId = useAuthStore((state) => state.workspaceId);
  const [plan, setPlan] = useState<CloudRagPlan | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !workspaceId) return;
    const controller = new AbortController();
    void (async () => {
      if (localStorage.getItem(declinedKey(userId, workspaceId))) return;
      const [installation, localIndexCount] = await Promise.all([
        inspectModelInstallation('multilingual-e5-base-fp16'),
        db.documentIndexStates.where('status').equals('indexed').count(),
      ]);
      if (installation || localIndexCount > 0 || controller.signal.aborted) return;
      const coverage = await getCloudRagCoverage(workspaceId);
      if (coverage.has_any_index || controller.signal.aborted) return;
      const nextPlan = await getCloudRagPlan(workspaceId);
      if (nextPlan.total_jobs > 0 && !controller.signal.aborted) setPlan(nextPlan);
    })().catch(() => {
      // The assistant remains usable when the optional cloud-index check is offline.
    });
    return () => controller.abort();
  }, [userId, workspaceId]);

  if (!plan || !userId || !workspaceId) return null;

  const decline = () => {
    localStorage.setItem(declinedKey(userId, workspaceId), '1');
    setPlan(null);
  };

  const confirm = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const run = await createCloudRagRun(workspaceId);
      onCreated(run.total_jobs);
      setPlan(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建云端索引任务失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CloudRagSetupModal
      plan={plan}
      isSubmitting={isSubmitting}
      error={error}
      onConfirm={() => void confirm()}
      onDecline={decline}
    />
  );
}
