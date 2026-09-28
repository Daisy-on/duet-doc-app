import React, { useEffect, useRef } from 'react';
import {
  BookOpen,
  X,
  FileText,
  StickyNote,
  Image as ImageIcon,
  ArrowUpRight,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import type { KnowledgeSource } from '../store/aiWritingStore';

interface AISourcesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sources: KnowledgeSource[];
  highlightedIndex?: number | null;
  onOpenSource: (source: KnowledgeSource) => void;
  onHoverSource?: (index: number | null) => void;
}

interface SourceWithOriginalIndex {
  source: KnowledgeSource;
  originalIndex: number;
}

export default function AISourcesDrawer({
  isOpen,
  onClose,
  sources,
  highlightedIndex,
  onOpenSource,
  onHoverSource,
}: AISourcesDrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to highlighted item
  useEffect(() => {
    if (!isOpen || !highlightedIndex) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(`drawer-source-item-${highlightedIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [isOpen, highlightedIndex]);

  // Group sources preserving original 1-based index matching [S1], [S2]
  const indexedSources: SourceWithOriginalIndex[] = sources.map((source, idx) => ({
    source,
    originalIndex: idx + 1,
  }));

  const docSources = indexedSources.filter((item) => item.source.sourceType === 'document');
  const memoSources = indexedSources.filter((item) => item.source.sourceType === 'memo');
  const imageSources = indexedSources.filter((item) => item.source.sourceType === 'image');

  if (!isOpen) return null;

  const renderGroup = (title: string, icon: React.ReactNode, items: SourceWithOriginalIndex[]) => {
    if (items.length === 0) return null;

    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary select-none">
          {icon}
          <span>{title}</span>
          <span className="text-[11px] text-text-ghost font-normal">· {items.length}</span>
        </div>

        <div className="space-y-2">
          {items.map(({ source, originalIndex }) => {
            const isTarget = highlightedIndex === originalIndex;

            return (
              <div
                key={`${source.sourceType}:${source.sourceId}:${source.chunkIndex}:${originalIndex}`}
                id={`drawer-source-item-${originalIndex}`}
                onMouseEnter={() => onHoverSource?.(originalIndex)}
                onMouseLeave={() => onHoverSource?.(null)}
                onClick={() => onOpenSource(source)}
                className={`group relative rounded-xl border p-3 transition-all cursor-pointer select-none bg-bg-main hover:bg-hover-bg/60 hover:border-indigo-300 dark:hover:border-indigo-700/60 shadow-xs hover:shadow-md ${
                  isTarget
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/20'
                    : 'border-border-color/80'
                }`}
              >
                {/* Top: [1] badge + icon + Title + Arrow */}
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800 shrink-0">
                      {originalIndex}
                    </span>
                    {source.sourceType === 'image' ? (
                      <ImageIcon size={13} className="shrink-0 text-sky-500" />
                    ) : source.sourceType === 'memo' ? (
                      <StickyNote size={13} className="shrink-0 text-emerald-500" />
                    ) : (
                      <FileText size={13} className="shrink-0 text-indigo-500" />
                    )}
                    <span className="text-xs font-medium text-text-primary group-hover:text-accent truncate">
                      {source.title}
                    </span>
                  </div>
                  <ArrowUpRight
                    size={14}
                    className="shrink-0 text-text-ghost group-hover:text-accent transition-colors opacity-70 group-hover:opacity-100"
                  />
                </div>

                {/* Heading Path breadcrumb */}
                {source.headingPath?.length > 0 && (
                  <div className="text-[10px] text-text-ghost truncate font-mono pl-[25px] mb-1.5">
                    {source.headingPath.join(' › ')}
                  </div>
                )}

                {/* Excerpt quote */}
                {source.excerpt && (
                  <div className="text-[11px] text-text-secondary leading-relaxed line-clamp-4 pl-[25px] font-sans break-words bg-hover-bg/50 rounded-lg p-2 border-l-2 border-indigo-400/80 dark:border-indigo-500/80 select-text">
                    {source.excerpt}
                  </div>
                )}

                {/* Action footer */}
                <div className="mt-2 pt-1.5 border-t border-border-color/40 flex items-center justify-end">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 group-hover:underline">
                    <span>在知识库中打开</span>
                    <ExternalLink size={11} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-xs z-30 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <aside
        ref={containerRef}
        className="absolute lg:relative top-0 right-0 bottom-0 w-[340px] sm:w-[370px] shrink-0 border-l border-border-color bg-bg-panel/95 backdrop-blur-md flex flex-col h-full z-40 lg:z-20 transition-all duration-300 shadow-xl lg:shadow-none animate-in slide-in-from-right"
      >
        {/* Header */}
        <div className="h-[52px] border-b border-border-color/80 px-4 flex items-center justify-between shrink-0 select-none bg-bg-panel">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-indigo-500" />
            <span className="text-sm font-bold text-text-primary">参考来源</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/80 dark:text-indigo-400 font-semibold border border-indigo-200/60 dark:border-indigo-800">
              {sources.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <div
              className="text-text-ghost hover:text-text-secondary p-1 rounded-md transition-colors cursor-pointer"
              title="此处展示当前回答引用的知识库证据切片"
            >
              <HelpCircle size={15} />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-hover-bg transition-colors cursor-pointer"
              title="关闭来源面板"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Sources Content List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {sources.length === 0 ? (
            <div className="text-center py-12 text-text-ghost text-xs">
              当前回答暂无引用的知识库内容
            </div>
          ) : (
            <>
              {renderGroup(
                '知识库文档',
                <FileText size={13} className="text-indigo-500" />,
                docSources,
              )}
              {renderGroup(
                '轻量小记',
                <StickyNote size={13} className="text-emerald-500" />,
                memoSources,
              )}
              {renderGroup(
                '图片素材',
                <ImageIcon size={13} className="text-sky-500" />,
                imageSources,
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
