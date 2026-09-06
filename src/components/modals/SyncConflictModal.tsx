import { useState } from 'react';
import { AlertTriangle, Cloud, HardDrive, Loader2, X } from 'lucide-react';
import type { SyncConflict } from '../../sync/CloudSyncService';

interface SyncConflictModalProps {
  conflict: SyncConflict | null;
  remainingCount: number;
  onClose: () => void;
  onResolve: (resolution: 'keep-local' | 'use-cloud') => Promise<void>;
}

function conflictLabel(conflict: SyncConflict): string {
  const snapshot = conflict.data.snapshot;
  const value = snapshot.title ?? snapshot.name ?? snapshot.content;
  if (typeof value !== 'string' || !value.trim()) return conflict.entityId;
  return value.length > 40 ? `${value.slice(0, 40)}...` : value;
}

export default function SyncConflictModal({
  conflict,
  remainingCount,
  onClose,
  onResolve,
}: SyncConflictModalProps) {
  const [submitting, setSubmitting] = useState<'keep-local' | 'use-cloud' | null>(null);
  if (!conflict) return null;

  const resolve = async (resolution: 'keep-local' | 'use-cloud') => {
    setSubmitting(resolution);
    try {
      await onResolve(resolution);
      onClose();
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
      <div className="w-[460px] max-w-[92vw] rounded-xl border border-gray-100 bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertTriangle size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-gray-900">发现云端版本冲突</h3>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              “{conflictLabel(conflict)}”在本地和云端都发生了修改，请选择要保留的版本。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            disabled={submitting !== null}
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => void resolve('keep-local')}
            className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent/5 disabled:opacity-50"
          >
            {submitting === 'keep-local' ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <HardDrive size={18} />
            )}
            <span>
              <span className="block text-sm font-semibold text-gray-900">保留本地版本</span>
              <span className="mt-0.5 block text-xs text-gray-500">以当前设备内容更新云端</span>
            </span>
          </button>
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => void resolve('use-cloud')}
            className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent/5 disabled:opacity-50"
          >
            {submitting === 'use-cloud' ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Cloud size={18} />
            )}
            <span>
              <span className="block text-sm font-semibold text-gray-900">采用云端版本</span>
              <span className="mt-0.5 block text-xs text-gray-500">放弃该条尚未同步的本地修改</span>
            </span>
          </button>
        </div>

        <div className="mt-4 text-right text-xs text-gray-400">
          云端 revision {conflict.data.remoteRevision}
          {remainingCount > 1 ? ` · 还有 ${remainingCount - 1} 项冲突` : ''}
        </div>
      </div>
    </div>
  );
}
