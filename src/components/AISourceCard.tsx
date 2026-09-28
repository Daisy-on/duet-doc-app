import { FileText, StickyNote, Image as ImageIcon } from 'lucide-react';
import type { KnowledgeSource } from '../store/aiWritingStore';

export interface AISourceCardProps {
  source: KnowledgeSource;
  originalIndex: number;
  isTarget?: boolean;
  onOpenSource?: (source: KnowledgeSource) => void;
  onHoverSource?: (index: number | null) => void;
  className?: string;
  id?: string;
}

export default function AISourceCard({
  source,
  originalIndex,
  isTarget = false,
  onOpenSource,
  onHoverSource,
  className = '',
  id,
}: AISourceCardProps) {
  return (
    <div
      id={id}
      onMouseEnter={() => onHoverSource?.(originalIndex)}
      onMouseLeave={() => onHoverSource?.(null)}
      onClick={() => onOpenSource?.(source)}
      title="点击在知识库中打开对应原文"
      className={`group relative rounded-xl p-3.5 transition-all duration-200 cursor-pointer select-none border ${
        isTarget
          ? 'border-border-color ring-2 ring-border-color/40 bg-hover-bg/50 shadow-xs'
          : 'border-transparent hover:bg-hover-bg/50 hover:shadow-md shadow-none'
      } ${className}`}
    >
      {/* Top: [1] badge + icon + Title + chunk label */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold border shrink-0 transition-colors ${
              isTarget
                ? 'bg-hover-bg text-text-primary border-border-color'
                : 'bg-hover-bg text-text-secondary border-border-color/60'
            }`}
          >
            {originalIndex}
          </span>
          {source.sourceType === 'image' ? (
            <ImageIcon size={13.5} className="shrink-0 text-blue-500 dark:text-blue-400" />
          ) : source.sourceType === 'memo' ? (
            <StickyNote size={13.5} className="shrink-0 text-emerald-500 dark:text-emerald-400" />
          ) : (
            <FileText size={13.5} className="shrink-0 text-amber-500 dark:text-amber-400" />
          )}
          <span className="text-xs font-semibold text-text-primary truncate">{source.title}</span>
        </div>
        <span className="text-[12px] text-text-ghost shrink-0 font-medium">
          {source.sourceType === 'image'
            ? '图片'
            : source.sourceType === 'memo'
              ? '小记'
              : `片段 ${source.chunkIndex + 1}`}
        </span>
      </div>

      {/* Heading Path breadcrumb */}
      {source.headingPath?.length > 0 && (
        <div className="text-[13px] text-text-primary truncate font-sans mb-1.5">
          {source.headingPath.join(' › ')}
        </div>
      )}

      {/* Excerpt quote */}
      {source.excerpt && (
        <div className="text-[12px] text-text-secondary leading-relaxed line-clamp-5 font-sans break-words select-text">
          {source.excerpt}
        </div>
      )}
    </div>
  );
}
