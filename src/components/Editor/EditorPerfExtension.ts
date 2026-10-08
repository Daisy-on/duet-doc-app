import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface KeystrokeSample {
  key: string;
  inputType: 'char' | 'delete' | 'enter' | 'ime-commit';
  jsDurationMs: number;
  nextPaintMs: number;
  timestamp: number;
}

export interface LongTaskRecord {
  durationMs: number;
  startTime: number;
  name: string;
}

interface EditorPerfStats {
  samples: KeystrokeSample[];
  outliersCount: number;
  isRecording: boolean;
  recordingStartTime: number;
  recordingEndTime: number | null;
}

interface PendingInputContext {
  startTime: number;
  key: string;
  inputType: 'char' | 'delete' | 'enter' | 'ime-commit';
}

interface GlobalPerfStore {
  stats: EditorPerfStats;
  lastInputContext: PendingInputContext | null;
  sessionLongTasks: LongTaskRecord[];
}

// 采用 window 全局单例存储，彻底抵御 Vite HMR 模块热替换导致的状态脱节
const globalStore: GlobalPerfStore =
  typeof window !== 'undefined'
    ? (((window as unknown as Record<string, unknown>)
        .__DUET_PERF_GLOBAL_STORE__ as GlobalPerfStore) ||= {
        stats: {
          samples: [],
          outliersCount: 0,
          isRecording: false,
          recordingStartTime: 0,
          recordingEndTime: null,
        },
        lastInputContext: null,
        sessionLongTasks: [],
      })
    : {
        stats: {
          samples: [],
          outliersCount: 0,
          isRecording: false,
          recordingStartTime: 0,
          recordingEndTime: null,
        },
        lastInputContext: null,
        sessionLongTasks: [],
      };

const stats = globalStore.stats;
const sessionLongTasks = globalStore.sessionLongTasks;

// W3C 标准 Long Task 观察者
let longTaskObserver: PerformanceObserver | null = null;
let isLongTaskSupported = false;

if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
  try {
    const supportedTypes = PerformanceObserver.supportedEntryTypes || [];
    if (supportedTypes.includes('longtask')) {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          sessionLongTasks.push({
            durationMs: entry.duration,
            startTime: entry.startTime,
            name: entry.name,
          });
          if (sessionLongTasks.length > 500) {
            sessionLongTasks.shift();
          }
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
      isLongTaskSupported = true;
    }
  } catch {
    isLongTaskSupported = false;
  }
}

function flushBufferedLongTasks() {
  if (longTaskObserver && 'takeRecords' in longTaskObserver) {
    try {
      const records = longTaskObserver.takeRecords();
      for (const entry of records) {
        sessionLongTasks.push({
          durationMs: entry.duration,
          startTime: entry.startTime,
          name: entry.name,
        });
      }
    } catch {
      // 容错处理
    }
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

// 采用双 rAF 测量真实的下一帧绘制完成（Next Paint）
function onNextPaint(callback: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

export function getEditorPerfReport() {
  flushBufferedLongTasks();

  const count = stats.samples.length;
  if (count === 0 && stats.outliersCount === 0) {
    return {
      message: '尚未收集到按键样本。请在编辑器中输入内容后再试。',
      count: 0,
    };
  }

  const jsDurations = stats.samples.map((s) => s.jsDurationMs);
  const paintDurations = stats.samples.map((s) => s.nextPaintMs);

  const avg = (arr: number[]) =>
    arr.length > 0 ? (arr.reduce((acc, v) => acc + v, 0) / arr.length).toFixed(2) : '0';
  const p50 = (arr: number[]) => (arr.length > 0 ? percentile(arr, 50).toFixed(2) : '0');
  const p95 = (arr: number[]) => (arr.length > 0 ? percentile(arr, 95).toFixed(2) : '0');
  const max = (arr: number[]) => (arr.length > 0 ? Math.max(...arr).toFixed(2) : '0');

  // 严格统计 [recordingStartTime, recordingEndTime] 闭门区间内的真实长任务
  const sessionEnd = stats.recordingEndTime ?? performance.now();
  const activeLongTasks = sessionLongTasks.filter(
    (t) => t.startTime >= stats.recordingStartTime && t.startTime <= sessionEnd,
  );
  const maxLongTask =
    activeLongTasks.length > 0
      ? Math.max(...activeLongTasks.map((t) => t.durationMs)).toFixed(1)
      : '0';
  const totalBlockingTime = activeLongTasks
    .reduce((acc, t) => acc + Math.max(0, t.durationMs - 50), 0)
    .toFixed(1);

  return {
    '采样有效按键数 (次)': count,
    '离群超长样本 (>1500ms)': stats.outliersCount,
    'ProseMirror JS 事务 P50 (ms)': p50(jsDurations),
    'ProseMirror JS 事务 P95 (ms)': p95(jsDurations),
    'ProseMirror JS 事务均值 (ms)': avg(jsDurations),
    '单次最大 JS 事务 (ms)': max(jsDurations),
    '双帧渲染排队(Next Paint) P50 (ms)': p50(paintDurations),
    '双帧渲染排队(Next Paint) P95 (ms)': p95(paintDurations),
    '双帧渲染排队均值 (ms)': avg(paintDurations),
    '单次最大排队耗时 (ms)': max(paintDurations),
    'W3C Long Task 探针状态': isLongTaskSupported
      ? '✅ 启用 (原生 PerformanceObserver)'
      : '⚠️ 不受支持',
    '闭门区间内真实 Long Task 数 (>50ms)': activeLongTasks.length,
    '区间最长宏任务阻塞耗时 (ms)': maxLongTask,
    '区间总阻塞时长 (TBT, ms)': totalBlockingTime,
  };
}

// 注册全局控制台调试对象
if (typeof window !== 'undefined') {
  window.__DUET_EDITOR_PERF__ = {
    start() {
      flushBufferedLongTasks();
      stats.samples = [];
      stats.outliersCount = 0;
      stats.isRecording = true;
      stats.recordingStartTime = performance.now();
      stats.recordingEndTime = null;
      globalStore.lastInputContext = null;
      sessionLongTasks.length = 0;
      console.log(
        '🟢 [DUET_EDITOR_PERF] 打字性能录制已启动（W3C PerformanceObserver 已对齐时钟）。请切回编辑器正文连贯打字（控制台会实时显示采样进度）...',
      );
      return '🟢 [DUET_EDITOR_PERF] 录制已启动！请在正文中输入内容...';
    },
    stop() {
      stats.isRecording = false;
      stats.recordingEndTime = performance.now();
      globalStore.lastInputContext = null;
      flushBufferedLongTasks();
      console.log(
        `🛑 [DUET_EDITOR_PERF] 录制已停止（已记录闭门时间戳）。共捕获 ${stats.samples.length} 个样本。结果报表如下：`,
      );
      this.log();
      return `🛑 [DUET_EDITOR_PERF] 录制已停止，共采样 ${stats.samples.length} 个有效输入样本。`;
    },
    log() {
      const report = getEditorPerfReport();
      if ('message' in report) {
        console.warn(report.message);
      } else {
        console.table(report);
      }
    },
    reset() {
      stats.samples = [];
      stats.outliersCount = 0;
      stats.recordingStartTime = performance.now();
      stats.recordingEndTime = null;
      globalStore.lastInputContext = null;
      sessionLongTasks.length = 0;
      console.log('🔄 [DUET_EDITOR_PERF] 统计数据已清空。');
      return '🔄 统计数据已清空。';
    },
    getRawSamples() {
      return [...stats.samples];
    },
  };
}

export interface DocLoadPerfRecord {
  docTitle: string;
  charCount: number;
  nodeSizeSpan: number;
  blockCount: number;
  headingCount: number;
  loadType: '初次初始化挂载' | '文档路由切换';
  jsonParseMs: number;
  astBuildMs: number;
  headingExtractMs: number;
  totalMountToPaintMs: number;
  timestamp: number;
}

let lastDocLoadRecord: DocLoadPerfRecord | null = null;
const docLoadHistory: DocLoadPerfRecord[] = [];

export function recordDocLoadEvent(record: DocLoadPerfRecord) {
  lastDocLoadRecord = record;
  docLoadHistory.push(record);
  console.log(
    `📄 [DUET_DOC_LOAD] 文档「${record.docTitle}」(${record.charCount}字，nodeSize: ${record.nodeSizeSpan}) 载入完成，双帧排队耗时: ${record.totalMountToPaintMs.toFixed(1)}ms (${record.loadType})`,
  );
}

export function getDocLoadReport() {
  if (docLoadHistory.length === 0) {
    return {
      message: '尚未记录到长文档载入事件。请在左侧目录点击切换或刷新打开一篇文档后再试。',
    };
  }
  return docLoadHistory.map((r, idx) => ({
    序号: idx + 1,
    文档标题: r.docTitle,
    纯文本字数: r.charCount,
    '坐标跨度 (nodeSize)': r.nodeSizeSpan,
    '顶层块节点 (childCount)': r.blockCount,
    大纲标题数: r.headingCount,
    载入模式: r.loadType,
    'JSON 解析 (ms)': r.jsonParseMs > 0 ? Number(r.jsonParseMs.toFixed(2)) : 0,
    'AST 构建/状态初始化 (ms)': Number(r.astBuildMs.toFixed(2)),
    '大纲提取 (ms)': Number(r.headingExtractMs.toFixed(2)),
    '首帧就绪总耗时 (Next Paint, ms)': Number(r.totalMountToPaintMs.toFixed(2)),
  }));
}

if (typeof window !== 'undefined') {
  window.__DUET_DOC_LOAD_PERF__ = {
    log() {
      const report = getDocLoadReport();
      if ('message' in report) {
        console.warn(report.message);
      } else {
        console.table(report);
      }
    },
    getRecord() {
      return lastDocLoadRecord;
    },
    getHistory() {
      return [...docLoadHistory];
    },
    reset() {
      docLoadHistory.length = 0;
      lastDocLoadRecord = null;
      console.log('🔄 [DUET_DOC_LOAD] 载入性能历史已清空。');
    },
  };
}

export interface PastePerfRecord {
  plainTextLen: number;
  htmlTextLen: number;
  hasHtml: boolean;
  insertedChars: number;
  targetDocLength: number;
  targetNodeSize: number;
  jsDurationMs: number;
  nextPaintMs: number;
  longTasksCount: number;
  maxLongTaskMs: number;
  timestamp: number;
}

let lastPasteRecord: PastePerfRecord | null = null;
const pasteHistory: PastePerfRecord[] = [];

export function recordPastePerfEvent(record: PastePerfRecord) {
  lastPasteRecord = record;
  pasteHistory.push(record);
  const longTaskDesc =
    record.longTasksCount > 0
      ? `⚠️ 捕获到长任务 ${record.longTasksCount} 次 (峰值 ${record.maxLongTaskMs.toFixed(1)}ms)`
      : '✅ 0 次长任务';
  console.log(
    `📋 [DUET_PASTE_PERF] 粘贴完成！输入内容: ${record.plainTextLen} 字符 (HTML: ${(record.htmlTextLen / 1024).toFixed(1)} KB)，JS处理: ${record.jsDurationMs.toFixed(1)}ms，双帧渲染排队: ${record.nextPaintMs.toFixed(1)}ms (文档总字数: ${record.targetDocLength}，nodeSize: ${record.targetNodeSize}) [${longTaskDesc}]`,
  );
}

export function getPastePerfReport() {
  if (pasteHistory.length === 0) {
    return {
      message: '尚未记录到粘贴操作。请在编辑器中粘贴一段文本或长文后再试。',
    };
  }
  return pasteHistory.map((r, idx) => ({
    序号: idx + 1,
    粘贴纯文本字符数: r.plainTextLen,
    '携带 HTML 体积': r.hasHtml ? `${(r.htmlTextLen / 1024).toFixed(1)} KB` : '纯文本',
    净插入字符数: r.insertedChars,
    文档当前字数: r.targetDocLength,
    '坐标跨度 (nodeSize)': r.targetNodeSize,
    'JS 处理耗时 (ms)': Number(r.jsDurationMs.toFixed(2)),
    '双帧渲染排队 (Next Paint, ms)': Number(r.nextPaintMs.toFixed(2)),
    'W3C 真实长任务 (>50ms)':
      r.longTasksCount > 0
        ? `⚠️ ${r.longTasksCount} 次 (${r.maxLongTaskMs.toFixed(1)}ms)`
        : '✅ 0 次',
  }));
}

if (typeof window !== 'undefined') {
  window.__DUET_PASTE_PERF__ = {
    log() {
      const report = getPastePerfReport();
      if ('message' in report) {
        console.warn(report.message);
      } else {
        console.table(report);
      }
    },
    getRecord() {
      return lastPasteRecord;
    },
    getHistory() {
      return [...pasteHistory];
    },
    reset() {
      pasteHistory.length = 0;
      lastPasteRecord = null;
      console.log('🔄 [DUET_PASTE_PERF] 粘贴性能历史已清空。');
    },
  };
}

export const editorPerfPluginKey = new PluginKey('editorPerf');

export const EditorPerfExtension = Extension.create({
  name: 'editorPerf',

  addProseMirrorPlugins() {
    let currentPasteContext: {
      pasteStart: number;
      plainTextLen: number;
      htmlTextLen: number;
      hasHtml: boolean;
    } | null = null;

    return [
      new Plugin({
        key: editorPerfPluginKey,
        props: {
          handleDOMEvents: {
            paste(_view, event) {
              const pasteStart = performance.now();
              const plainText = event.clipboardData?.getData('text/plain') || '';
              const htmlText = event.clipboardData?.getData('text/html') || '';
              currentPasteContext = {
                pasteStart,
                plainTextLen: plainText.length,
                htmlTextLen: htmlText.length,
                hasHtml: htmlText.length > 0,
              };
              return false;
            },
            keydown(_view, event) {
              if (!stats.isRecording) return false;
              // 忽略纯修饰键与纯光标移动键，避免污染文本输入耗时
              const ignoreKeys = [
                'Control',
                'Alt',
                'Shift',
                'Meta',
                'CapsLock',
                'Escape',
                'ArrowUp',
                'ArrowDown',
                'ArrowLeft',
                'ArrowRight',
                'Home',
                'End',
                'PageUp',
                'PageDown',
              ];
              if (ignoreKeys.includes(event.key)) {
                return false;
              }

              const inputType: PendingInputContext['inputType'] =
                event.key === 'Backspace' || event.key === 'Delete'
                  ? 'delete'
                  : event.key === 'Enter'
                    ? 'enter'
                    : 'char';

              globalStore.lastInputContext = {
                startTime: performance.now(),
                key: event.key,
                inputType,
              };
              return false;
            },
            beforeinput(_view, event) {
              if (!stats.isRecording) return false;
              const inputEvent = event as InputEvent;
              const isDelete = inputEvent.inputType?.includes('delete');
              const isEnter = inputEvent.inputType === 'insertParagraph';
              const inputType: PendingInputContext['inputType'] = isDelete
                ? 'delete'
                : isEnter
                  ? 'enter'
                  : inputEvent.inputType?.includes('Composition')
                    ? 'ime-commit'
                    : 'char';

              globalStore.lastInputContext = {
                startTime: performance.now(),
                key: inputEvent.data || (isDelete ? 'Backspace' : isEnter ? 'Enter' : 'char'),
                inputType,
              };
              return false;
            },
            compositionend(_view, event) {
              if (!stats.isRecording) return false;
              // 中文输入法提交上屏瞬间，精准更新为最新时间戳与上屏汉字
              const commitData = event.data || 'IME-Commit';
              globalStore.lastInputContext = {
                startTime: performance.now(),
                key: commitData,
                inputType: 'ime-commit',
              };
              return false;
            },
          },
        },
        appendTransaction(transactions, oldState, newState) {
          // 关键防线：只有产生了真正的文档内容变动才进行性能结算
          const hasDocChanged = transactions.some((tr) => tr.docChanged);
          if (!hasDocChanged) {
            return null;
          }

          // 处理粘贴事务
          if (currentPasteContext !== null) {
            const ctx = currentPasteContext;
            currentPasteContext = null;
            const pasteStart = ctx.pasteStart;
            const jsDuration = performance.now() - pasteStart;
            const targetDocLength = newState.doc.textContent.length;
            const targetNodeSize = newState.doc.nodeSize;
            const insertedChars = Math.abs(targetDocLength - oldState.doc.textContent.length);

            onNextPaint(() => {
              // 延迟 60ms 确保浏览器底层宏任务已经将 LongTask entry 交付到 PerformanceObserver 回调
              setTimeout(() => {
                flushBufferedLongTasks();
                const nextPaintMs = performance.now() - pasteStart;

                // 匹配在 [pasteStart - 10, pasteStart + jsDuration + 60] 窗口期内发生的 W3C 真实长任务
                const matchingLongTasks = sessionLongTasks.filter(
                  (t) =>
                    t.startTime >= pasteStart - 10 && t.startTime <= pasteStart + jsDuration + 60,
                );
                const maxLongTaskMs =
                  matchingLongTasks.length > 0
                    ? Math.max(...matchingLongTasks.map((t) => t.durationMs))
                    : 0;

                recordPastePerfEvent({
                  plainTextLen: ctx.plainTextLen,
                  htmlTextLen: ctx.htmlTextLen,
                  hasHtml: ctx.hasHtml,
                  insertedChars,
                  targetDocLength,
                  targetNodeSize,
                  jsDurationMs: jsDuration,
                  nextPaintMs,
                  longTasksCount: matchingLongTasks.length,
                  maxLongTaskMs,
                  timestamp: Date.now(),
                });
              }, 60);
            });
          }

          // 处理常规打字、中文上屏、退格等所有引起文档变动的用户输入
          if (stats.isRecording) {
            const input = globalStore.lastInputContext ?? {
              startTime: performance.now(),
              key: 'input',
              inputType: 'char' as const,
            };
            globalStore.lastInputContext = null;
            const jsDuration = performance.now() - input.startTime;
            const inputStart = input.startTime;

            // 如果确实发生长停顿（>1500ms），不静默丢失，而是单独作为离群样本记录
            if (jsDuration > 1500) {
              stats.outliersCount += 1;
            } else {
              // 关键改进：样本立即同步入队，杜绝异步 rAF 延迟导致的丢样
              const sample: KeystrokeSample = {
                key: input.key,
                inputType: input.inputType,
                jsDurationMs: Math.round(jsDuration * 100) / 100,
                nextPaintMs: Math.round(jsDuration * 100) / 100, // 初始预估为 JS 耗时，下一帧绘制后自动修正为真实绘制耗时
                timestamp: Date.now(),
              };
              stats.samples.push(sample);

              if (stats.samples.length > 2000) {
                stats.samples.shift();
              }

              // 实时控制台反馈：让用户在打字过程中立即看到捕获进度
              const count = stats.samples.length;
              if (count === 1 || count === 5 || count % 10 === 0) {
                console.log(
                  `⚡ [DUET_EDITOR_PERF] 已录制 ${count} 个有效输入样本（最新输入: "${sample.key}", JS: ${sample.jsDurationMs}ms）`,
                );
              }

              onNextPaint(() => {
                sample.nextPaintMs = Math.round((performance.now() - inputStart) * 100) / 100;
              });
            }
          }

          return null;
        },
      }),
    ];
  },
});
