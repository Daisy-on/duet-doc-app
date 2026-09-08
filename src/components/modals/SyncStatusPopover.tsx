import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import {
  CloudOff,
  AlertCircle,
  CloudDownload,
  CloudUpload,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import type { SyncUiStatus } from '../../store/syncStore';

interface SyncStatusPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  syncStatus: SyncUiStatus;
  pendingCount: number;
  errorCount: number;
  lastSyncAt: number | null;
  errorMessage: string | null;
  conflictsCount: number;
  hasRemoteUpdates: boolean;
  onRetry: () => void;
  onSync: () => void;
  onOpenConflicts: () => void;
}

export default function SyncStatusPopover({
  isOpen,
  onClose,
  anchorEl,
  syncStatus,
  pendingCount,
  errorCount,
  lastSyncAt,
  errorMessage,
  conflictsCount,
  hasRemoteUpdates,
  onRetry,
  onSync,
  onOpenConflicts,
}: SyncStatusPopoverProps) {
  const [coords, setCoords] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useLayoutEffect(() => {
    if (isOpen && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();

      const bottom = window.innerHeight - rect.top + 8; // pop up above the icon
      const left = rect.left;

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCoords({ bottom, left });
    }
  }, [isOpen, anchorEl]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-transparent" onClick={onClose} />
      <div
        ref={popoverRef}
        style={{
          position: 'fixed',
          bottom: `${coords.bottom}px`,
          left: `${coords.left}px`,
          minWidth: '192px',
          maxWidth: '288px',
          width: 'max-content',
        }}
        className="z-50 bg-white border border-border-color rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-3 animate-dropdown-fade-in flex flex-col gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          {syncStatus === 'offline' ? (
            <CloudOff size={16} className="text-text-secondary shrink-0" />
          ) : conflictsCount > 0 || errorCount > 0 || syncStatus === 'error' ? (
            <AlertCircle size={16} className="text-red-500 shrink-0" />
          ) : hasRemoteUpdates ? (
            <CloudDownload size={16} className="text-accent shrink-0" />
          ) : pendingCount > 0 ? (
            <CloudUpload size={16} className="text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
          )}
          <span className="font-semibold text-text-primary text-sm">
            {syncStatus === 'offline'
              ? '离线模式'
              : conflictsCount > 0
                ? '存在版本冲突'
                : errorCount > 0 || syncStatus === 'error'
                  ? '同步异常'
                  : hasRemoteUpdates
                    ? '云端有新更新'
                    : pendingCount > 0
                      ? '有未上传的更改'
                      : '已与云端数据对齐'}
          </span>
        </div>

        <div className="text-[12px] text-text-secondary leading-normal">
          {syncStatus === 'offline' ? (
            <span className="whitespace-nowrap">当前网络不可用，您的修改将安全保存在本地</span>
          ) : conflictsCount > 0 ? (
            <span className="whitespace-nowrap">
              发现 {conflictsCount} 项版本冲突，请手动解决以恢复同步
            </span>
          ) : errorCount > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="whitespace-nowrap">{errorCount} 项更改在上传时遇到问题</span>
              {errorMessage && (
                <span
                  className="text-red-500 line-clamp-2 break-all whitespace-normal"
                  title={errorMessage}
                >
                  {errorMessage}
                </span>
              )}
            </div>
          ) : syncStatus === 'error' ? (
            <span className="break-all whitespace-normal">
              {errorMessage || '同步过程中发生未知错误'}
            </span>
          ) : hasRemoteUpdates ? (
            <span className="whitespace-nowrap">云端有新的数据更新，点击同步以获取最新内容</span>
          ) : pendingCount > 0 ? (
            <span className="whitespace-nowrap">有 {pendingCount} 项本地修改等待上传</span>
          ) : (
            <span className="whitespace-nowrap">所有本地修改已成功保存到云端</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mt-1 pt-2 border-t border-border-color">
          <span className="text-[12px] text-text-secondary/70 whitespace-nowrap">
            {lastSyncAt ? `上次同步: ${new Date(lastSyncAt).toLocaleTimeString()}` : '尚未同步'}
          </span>

          {conflictsCount > 0 ? (
            <button
              onClick={() => {
                onClose();
                onOpenConflicts();
              }}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
            >
              处理冲突
            </button>
          ) : errorCount > 0 || syncStatus === 'error' ? (
            <button
              onClick={() => {
                onRetry();
              }}
              disabled={syncStatus === 'syncing'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <RotateCcw size={12} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
              {syncStatus === 'syncing' ? '重试中' : '重试'}
            </button>
          ) : pendingCount > 0 || hasRemoteUpdates ? (
            <button
              onClick={() => {
                onSync();
              }}
              disabled={syncStatus === 'syncing'}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-bg-main hover:bg-hover-bg border border-border-color transition-colors shadow-sm disabled:opacity-50"
            >
              {syncStatus === 'syncing' ? '同步中' : '立即同步'}
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
