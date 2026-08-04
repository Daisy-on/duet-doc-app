import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, History, Check } from 'lucide-react';
import { db, type DocumentVersion } from '../db';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import { diffLines, jsonToLines, type DiffResult } from '../utils/diff';

import { saveCoordinator } from '../utils/SaveCoordinator';

export default function DocHistory() {
  const { kbId, docId } = useParams<{ kbId: string; docId: string }>();
  const navigate = useNavigate();
  const { documents, restoreVersion, persistDocumentNow } = useKnowledgeBaseStore();

  const doc = documents.find((d) => d.id === docId);

  // States
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string>(''); // Left panel (selected from list)
  const [compareId, setCompareId] = useState<string>('');     // Right panel (selected from dropdown)
  const [diffResults, setDiffResults] = useState<DiffResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  // Split Panel Resize States
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const isDragging = useRef(false);

  // Scroll Sync Refs
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const scrollLock = useRef<string | null>(null);

  const leftVer = versions.find((v) => v.id === selectedId);
  const rightVer = versions.find((v) => v.id === compareId);

  // Load versions
  useEffect(() => {
    if (!docId) return;

    async function fetchVersions() {
      try {
        setLoading(true);
        if (docId && doc) {
          await saveCoordinator.pauseAndFlush(docId, async (id, updates) => {
            await persistDocumentNow(id, updates);
          });
          saveCoordinator.resume(docId);
        }
        const dbVersions = await db.documentVersions
          .where('docId')
          .equals(docId as string)
          .toArray();

        // Sort descending (newest first)
        const sorted = dbVersions.sort((a, b) => b.createdAt - a.createdAt);
        setVersions(sorted);

        // Select the newest version by default, and compare with the latest version
        if (sorted.length > 0) {
          if (sorted.length >= 2) {
            setSelectedId(sorted[1].id); // left panel: second newest
            setCompareId(sorted[0].id);  // right panel: newest
          } else {
            setSelectedId(sorted[0].id); // left panel: newest
            setCompareId(sorted[0].id);  // right panel: newest
          }
        }
      } catch (err) {
        console.error('Failed to fetch versions:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchVersions();
  }, [docId, doc]);

  // Handle sidebar selection click
  const handleSelect = (vId: string) => {
    setSelectedId(vId);
  };

  // Run diffing when comparison targets change
  useEffect(() => {
    if (leftVer && rightVer) {
      const leftLines = jsonToLines(leftVer.content);
      const rightLines = jsonToLines(rightVer.content);
      const results = diffLines(leftLines, rightLines);
      setDiffResults(results);
    }
  }, [leftVer, rightVer]);

  // Dragging handlers for Resizer
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percent = (offsetX / rect.width) * 100;
    // Boundary check, ensure neither column disappears (15% to 85%)
    if (percent >= 15 && percent <= 85) {
      setSplitPercent(percent);
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

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

  if (!doc) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white text-gray-800">
        <div className="text-center">
          <h2 className="text-lg font-bold mb-2 text-gray-900">文档不存在</h2>
          <button 
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs"
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
        return <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium">已发布</span>;
      case 'manual':
        return <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium">手动保存</span>;
      default:
        return <span className="bg-gray-100 text-gray-600 border border-gray-200 text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium">自动保存</span>;
    }
  };

  // Determine if content is identical
  const isIdentical = diffResults.every((item) => item.left.type === 'normal' && item.right.type === 'normal');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-gray-800 select-none">
      
      {/* 1. Left Sidebar - Checklist of history snapshots (Narrowed to 240px) */}
      <aside className="w-[240px] border-r border-gray-200 bg-gray-50 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-200 flex items-center gap-3 bg-white">
          <button
            onClick={() => navigate(`/kb/${kbId}/doc/${docId}`)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-900"
            title="返回编辑页"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm truncate text-gray-900">历史记录</h2>
            <p className="text-[11px] text-gray-500 truncate mt-0.5">{doc.title}</p>
          </div>
        </div>

        <div className="p-3 border-b border-gray-200 bg-gray-50 text-[11px] text-gray-500 space-y-1">
          <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-gray-100 transition-colors">
            <input type="checkbox" checked={true} readOnly className="accent-indigo-600 rounded" />
            <span>显示所有本地存储版本</span>
          </label>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
          {loading ? (
            <div className="text-center py-8 text-xs text-gray-400">正在读取历史版本...</div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400">暂无版本历史</div>
          ) : (
            versions.map((v) => {
              const active = selectedId === v.id;
              return (
                <div
                  key={v.id}
                  onClick={() => handleSelect(v.id)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-2 ${
                    active
                      ? 'bg-indigo-50/60 border-indigo-400 text-indigo-900 shadow-sm'
                      : 'bg-white border-transparent text-gray-700 hover:bg-gray-100 hover:border-gray-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <Clock size={12} className={active ? 'text-indigo-600' : 'text-gray-400'} />
                      <span>{formatTime(v.createdAt)}</span>
                    </div>
                    {getTag(v.saveType)}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate flex items-center justify-between">
                    <span className="truncate">修改者: Daisy</span>
                    {active && <Check size={12} className="text-indigo-600 shrink-0" />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* 2. Right Panel - Side-by-side comparison */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        
        {/* Top Control Bar */}
        <header className="h-[60px] border-b border-gray-200 flex justify-between items-center px-6 shrink-0 bg-white">
          <div className="flex items-center gap-3.5 text-sm min-w-0">
            <span className="bg-indigo-50 px-2.5 py-1 rounded text-xs text-indigo-600 font-semibold border border-indigo-100 flex items-center gap-1.5 shrink-0">
              <History size={13} />
              对比视图
            </span>

            {/* Select comparison version dropdown */}
            <div className="flex items-center gap-2 text-xs text-gray-500 ml-2 overflow-x-auto whitespace-nowrap py-1">
              <span>当前选中版本与</span>
              <select
                value={compareId}
                onChange={(e) => setCompareId(e.target.value)}
                className="bg-white border border-gray-300 rounded px-2.5 py-1 outline-none text-gray-800 cursor-pointer focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors text-xs font-medium"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {formatTime(v.createdAt)} ({v.saveType === 'auto' ? '自动保存' : v.saveType === 'manual' ? '手动保存' : '已发布'})
                  </option>
                ))}
              </select>
              <span>对比</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-0.5 flex gap-2 shrink-0">
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                新增内容
              </span>
              <span className="flex items-center gap-1 text-red-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                删除内容
              </span>
            </span>

            <button
              onClick={handleRestore}
              disabled={!selectedId || restoring}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer text-white ${
                !selectedId || restoring
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow'
              }`}
            >
              {restoring ? '正在恢复...' : '恢复此记录'}
            </button>
          </div>
        </header>

        {/* Diff Canvas Area */}
        <div ref={containerRef} className="flex-1 flex overflow-hidden relative bg-white">
          {isIdentical ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50/30">
              <div className="text-center p-8 border border-gray-200 rounded-xl bg-white shadow-sm max-w-sm w-full mx-4">
                <div className="text-gray-400 mb-3 font-mono text-xs uppercase tracking-wider">=== NO DIFFERENCE ===</div>
                <div className="text-gray-900 font-semibold text-base mb-1">内容一致</div>
                <div className="text-gray-500 text-xs">选中的版本与对比的版本在内容上完全相同</div>
              </div>
            </div>
          ) : (
            <>
              {/* Left Column - Selected Version (Base) */}
              <div
                ref={leftScrollRef}
                onScroll={() => handleScroll('left')}
                className="border-r border-gray-200 overflow-auto custom-scrollbar bg-gray-50/50 flex flex-col font-mono text-[13px] leading-relaxed select-text"
                style={{ width: `${splitPercent}%`, flexGrow: 0, flexShrink: 0 }}
              >
                {/* Version Sticky Header (Source) */}
                <div className="sticky top-0 z-10 bg-gray-100/90 backdrop-blur-sm border-b border-gray-200 px-4 py-2.5 flex items-center justify-between text-xs text-gray-600 font-sans select-none shrink-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Clock size={12} className="text-indigo-600" />
                    <span>源版本: {leftVer ? formatTime(leftVer.createdAt) : '无'}</span>
                  </div>
                  {leftVer && getTag(leftVer.saveType)}
                </div>

                {/* Lines Content */}
                <div className="py-4 flex-1">
                  {diffResults.map((line, idx) => {
                    const type = line.left.type;
                    let bgClass = 'hover:bg-gray-100/60';
                    let lineNumClass = 'text-gray-400';
                    if (type === 'deleted') {
                      bgClass = 'bg-red-50 text-red-950 border-l-4 border-red-500 hover:bg-red-100/70';
                      lineNumClass = 'text-red-500 font-bold';
                    } else if (type === 'empty') {
                      bgClass = 'bg-gray-100/40 text-transparent select-none';
                      lineNumClass = 'text-gray-200';
                    } else {
                      bgClass += ' border-l-4 border-transparent';
                    }

                    return (
                      <div key={`left-${idx}`} className={`flex items-start shrink-0 min-w-max ${bgClass}`}>
                        <div className={`w-12 shrink-0 text-right pr-3 select-none text-[11px] font-sans ${lineNumClass}`}>
                          {type === 'empty' ? ' ' : line.left.lineNumber}
                        </div>
                        <pre className="m-0 pl-1 whitespace-pre pr-8">{type === 'empty' ? ' ' : line.left.text || ' '}</pre>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Draggable Resizer Divider (拉风箱样式边界调整) */}
              <div
                onMouseDown={handleMouseDown}
                className="w-1 bg-gray-200 hover:bg-indigo-500 cursor-col-resize select-none shrink-0 transition-colors z-20 flex items-center justify-center group relative"
                title="拖动调整分栏大小"
              >
                <div className="absolute w-3 h-full cursor-col-resize" />
                <div className="w-[1px] h-8 bg-gray-400/50 group-hover:bg-white" />
              </div>

              {/* Right Column - Compare Version (Target) */}
              <div
                ref={rightScrollRef}
                onScroll={() => handleScroll('right')}
                className="overflow-auto custom-scrollbar bg-white flex flex-col font-mono text-[13px] leading-relaxed select-text"
                style={{ width: `${100 - splitPercent}%`, flexGrow: 0, flexShrink: 0 }}
              >
                {/* Version Sticky Header (Target) */}
                <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-200 px-4 py-2.5 flex items-center justify-between text-xs text-gray-600 font-sans select-none shrink-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Clock size={12} className="text-emerald-600" />
                    <span>对比版本: {rightVer ? formatTime(rightVer.createdAt) : '无'}</span>
                  </div>
                  {rightVer && getTag(rightVer.saveType)}
                </div>

                {/* Lines Content */}
                <div className="py-4 flex-1">
                  {diffResults.map((line, idx) => {
                    const type = line.right.type;
                    let bgClass = 'hover:bg-gray-55';
                    let lineNumClass = 'text-gray-400';
                    if (type === 'added') {
                      bgClass = 'bg-emerald-50 text-emerald-950 border-l-4 border-emerald-500 hover:bg-emerald-100/70';
                      lineNumClass = 'text-emerald-600 font-bold';
                    } else if (type === 'empty') {
                      bgClass = 'bg-gray-100/40 text-transparent select-none';
                      lineNumClass = 'text-gray-200';
                    } else {
                      bgClass += ' border-l-4 border-transparent';
                    }

                    return (
                      <div key={`right-${idx}`} className={`flex items-start shrink-0 min-w-max ${bgClass}`}>
                        <div className={`w-12 shrink-0 text-right pr-3 select-none text-[11px] font-sans ${lineNumClass}`}>
                          {type === 'empty' ? ' ' : line.right.lineNumber}
                        </div>
                        <pre className="m-0 pl-1 whitespace-pre pr-8">{type === 'empty' ? ' ' : line.right.text || ' '}</pre>
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
  );
}
