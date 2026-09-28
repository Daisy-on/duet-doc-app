import React, { useEffect, useRef } from 'react';
import { BookOpen, X, FileText, StickyNote, Image as ImageIcon, HelpCircle } from 'lucide-react';
import type { KnowledgeSource } from '../store/aiWritingStore';
import AISourceCard from './AISourceCard';

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

  const renderGroup = (title: string, icon: React.ReactNode, items: SourceWithOriginalIndex[]) => {
    if (items.length === 0) return null;

    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary select-none">
          {icon}
          <span>{title}</span>
          <span className="text-[13px] text-text-ghost font-normal">· {items.length}</span>
        </div>

        <div className="space-y-2.5">
          {items.map(({ source, originalIndex }) => (
            <AISourceCard
              key={`${source.sourceType}:${source.sourceId}:${source.chunkIndex}:${originalIndex}`}
              id={`drawer-source-item-${originalIndex}`}
              source={source}
              originalIndex={originalIndex}
              isTarget={highlightedIndex === originalIndex}
              onOpenSource={onOpenSource}
              onHoverSource={onHoverSource}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile / Tablet Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-xs z-30 lg:hidden transition-opacity duration-200 ease-out ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <aside
        ref={containerRef}
        style={{ width: isOpen ? undefined : 0 }}
        className={`fixed lg:relative top-0 right-0 bottom-0 shrink-0 bg-bg-main flex flex-col h-full z-40 lg:z-20 transition-all duration-200 ease-out overflow-hidden ${
          isOpen
            ? 'w-full sm:w-[350px] xl:w-[370px] max-w-[85vw] border-l border-border-color shadow-xl lg:shadow-none translate-x-0 opacity-100'
            : 'w-0 border-l-0 shadow-none translate-x-full lg:translate-x-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-full sm:w-[350px] xl:w-[370px] max-w-[85vw] h-full flex flex-col">
          {/* Header (aligned with main top header at 60px, no border-b, same bg-bg-main) */}
          <div className="h-[60px] px-4 flex items-center justify-between shrink-0 select-none bg-bg-main">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-emerald-500 dark:text-emerald-400" />
              <span className="text-sm font-bold text-text-primary">参考来源</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-hover-bg text-text-secondary font-semibold border border-border-color/60">
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
                  <FileText size={13} className="text-amber-500 dark:text-amber-400" />,
                  docSources,
                )}
                {renderGroup(
                  '轻量小记',
                  <StickyNote size={13} className="text-emerald-500 dark:text-emerald-400" />,
                  memoSources,
                )}
                {renderGroup(
                  '图片素材',
                  <ImageIcon size={13} className="text-blue-500 dark:text-blue-400" />,
                  imageSources,
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
