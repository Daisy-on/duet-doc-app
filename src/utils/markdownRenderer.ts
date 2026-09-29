import { Marked, type Tokens } from 'marked';
import { common, createLowlight } from 'lowlight';
import { normalizeUrl } from './urlUtils';
import { formatLanguageName } from './codeLanguageUtils';

const lowlight = createLowlight(common);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

function hastToHtml(node: HastNode): string {
  if (!node) return '';
  if (node.type === 'text') {
    return escapeHtml(node.value || '');
  }
  if (node.type === 'element' || node.tagName) {
    const tag = node.tagName || 'span';
    const classAttr = node.properties?.className?.length
      ? ` class="${node.properties.className.join(' ')}"`
      : '';
    const childrenHtml = (node.children || []).map(hastToHtml).join('');
    return `<${tag}${classAttr}>${childrenHtml}</${tag}>`;
  }
  if (node.type === 'root' && node.children) {
    return node.children.map(hastToHtml).join('');
  }
  return '';
}

interface CitationToken {
  type: 'citation';
  raw: string;
  indices: number[];
}

// 缓存已完成代码块的 highlit HTML，避免重复调用开销巨大的 lowlight 正则引擎
const highlightCache = new Map<string, string>();
const MAX_HIGHLIGHT_CACHE_SIZE = 500;

function getHighlightedCodeHtml(validLang: string, text: string): string {
  const cacheKey = `${validLang}\n${text}`;
  const cached = highlightCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let highlightedHtml: string;
  try {
    const tree = lowlight.highlight(validLang, text);
    highlightedHtml = hastToHtml(tree as unknown as HastNode);
  } catch {
    highlightedHtml = escapeHtml(text);
  }

  if (highlightCache.size >= MAX_HIGHLIGHT_CACHE_SIZE) {
    const firstKey = highlightCache.keys().next().value;
    if (firstKey) highlightCache.delete(firstKey);
  }
  highlightCache.set(cacheKey, highlightedHtml);
  return highlightedHtml;
}

function buildCodeBlockHtml(text: string, lang: string | undefined, innerCodeHtml: string): string {
  const displayLang = formatLanguageName(lang);
  const encodedCode = escapeHtml(text);
  return `<div class="my-4 rounded-xl overflow-hidden border border-border-color/80 bg-bg-panel/40 shadow-2xs group/code relative">
    <div class="flex justify-between items-center px-4 py-1.5 bg-hover-bg/70 text-xs font-sans text-text-secondary border-b border-border-color/80 select-none">
      <span class="text-[12px] font-normal text-text-secondary select-none tracking-normal">${displayLang}</span>
      <button type="button" class="copy-code-btn flex items-center gap-1.5 text-xs font-sans text-text-secondary hover:text-text-primary transition-all cursor-pointer py-0.5 px-2 rounded-md hover:bg-hover-bg active:scale-95" data-code="${encodedCode}">
        <svg class="copy-icon w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
        </svg>
        <span class="copy-label pointer-events-none font-normal">复制代码</span>
      </button>
    </div>
    <pre class="p-4 text-[13px] font-mono text-text-primary overflow-x-auto leading-[1.68] scrollbar-thin"><code>${innerCodeHtml}</code></pre>
  </div>`;
}

const sharedMarkedConfig = {
  extensions: [
    {
      name: 'citation',
      level: 'inline' as const,
      start(src: string) {
        return src.match(/\[S\d+/)?.index;
      },
      tokenizer(src: string): CitationToken | undefined {
        const match = /^\[S(\d+)((?:,\s*S?\d+)*)\]/.exec(src);
        if (match) {
          const raw = match[0];
          const indices = Array.from(raw.matchAll(/\d+/g)).map((x) => parseInt(x[0], 10));
          return { type: 'citation', raw, indices };
        }
        return undefined;
      },
      renderer(token: Tokens.Generic) {
        const indices = (token.indices as number[]) || [];
        return indices
          .map(
            (idx) =>
              `<button type="button" class="citation-ref-badge" data-citation-index="${idx}" aria-label="来源 [${idx}]">${idx}</button>`,
          )
          .join('');
      },
    },
  ],
  renderer: {
    link({ href, title, text }: { href: string; title?: string | null; text: string }) {
      const normalizedHref = normalizeUrl(href);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${normalizedHref}" target="_blank" rel="noopener noreferrer"${titleAttr} class="text-accent underline hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer">${text}</a>`;
    },

    codespan({ text }: { text: string }) {
      return `<code class="bg-hover-bg/80 text-text-primary px-1.5 py-[1.5px] rounded-md border border-border-color/60 font-mono text-[13px] font-medium select-text mx-0.5 align-baseline">${text}</code>`;
    },

    hr() {
      return `<hr class="my-5 border-t border-border-color" />`;
    },
  },
};

// 1. 终态完整高亮解析器（用于已完成消息，支持代码高亮与高亮缓存）
const highlightMarked = new Marked();
highlightMarked.use(sharedMarkedConfig);
highlightMarked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const validLang = lang && lowlight.registered(lang) ? lang : null;
      const highlightedHtml = validLang
        ? getHighlightedCodeHtml(validLang, text)
        : escapeHtml(text);
      return buildCodeBlockHtml(text, lang, highlightedHtml);
    },
  },
});

// 2. 流式降级解析器（用于 streaming 状态，跳过低效正则高亮，极速纯文本渲染）
const streamingMarked = new Marked();
streamingMarked.use(sharedMarkedConfig);
streamingMarked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      return buildCodeBlockHtml(text, lang, escapeHtml(text));
    },
  },
});

// 针对已完成历史消息的静态 HTML 缓存，避免流式打字时对所有历史消息重复跑 Marked
const renderedHtmlCache = new Map<string, string>();
const MAX_RENDERED_CACHE_SIZE = 100;

// 针对流式期间已固化的独立 Block（段落/已闭合代码块/标题/列表等）的增量 HTML 缓存
const blockHtmlCache = new Map<string, string>();
const MAX_BLOCK_CACHE_SIZE = 1000;

function isListLine(line: string): boolean {
  return /^\s*([-*+]|\d+\.)\s+/.test(line);
}

function isHeadingLine(line: string): boolean {
  return /^\s*#{1,6}\s+/.test(line);
}

function isHrLine(line: string): boolean {
  return /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

export interface MarkdownBlockItem {
  text: string;
  isCodeBlock: boolean;
}

export interface SplitBlocksResult {
  frozenBlocks: MarkdownBlockItem[];
  activeTail: string;
}

/**
 * 将流式输出的 Markdown 文本智能切分为「已固化历史块」与「当前正在生成的活跃尾部」
 */
export function splitMarkdownBlocks(src: string): SplitBlocksResult {
  if (!src) return { frozenBlocks: [], activeTail: '' };

  const lines = src.split('\n');
  const frozenBlocks: MarkdownBlockItem[] = [];
  let currentLines: string[] = [];
  let inCodeFence = false;
  let fenceMarker = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 检查代码块标记（以至少 3 个反引号或波浪号开始）
    const match = trimmed.match(/^(`{3,}|~{3,})/);

    if (!inCodeFence) {
      if (match) {
        if (currentLines.length > 0) {
          frozenBlocks.push({ text: currentLines.join('\n'), isCodeBlock: false });
          currentLines = [];
        }
        inCodeFence = true;
        fenceMarker = match[1][0];
        currentLines.push(line);
      } else if (trimmed === '') {
        if (currentLines.length > 0) {
          // 如果当前是列表，检查空行之后是否有后续列表项或缩进（处理多行松散列表）
          const isCurrentlyList = isListLine(currentLines[0]);
          let isContinuedList = false;
          if (isCurrentlyList) {
            for (let j = i + 1; j < lines.length; j++) {
              const peekTrimmed = lines[j].trim();
              if (peekTrimmed !== '') {
                if (isListLine(lines[j]) || /^\s{2,}/.test(lines[j])) {
                  isContinuedList = true;
                }
                break;
              }
            }
          }

          if (isContinuedList) {
            currentLines.push(line);
          } else {
            frozenBlocks.push({ text: currentLines.join('\n'), isCodeBlock: false });
            currentLines = [];
          }
        }
      } else if (
        currentLines.length > 0 &&
        (isHeadingLine(currentLines[0]) || isHrLine(currentLines[0]))
      ) {
        // 单行标题或分割线封顶
        frozenBlocks.push({ text: currentLines.join('\n'), isCodeBlock: false });
        currentLines = [line];
      } else if (currentLines.length > 0 && (isHeadingLine(line) || isHrLine(line))) {
        // 新行是标题或分割线，前一段落封顶
        frozenBlocks.push({ text: currentLines.join('\n'), isCodeBlock: false });
        currentLines = [line];
      } else {
        currentLines.push(line);
      }
    } else {
      currentLines.push(line);
      if (match && match[1][0] === fenceMarker && match[1].length >= 3) {
        inCodeFence = false;
        fenceMarker = '';
        frozenBlocks.push({ text: currentLines.join('\n'), isCodeBlock: true });
        currentLines = [];
      }
    }
  }

  const activeTail = currentLines.join('\n');
  return { frozenBlocks, activeTail };
}

function getCachedBlockHtml(block: MarkdownBlockItem): string {
  const cached = blockHtmlCache.get(block.text);
  if (cached !== undefined) {
    perfStats.blockCacheHits++;
    return cached;
  }

  // 闭合即上色：如果是已闭合代码块，走 highlightMarked 一次性高亮并持久缓存；常规文本块走 streamingMarked
  const parser = block.isCodeBlock ? highlightMarked : streamingMarked;
  let html: string;
  try {
    html = parser.parse(block.text, { async: false }) as string;
  } catch {
    html = escapeHtml(block.text);
  }

  if (blockHtmlCache.size >= MAX_BLOCK_CACHE_SIZE) {
    const firstKey = blockHtmlCache.keys().next().value;
    if (firstKey) blockHtmlCache.delete(firstKey);
  }
  blockHtmlCache.set(block.text, html);
  return html;
}

export interface RenderMarkdownOptions {
  isStreaming?: boolean;
}

export interface MarkdownPerfStats {
  totalCalls: number;
  streamingCalls: number;
  highlightCalls: number;
  cacheHits: number;
  blockCacheHits: number;
  totalDurationMs: number;
  avgDurationMs: number;
  maxDurationMs: number;
  durations: number[];
  longTasksCount: number;
}

const perfStats: MarkdownPerfStats = {
  totalCalls: 0,
  streamingCalls: 0,
  highlightCalls: 0,
  cacheHits: 0,
  blockCacheHits: 0,
  totalDurationMs: 0,
  avgDurationMs: 0,
  maxDurationMs: 0,
  durations: [],
  longTasksCount: 0,
};

export function getMarkdownPerfStats() {
  const sorted = [...perfStats.durations].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  return {
    totalCalls: perfStats.totalCalls,
    streamingCalls: perfStats.streamingCalls,
    highlightCalls: perfStats.highlightCalls,
    cacheHits: perfStats.cacheHits,
    blockCacheHits: perfStats.blockCacheHits,
    totalDurationMs: +perfStats.totalDurationMs.toFixed(2),
    avgDurationMs: perfStats.totalCalls
      ? +(perfStats.totalDurationMs / perfStats.totalCalls).toFixed(2)
      : 0,
    p95DurationMs: +p95.toFixed(2),
    maxDurationMs: +perfStats.maxDurationMs.toFixed(2),
    longTasksCount: perfStats.longTasksCount,
  };
}

export function resetMarkdownPerfStats() {
  perfStats.totalCalls = 0;
  perfStats.streamingCalls = 0;
  perfStats.highlightCalls = 0;
  perfStats.cacheHits = 0;
  perfStats.blockCacheHits = 0;
  perfStats.totalDurationMs = 0;
  perfStats.avgDurationMs = 0;
  perfStats.maxDurationMs = 0;
  perfStats.durations = [];
  perfStats.longTasksCount = 0;
  highlightCache.clear();
  blockHtmlCache.clear();
  renderedHtmlCache.clear();
}

if (typeof window !== 'undefined') {
  (window as unknown as { __DUET_MARKDOWN_PERF__?: unknown }).__DUET_MARKDOWN_PERF__ = {
    getStats: getMarkdownPerfStats,
    reset: resetMarkdownPerfStats,
    log: () => {
      const stats = getMarkdownPerfStats();
      console.table({
        总解析调用次数: stats.totalCalls,
        流式增量调用次数: stats.streamingCalls,
        完整终态解析次数: stats.highlightCalls,
        消息级缓存命中: stats.cacheHits,
        块级增量缓存命中: stats.blockCacheHits,
        '平均解析耗时 (ms)': stats.avgDurationMs,
        'P95 峰值耗时 (ms)': stats.p95DurationMs,
        '最大单次耗时 (ms)': stats.maxDurationMs,
        '掉帧调用次数 (>16.7ms)': stats.longTasksCount,
      });
    },
  };
}

export function renderMarkdownToHtml(
  markdownText: string,
  options?: RenderMarkdownOptions | boolean,
): string {
  if (!markdownText) return '';
  const isStreaming = typeof options === 'boolean' ? options : Boolean(options?.isStreaming);

  // 1. 如果有整条消息的终态 HTML 缓存，直接 0ms 闪电复用
  const cachedWholeHtml = renderedHtmlCache.get(markdownText);
  if (cachedWholeHtml !== undefined) {
    perfStats.totalCalls++;
    perfStats.cacheHits++;
    return cachedWholeHtml;
  }

  const startTime = performance.now();

  try {
    // 2. 统一走块级装配管道：已闭合的块直接命中 blockHtmlCache（闭合即上色）
    const { frozenBlocks, activeTail } = splitMarkdownBlocks(markdownText);
    const parts: string[] = [];

    for (let i = 0; i < frozenBlocks.length; i++) {
      parts.push(getCachedBlockHtml(frozenBlocks[i]));
    }

    if (activeTail.trim()) {
      try {
        // 流式中尾部走轻量纯文本；终态完成时尾部走完整高亮
        const tailParser = isStreaming ? streamingMarked : highlightMarked;
        parts.push(tailParser.parse(activeTail, { async: false }) as string);
      } catch {
        parts.push(escapeHtml(activeTail));
      }
    }

    const html = parts.join('');

    // 3. 如果非流式（终态），将拼接结果直接写入整条消息缓存，后续直接 0ms 复用
    if (!isStreaming) {
      if (renderedHtmlCache.size >= MAX_RENDERED_CACHE_SIZE) {
        const firstKey = renderedHtmlCache.keys().next().value;
        if (firstKey) renderedHtmlCache.delete(firstKey);
      }
      renderedHtmlCache.set(markdownText, html);
      perfStats.highlightCalls++;
    } else {
      perfStats.streamingCalls++;
    }

    const duration = performance.now() - startTime;
    perfStats.totalCalls++;
    perfStats.totalDurationMs += duration;
    perfStats.durations.push(duration);
    if (duration > perfStats.maxDurationMs) {
      perfStats.maxDurationMs = duration;
    }
    if (duration > 16.67) {
      perfStats.longTasksCount++;
    }

    return html;
  } catch (err) {
    console.error('[renderMarkdownToHtml] Failed:', err);
    return escapeHtml(markdownText);
  }
}
