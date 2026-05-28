import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, History, Check } from 'lucide-react';
import { db } from '../db';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import { diffLines, jsonToLines, type DiffResult } from '../utils/diff';

interface VirtualVersion {
  id: string; // 'draft' or version id
  title: string;
  content: string;
  createdAt: number;
  saveType: 'draft' | 'auto' | 'backup';
}

export default function DocHistory() {
  const { kbId, docId } = useParams<{ kbId: string; docId: string }>();
  const navigate = useNavigate();
  const { documents, restoreVersion } = useKnowledgeBaseStore();

  const doc = documents.find((d) => d.id === docId);

  // States
  const [versions, setVersions] = useState<VirtualVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string>('draft');
  const [leftId, setLeftId] = useState<string>('');
  const [rightId, setRightId] = useState<string>('draft');
  const [diffResults, setDiffResults] = useState<DiffResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  // Scroll Sync Refs
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const scrollLock = useRef<string | null>(null);

  // Load versions
  useEffect(() => {
    if (!docId) return;

    async function fetchVersions() {
      try {
        setLoading(true);
        const dbVersions = await db.documentVersions
          .where('docId')
          .equals(docId as string)
          .toArray();

        // Sort descending (newest first)
        const sorted = dbVersions.sort((a, b) => b.createdAt - a.createdAt);

        const virtualList: VirtualVersion[] = [];

        // Add current live draft at the top
        if (doc) {
          virtualList.push({
            id: 'draft',
            title: doc.title,
            content: doc.content,
            createdAt: doc.updatedAt,
            saveType: 'draft',
          });
        }

        // Add db versions
        sorted.forEach((v) => {
          virtualList.push({
            id: v.id,
            title: v.title,
            content: v.content,
            createdAt: v.createdAt,
            saveType: v.saveType === 'auto' ? 'auto' : 'backup',
          });
        });

        setVersions(virtualList);

        // Select the live draft by default, and compare with the latest version
        if (virtualList.length > 0) {
          setSelectedId('draft');
          setRightId('draft');
          if (virtualList.length > 1) {
            setLeftId(virtualList[1].id);
          } else {
            setLeftId('draft'); // self-compare if no versions exist
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
    
    // Find index in list
    const index = versions.findIndex((v) => v.id === vId);
    if (index !== -1) {
      setRightId(vId);
      // Auto compare with the older version (index + 1)
      if (index + 1 < versions.length) {
        setLeftId(versions[index + 1].id);
      } else {
        // If it's the oldest version, compare it with itself (no diffs)
        setLeftId(vId);
      }
    }
  };

  // Run diffing when comparison targets change
  useEffect(() => {
    if (leftId === '' || rightId === '') return;

    const leftVer = versions.find((v) => v.id === leftId);
    const rightVer = versions.find((v) => v.id === rightId);

    if (leftVer && rightVer) {
      const leftLines = jsonToLines(leftVer.content);
      const rightLines = jsonToLines(rightVer.content);
      const results = diffLines(leftLines, rightLines);
      setDiffResults(results);
    }
  }, [leftId, rightId, versions]);

  // Synchronized scrolling
  const handleScroll = (source: 'left' | 'right') => {
    const leftEl = leftScrollRef.current;
    const rightEl = rightScrollRef.current;

    if (!leftEl || !rightEl) return;

    if (scrollLock.current === null) {
      scrollLock.current = source;
      if (source === 'left') {
        rightEl.scrollTop = leftEl.scrollTop;
        rightEl.scrollLeft = leftEl.scrollLeft;
      } else {
        leftEl.scrollTop = rightEl.scrollTop;
        leftEl.scrollLeft = rightEl.scrollLeft;
      }
      
      requestAnimationFrame(() => {
        scrollLock.current = null;
      });
    }
  };

  // Restore action
  const handleRestore = async () => {
    // We restore whatever is selected or specifically the version represented by rightId
    // If it's the draft, no need to restore
    if (rightId === 'draft') return;
    
    try {
      setRestoring(true);
      await restoreVersion(rightId);
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
      <div className="flex h-screen w-screen items-center justify-center bg-[#1e1e20] text-gray-200">
        <div className="text-center">
          <h2 className="text-lg font-bold mb-2">文档不存在</h2>
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
      case 'draft':
        return <span className="bg-indigo-900/60 text-indigo-300 border border-indigo-700 text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium">当前草稿</span>;
      case 'backup':
        return <span className="bg-rose-950/60 text-rose-300 border border-rose-900 text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium">覆盖备份</span>;
      default:
        return <span className="bg-gray-800/80 text-gray-400 border border-gray-700 text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium">自动保存</span>;
    }
  };

  // Determine if content is identical
  const isIdentical = diffResults.every((item) => item.left.type === 'normal' && item.right.type === 'normal');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1e1e20] text-gray-200 select-none">
      
      {/* 1. Left Sidebar - Checklist of history snapshots */}
      <aside className="w-[300px] border-r border-[#2d2d30] bg-[#18181a] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#2d2d30] flex items-center gap-3">
          <button
            onClick={() => navigate(`/kb/${kbId}/doc/${docId}`)}
            className="p-1.5 hover:bg-[#2d2d30] rounded-lg transition-colors cursor-pointer text-gray-400 hover:text-white"
            title="返回编辑页"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm truncate text-white">历史记录</h2>
            <p className="text-[11px] text-gray-400 truncate mt-0.5">{doc.title}</p>
          </div>
        </div>

        <div className="p-3 border-b border-[#2d2d30] bg-[#1a1a1c] text-[11px] text-gray-400 space-y-1">
          <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-[#2d2d30] transition-colors">
            <input type="checkbox" checked={false} disabled className="accent-indigo-500" />
            <span>仅显示已发布的历史记录</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-[#2d2d30] transition-colors">
            <input type="checkbox" checked={true} readOnly className="accent-indigo-500" />
            <span>显示所有本地存储版本</span>
          </label>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
          {loading ? (
            <div className="text-center py-8 text-xs text-gray-500">正在读取历史版本...</div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-500">暂无版本历史</div>
          ) : (
            versions.map((v) => {
              const active = selectedId === v.id;
              return (
                <div
                  key={v.id}
                  onClick={() => handleSelect(v.id)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-2 ${
                    active
                      ? 'bg-indigo-950/40 border-indigo-700 text-white shadow-md'
                      : 'bg-[#1f1f23]/60 border-transparent hover:bg-[#2d2d32] hover:border-gray-800 text-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <Clock size={12} className={active ? 'text-indigo-400' : 'text-gray-500'} />
                      <span>{formatTime(v.createdAt)}</span>
                    </div>
                    {getTag(v.saveType)}
                  </div>
                  <div className="text-[11px] text-gray-400 truncate flex items-center justify-between">
                    <span className="truncate">修改者: Daisy</span>
                    {active && <Check size={12} className="text-indigo-400 shrink-0" />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* 2. Right Panel - Side-by-side comparison */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#1e1e20]">
        
        {/* Top Control Bar */}
        <header className="h-[60px] border-b border-[#2d2d30] flex justify-between items-center px-6 shrink-0 bg-[#18181a]">
          <div className="flex items-center gap-3.5 text-sm min-w-0">
            <span className="bg-[#2d2d30] px-2.5 py-1 rounded text-xs text-indigo-300 font-semibold border border-indigo-800/40 flex items-center gap-1.5 shrink-0">
              <History size={13} />
              对比视图
            </span>

            {/* Select comparison version dropdown */}
            <div className="flex items-center gap-2 text-xs text-gray-400 ml-2 overflow-x-auto whitespace-nowrap py-1">
              <select
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
                className="bg-[#252528] border border-[#3e3e42] rounded px-2.5 py-1 outline-none text-gray-200 cursor-pointer focus:border-indigo-600 transition-colors"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id === 'draft' ? '当前草稿' : formatTime(v.createdAt)}
                  </option>
                ))}
              </select>
              <span>与</span>
              <select
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
                className="bg-[#252528] border border-[#3e3e42] rounded px-2.5 py-1 outline-none text-gray-200 cursor-pointer focus:border-indigo-600 transition-colors"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id === 'draft' ? '当前草稿' : formatTime(v.createdAt)}
                  </option>
                ))}
              </select>
              <span>对比</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[11px] text-gray-500 bg-[#2d2d30]/40 border border-[#3a3a3c] rounded-md px-2 py-0.5 flex gap-2 shrink-0">
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                新增内容
              </span>
              <span className="flex items-center gap-1 text-rose-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                删除内容
              </span>
            </span>

            <button
              onClick={handleRestore}
              disabled={rightId === 'draft' || restoring}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg shadow transition-all flex items-center gap-1.5 cursor-pointer ${
                rightId === 'draft'
                  ? 'bg-gray-800 text-gray-500 border border-gray-700/60 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:shadow-lg'
              }`}
            >
              {restoring ? '正在恢复...' : '恢复此记录'}
            </button>
          </div>
        </header>

        {/* Diff Canvas Area */}
        <div className="flex-1 flex overflow-hidden relative">
          {isIdentical ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e20] z-10 text-sm text-gray-400">
              <div className="text-center p-6 border border-[#2d2d30] rounded-xl bg-[#1b1b1d]/40">
                <div className="text-gray-500 mb-2 font-mono">=== NO DIFFERENCE ===</div>
                内容一致
              </div>
            </div>
          ) : null}

          {/* Left Column - Old Version */}
          <div
            ref={leftScrollRef}
            onScroll={() => handleScroll('left')}
            className="flex-1 border-r border-[#2d2d30] overflow-auto custom-scrollbar bg-[#1a1a1c] flex flex-col font-mono text-[13px] leading-relaxed py-4 select-text"
          >
            {diffResults.map((line, idx) => {
              const type = line.left.type;
              let bgClass = 'hover:bg-[#252528]';
              let lineNumClass = 'text-gray-600';
              if (type === 'deleted') {
                bgClass = 'bg-rose-950/25 text-rose-300 border-l-4 border-rose-600 hover:bg-rose-950/30';
                lineNumClass = 'text-rose-500 font-bold';
              } else if (type === 'empty') {
                bgClass = 'bg-[#18181a]/40 text-transparent select-none';
                lineNumClass = 'text-[#202022]';
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

          {/* Right Column - New Version */}
          <div
            ref={rightScrollRef}
            onScroll={() => handleScroll('right')}
            className="flex-1 overflow-auto custom-scrollbar bg-[#1e1e20] flex flex-col font-mono text-[13px] leading-relaxed py-4 select-text"
          >
            {diffResults.map((line, idx) => {
              const type = line.right.type;
              let bgClass = 'hover:bg-[#28282c]';
              let lineNumClass = 'text-gray-600';
              if (type === 'added') {
                bgClass = 'bg-emerald-950/25 text-emerald-300 border-l-4 border-emerald-600 hover:bg-emerald-950/30';
                lineNumClass = 'text-emerald-500 font-bold';
              } else if (type === 'empty') {
                bgClass = 'bg-[#18181a]/40 text-transparent select-none';
                lineNumClass = 'text-[#202022]';
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
      </main>

    </div>
  );
}
