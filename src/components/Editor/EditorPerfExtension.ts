import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface KeystrokeSample {
  key: string;
  jsDurationMs: number;
  frameDurationMs: number;
  timestamp: number;
}

interface EditorPerfStats {
  samples: KeystrokeSample[];
  isRecording: boolean;
}

const stats: EditorPerfStats = {
  samples: [],
  isRecording: true,
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export function getEditorPerfReport() {
  const count = stats.samples.length;
  if (count === 0) {
    return {
      message: '尚未收集到按键样本。请在编辑器中输入内容后再试。',
      count: 0,
    };
  }

  const jsDurations = stats.samples.map((s) => s.jsDurationMs);
  const frameDurations = stats.samples.map((s) => s.frameDurationMs);

  const avg = (arr: number[]) => (arr.reduce((acc, v) => acc + v, 0) / arr.length).toFixed(2);
  const p50 = (arr: number[]) => percentile(arr, 50).toFixed(2);
  const p95 = (arr: number[]) => percentile(arr, 95).toFixed(2);
  const max = (arr: number[]) => Math.max(...arr).toFixed(2);

  const longFrames = frameDurations.filter((d) => d > 16.67).length;
  const severeTasks = frameDurations.filter((d) => d > 50).length;

  return {
    '采样总按键数 (次)': count,
    '平均 JS 处理耗时 (ms)': avg(jsDurations),
    'P50 JS 耗时 (ms)': p50(jsDurations),
    'P95 JS 峰值耗时 (ms)': p95(jsDurations),
    '最大单键 JS 耗时 (ms)': max(jsDurations),
    '平均首帧上屏延迟 (ms)': avg(frameDurations),
    'P95 上屏延迟 (ms)': p95(frameDurations),
    '最大上屏延迟 (ms)': max(frameDurations),
    '掉帧按键数 (>16.7ms)': `${longFrames} (${((longFrames / count) * 100).toFixed(1)}%)`,
    '严重卡顿数 (>50ms)': `${severeTasks} (${((severeTasks / count) * 100).toFixed(1)}%)`,
  };
}

// 注册全局控制台调试对象
if (typeof window !== 'undefined') {
  window.__DUET_EDITOR_PERF__ = {
    start() {
      stats.samples = [];
      stats.isRecording = true;
      console.log('🟢 [DUET_EDITOR_PERF] 打字性能录制已启动。请在万字长文中正常打字...');
    },
    stop() {
      stats.isRecording = false;
      console.log('🛑 [DUET_EDITOR_PERF] 录制已停止。结果报表如下：');
      this.log();
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
      console.log('🔄 [DUET_EDITOR_PERF] 统计数据已清空。');
    },
    getRawSamples() {
      return [...stats.samples];
    },
  };
}

export interface DocLoadPerfRecord {
  docTitle: string;
  charCount: number;
  nodeCount: number;
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
    `📄 [DUET_DOC_LOAD] 文档「${record.docTitle}」(${record.charCount}字) 载入完成，首帧上屏耗时: ${record.totalMountToPaintMs.toFixed(1)}ms (${record.loadType})`,
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
    总字数: r.charCount,
    'AST 节点范围': r.nodeCount,
    大纲标题数: r.headingCount,
    载入模式: r.loadType,
    'JSON 解析 (ms)': r.jsonParseMs > 0 ? Number(r.jsonParseMs.toFixed(2)) : 0,
    'AST 构建 (ms)': Number(r.astBuildMs.toFixed(2)),
    '大纲提取 (ms)': Number(r.headingExtractMs.toFixed(2)),
    '首帧上屏总耗时 (ms)': Number(r.totalMountToPaintMs.toFixed(2)),
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
  jsDurationMs: number;
  totalPaintMs: number;
  timestamp: number;
}

let lastPasteRecord: PastePerfRecord | null = null;
const pasteHistory: PastePerfRecord[] = [];

export function recordPastePerfEvent(record: PastePerfRecord) {
  lastPasteRecord = record;
  pasteHistory.push(record);
  console.log(
    `📋 [DUET_PASTE_PERF] 粘贴完成！输入内容: ${record.plainTextLen} 字符 (HTML: ${(record.htmlTextLen / 1024).toFixed(1)} KB)，JS处理: ${record.jsDurationMs.toFixed(1)}ms，首帧上屏: ${record.totalPaintMs.toFixed(1)}ms (文档总字数: ${record.targetDocLength})`,
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
    当前文档总字数: r.targetDocLength,
    'JS 处理耗时 (ms)': Number(r.jsDurationMs.toFixed(2)),
    '首帧上屏总耗时 (ms)': Number(r.totalPaintMs.toFixed(2)),
    '长任务卡顿 (>50ms)': r.jsDurationMs > 50 ? '⚠️ 是' : '✅ 否',
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
    let currentInputStart: number | null = null;
    let currentKeyName = '';
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
              // 忽略单独的控制键/修饰键
              if (['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'Escape'].includes(event.key)) {
                return false;
              }
              currentInputStart = performance.now();
              currentKeyName = event.key;
              return false;
            },
            compositionstart() {
              if (!stats.isRecording) return false;
              currentInputStart = performance.now();
              currentKeyName = 'IME-Input';
              return false;
            },
            compositionend() {
              if (!stats.isRecording) return false;
              // 中文输入法提交上屏
              currentInputStart = performance.now();
              currentKeyName = 'IME-Commit';
              return false;
            },
          },
        },
        appendTransaction(_trs, _oldState, _newState) {
          if (currentPasteContext !== null) {
            const ctx = currentPasteContext;
            currentPasteContext = null;
            const jsDuration = performance.now() - ctx.pasteStart;
            const targetDocLength = _newState.doc.textContent.length;
            const insertedChars = Math.abs(targetDocLength - _oldState.doc.textContent.length);

            requestAnimationFrame(() => {
              const totalPaintMs = performance.now() - ctx.pasteStart;
              recordPastePerfEvent({
                plainTextLen: ctx.plainTextLen,
                htmlTextLen: ctx.htmlTextLen,
                hasHtml: ctx.hasHtml,
                insertedChars,
                targetDocLength,
                jsDurationMs: jsDuration,
                totalPaintMs,
                timestamp: Date.now(),
              });
            });
          }

          if (currentInputStart !== null) {
            const jsDuration = performance.now() - currentInputStart;
            const startMark = currentInputStart;
            const key = currentKeyName;

            // 等待下一帧浏览器重绘完成，计算完整的交互到渲染（Input-to-Paint）耗时
            requestAnimationFrame(() => {
              const frameDuration = performance.now() - startMark;
              stats.samples.push({
                key,
                jsDurationMs: Math.round(jsDuration * 100) / 100,
                frameDurationMs: Math.round(frameDuration * 100) / 100,
                timestamp: Date.now(),
              });

              // 保持最近 2000 个采样
              if (stats.samples.length > 2000) {
                stats.samples.shift();
              }
            });

            currentInputStart = null;
          }
          return null;
        },
      }),
    ];
  },
});
