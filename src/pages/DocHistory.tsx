import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, History, Check, ChevronDown } from 'lucide-react';
import { db, type DocumentVersion } from '../db';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import { diffLines, jsonToLines, type DiffResult } from '../utils/diff';
import DocHistorySkeleton from '../components/DocHistorySkeleton';

export default function DocHistory() {
  const { kbId, docId } = useParams<{ kbId: string; docId: string }>();
  const navigate = useNavigate();
  const { documents, restoreVersion, flushDocumentAutosave } = useKnowledgeBaseStore();

  const doc = documents.find((d) => d.id === docId);

  // States
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string>(''); // Left panel (selected from list)
  const [compareId, setCompareId] = useState<string>(''); // Right panel (selected from dropdown)
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Split Panel Resize States
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  // Scroll Sync Refs
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const scrollLock = useRef<string | null>(null);

  const leftVer = versions.find((v) => v.id === selectedId);
  const rightVer = versions.find((v) => v.id === compareId);

  // Load versions
  useEffect(() => {
    if (!docId) return;
    let cancelled = false;

    async function fetchVersions() {
      try {
        setLoading(true);
        const currentDoc = useKnowledgeBaseStore.getState().documents.find((d) => d.id === docId);
        if (docId && currentDoc) {
          await flushDocumentAutosave(docId);
        }
        if (cancelled) return;

        const dbVersions = await db.documentVersions
          .where('docId')
          .equals(docId as string)
          .toArray();

        if (cancelled) return;

        // Sort descending (newest first)
        const sorted = dbVersions.sort((a, b) => b.createdAt - a.createdAt);
        setVersions(sorted);

        // Select the newest version by default, and compare with the latest version
        if (sorted.length > 0) {
          if (sorted.length >= 2) {
            setSelectedId(sorted[1].id); // left panel: second newest
            setCompareId(sorted[0].id); // right panel: newest
          } else {
            setSelectedId(sorted[0].id); // left panel: newest
            setCompareId(sorted[0].id); // right panel: newest
          }
        }
      } catch (err) {
        if (!cancelled) console.error('Failed to fetch versions:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchVersions();

    return () => {
      cancelled = true;
    };
  }, [docId, flushDocumentAutosave]);

  // Handle sidebar selection click
  const handleSelect = (vId: string) => {
    setSelectedId(vId);
  };

  // Close comparison version dropdown on outside click or Escape
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  // Run diffing when comparison targets change
  const diffResults = useMemo(() => {
    if (!leftVer || !rightVer) return [];
    const leftLines = jsonToLines(leftVer.content);
    const rightLines = jsonToLines(rightVer.content);
    return diffLines(leftLines, rightLines);
  }, [leftVer, rightVer]);

  // Dragging handlers for Resizer
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const percent = (offsetX / rect.width) * 100;
      if (percent >= 15 && percent <= 85) {
        setSplitPercent(percent);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Synchronized scrolling (Vertical only, no horizontal scroll sync)
  const handleScroll = (source: 'left' | 'right') => {
    const leftEl = leftScrollRef.current;
    const rightEl = rightScrollRef.current;

    if (!leftEl || !rightEl) return;

    if (scrollLock.current === null) {
      scrollLock.current = source;
      if (source === 'left') {
        rightEl.scrollTop = leftEl.scrollTop;
      } else {
        leftEl.scrollTop = rightEl.scrollTop;
      }

      requestAnimationFrame(() => {
        scrollLock.current = null;
      });
    }
  };

  // Restore action
  const handleRestore = async () => {
    if (!selectedId || restoring) return;

    try {
      setRestoring(true);
      const res = await restoreVersion(selectedId);
      if (res && res.restored === false) {
        const count = res.missingAssetIds?.length || 0;
        alert(`恢复版本失败：检测到该历史版本有 ${count} 张图片原始文件已被销毁，无法还原。`);
        return;
      }
      // Navigate back to the doc editor
      navigate(`/kb/${kbId}/doc/${docId}`);
    } catch (err) {
      console.error(err);
      alert('恢复版本失败，请重试');
    } finally {
      setRestoring(false);
    }
  };

  if (loading) {
    return <DocHistorySkeleton />;
  }

  if (!doc) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-main text-text-primary">
        <div className="text-center">
          <h2 className="text-lg font-bold mb-2 text-text-primary">文档不存在</h2>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-accent hover:opacity-90 text-white rounded-lg text-xs font-semibold shadow-sm transition-opacity cursor-pointer"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  // Format timestamp helper
  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Version identity tag helper
  const getTag = (type: string) => {
    switch (type) {
      case 'published':
        return (
          <span className="bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium">
            已发布
          </span>
        );
      case 'manual':
        return (
          <span className="bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium">
            手动保存
          </span>
        );
      default:
        return (
          <span className="bg-hover-bg text-text-secondary border border-border-color text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium">
            自动保存
          </span>
        );
    }
  };

  // Determine if content is identical
  const isIdentical = diffResults.every(
    (item: DiffResult) => item.left.type === 'normal' && item.right.type === 'normal',
  );

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-main text-text-primary select-none">
      {/* Global Top Bar */}
      <header className="h-[60px] border-b border-border-color flex justify-between items-center px-4 shrink-0 bg-bg-main">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(`/kb/${kbId}/doc/${docId}`)}
            className="p-1.5 hover:bg-hover-bg rounded-lg transition-colors cursor-pointer text-text-secondary hover:text-text-primary"
            title="返回编辑页"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-semibold text-[15px] text-text-primary shrink-0">历史记录</h2>
            <div className="w-[1px] h-3.5 bg-border-color mx-1.5 shrink-0" />
            <p className="text-[13px] text-text-secondary truncate max-w-[200px] sm:max-w-[300px]">
              {doc.title}
            </p>
          </div>
          <div className="ml-4 flex items-center gap-2">
            <span className="bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-md text-xs text-blue-600 dark:text-blue-400 font-semibold border border-blue-200/80 dark:border-blue-800/60 flex items-center gap-1.5 shrink-0">
              <History size={13} />
              对比视图
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Select comparison version custom dropdown */}
          <div className="flex items-center gap-2 text-xs text-text-secondary whitespace-nowrap">
            <span>将当前选中版本与</span>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer bg-bg-main shadow-2xs ${
                  isDropdownOpen
                    ? 'border-blue-500 ring-2 ring-blue-500/20 text-text-primary'
                    : 'border-border-color hover:border-text-secondary/50 text-text-primary hover:bg-hover-bg/60'
                }`}
                aria-haspopup="listbox"
                aria-expanded={isDropdownOpen}
              >
                <Clock size={12} className="text-text-secondary shrink-0" />
                <span>{rightVer ? formatTime(rightVer.createdAt) : '选择版本'}</span>
                {rightVer && getTag(rightVer.saveType)}
                <ChevronDown
                  size={13}
                  className={`text-text-secondary transition-transform duration-200 shrink-0 ${
                    isDropdownOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
                  }`}
                />
              </button>

              {/* Modern Dropdown Popover Menu */}
              {isDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-full bg-bg-main border border-border-color rounded-xl shadow-xl py-1 animate-dropdown-fade-in max-h-72 overflow-y-auto custom-scrollbar">
                  <div className="px-2.5 py-1 text-[11px] font-semibold text-text-secondary/70 uppercase tracking-wider select-none border-b border-border-color/40 mb-1">
                    选择对比版本 ({versions.length})
                  </div>
                  {versions.map((v) => {
                    const isSelected = v.id === compareId;
                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          setCompareId(v.id);
                          setIsDropdownOpen(false);
                        }}
                        className={`flex items-center justify-between px-2.5 py-1.5 mx-1 rounded-lg text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/90 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold'
                            : 'text-text-primary hover:bg-hover-bg'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Clock
                            size={12}
                            className={
                              isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-text-ghost'
                            }
                          />
                          <span className="truncate">{formatTime(v.createdAt)}</span>
                        </div>
                        <div className="shrink-0">{getTag(v.saveType)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <span>对比</span>
          </div>

          <div className="w-[1px] h-4 bg-border-color shrink-0" />

          <span className="text-[11px] text-text-secondary bg-bg-panel border border-border-color rounded-md px-2 py-0.5 flex gap-2 shrink-0">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              新增内容
            </span>
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              删除内容
            </span>
          </span>

          <button
            onClick={handleRestore}
            disabled={!selectedId || restoring}
            className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer text-white ${
              !selectedId || restoring
                ? 'bg-border-color text-text-ghost cursor-not-allowed shadow-none'
                : 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 hover:shadow'
            }`}
          >
            {restoring ? '正在恢复...' : '恢复此记录'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* 1. Left Sidebar - Checklist of history snapshots (Narrowed to 240px) */}
        <aside className="w-[240px] border-r border-border-color bg-bg-sidebar flex flex-col shrink-0">
          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
            {loading ? (
              <div className="text-center py-8 text-xs text-text-ghost">正在读取历史版本...</div>
            ) : versions.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-ghost">暂无版本历史</div>
            ) : (
              versions.map((v) => {
                const active = selectedId === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => handleSelect(v.id)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-2 ${
                      active
                        ? 'bg-blue-50/70 dark:bg-blue-950/50 border-blue-400/80 dark:border-blue-600/80 text-blue-950 dark:text-blue-200 shadow-xs'
                        : 'bg-bg-main border-border-color/40 text-text-primary hover:bg-hover-bg hover:border-border-color shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Clock
                          size={12}
                          className={
                            active ? 'text-blue-600 dark:text-blue-400' : 'text-text-ghost'
                          }
                        />
                        <span>{formatTime(v.createdAt)}</span>
                      </div>
                      {getTag(v.saveType)}
                    </div>
                    <div className="text-[11px] text-text-secondary truncate flex items-center justify-between">
                      <span className="truncate">修改者: Daisy</span>
                      {active && (
                        <Check size={12} className="text-blue-600 dark:text-blue-400 shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* 2. Right Panel - Side-by-side comparison */}
        <main className="flex-1 flex flex-col min-w-0 bg-bg-main">
          {/* Diff Canvas Area */}
          <div ref={containerRef} className="flex-1 flex overflow-hidden relative bg-bg-main">
            {isIdentical ? (
              <div className="flex-1 flex items-center justify-center bg-bg-panel/30">
                <div className="text-center p-8 border border-border-color rounded-xl bg-bg-main shadow-sm max-w-sm w-full mx-4">
                  <div className="text-text-ghost mb-3 font-mono text-xs uppercase tracking-wider">
                    === NO DIFFERENCE ===
                  </div>
                  <div className="text-text-primary font-semibold text-base mb-1">内容一致</div>
                  <div className="text-text-secondary text-xs">
                    选中的版本与对比的版本在内容上完全相同
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Left Column - Selected Version (Base) */}
                <div
                  ref={leftScrollRef}
                  onScroll={() => handleScroll('left')}
                  className="overflow-auto custom-scrollbar bg-bg-sidebar/50 flex flex-col font-mono text-[13px] leading-relaxed select-text min-w-0"
                  style={{ width: `calc(${splitPercent}% - 2px)`, flexShrink: 0 }}
                >
                  {/* Version Sticky Header (Source) */}
                  <div className="sticky top-0 z-10 bg-bg-sidebar/90 backdrop-blur-sm border-b border-border-color px-4 py-2.5 flex items-center justify-between text-xs text-text-secondary font-sans select-none shrink-0">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Clock size={12} className="text-blue-600 dark:text-blue-400" />
                      <span>源版本: {leftVer ? formatTime(leftVer.createdAt) : '无'}</span>
                    </div>
                    {leftVer && getTag(leftVer.saveType)}
                  </div>

                  {/* Lines Content */}
                  <div className="py-4 flex-1">
                    {diffResults.map((line: DiffResult, idx: number) => {
                      const type = line.left.type;
                      let bgClass = 'hover:bg-hover-bg/60';
                      let lineNumClass = 'text-text-ghost';
                      if (type === 'deleted') {
                        bgClass =
                          'bg-red-500/10 text-red-700 dark:text-red-300 border-l-4 border-red-500 hover:bg-red-500/20';
                        lineNumClass = 'text-red-500 font-bold';
                      } else if (type === 'empty') {
                        bgClass = 'bg-hover-bg/40 text-transparent select-none';
                        lineNumClass = 'text-border-color';
                      } else {
                        bgClass += ' border-l-4 border-transparent';
                      }

                      return (
                        <div
                          key={`left-${idx}`}
                          className={`flex items-start shrink-0 min-w-max ${bgClass}`}
                        >
                          <div
                            className={`w-12 shrink-0 text-right pr-3 select-none text-[11px] font-sans ${lineNumClass}`}
                          >
                            {type === 'empty' ? ' ' : line.left.lineNumber}
                          </div>
                          <pre className="m-0 pl-1 whitespace-pre pr-8">
                            {type === 'empty' ? ' ' : line.left.text || ' '}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Draggable Resizer Divider (拉风箱样式边界调整) */}
                <div
                  onMouseDown={handleMouseDown}
                  className="w-1 bg-border-color hover:bg-blue-500 cursor-col-resize select-none shrink-0 transition-colors z-20 flex items-center justify-center group relative"
                  title="拖动调整分栏大小"
                >
                  <div className="absolute w-3 h-full cursor-col-resize" />
                  <div className="w-[1px] h-8 bg-text-ghost/50 group-hover:bg-bg-main" />
                </div>

                {/* Right Column - Compare Version (Target) */}
                <div
                  ref={rightScrollRef}
                  onScroll={() => handleScroll('right')}
                  className="flex-1 overflow-auto custom-scrollbar bg-bg-main flex flex-col font-mono text-[13px] leading-relaxed select-text min-w-0"
                >
                  {/* Version Sticky Header (Target) */}
                  <div className="sticky top-0 z-10 bg-bg-main/90 backdrop-blur-sm border-b border-border-color px-4 py-2.5 flex items-center justify-between text-xs text-text-secondary font-sans select-none shrink-0">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Clock size={12} className="text-emerald-600 dark:text-emerald-400" />
                      <span>对比版本: {rightVer ? formatTime(rightVer.createdAt) : '无'}</span>
                    </div>
                    {rightVer && getTag(rightVer.saveType)}
                  </div>

                  {/* Lines Content */}
                  <div className="py-4 flex-1">
                    {diffResults.map((line: DiffResult, idx: number) => {
                      const type = line.right.type;
                      let bgClass = 'hover:bg-hover-bg/60';
                      let lineNumClass = 'text-text-ghost';
                      if (type === 'added') {
                        bgClass =
                          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-l-4 border-emerald-500 hover:bg-emerald-500/20';
                        lineNumClass = 'text-emerald-600 font-bold';
                      } else if (type === 'empty') {
                        bgClass = 'bg-hover-bg/40 text-transparent select-none';
                        lineNumClass = 'text-border-color';
                      } else {
                        bgClass += ' border-l-4 border-transparent';
                      }

                      return (
                        <div
                          key={`right-${idx}`}
                          className={`flex items-start shrink-0 min-w-max ${bgClass}`}
                        >
                          <div
                            className={`w-12 shrink-0 text-right pr-3 select-none text-[11px] font-sans ${lineNumClass}`}
                          >
                            {type === 'empty' ? ' ' : line.right.lineNumber}
                          </div>
                          <pre className="m-0 pl-1 whitespace-pre pr-8">
                            {type === 'empty' ? ' ' : line.right.text || ' '}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
