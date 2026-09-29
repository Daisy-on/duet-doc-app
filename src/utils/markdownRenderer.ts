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
      const validLang = lang && lowlight.registered(lang) ? lang : null;
      const cached = validLang ? highlightCache.get(`${validLang}\n${text}`) : null;
      const innerHtml = cached ?? escapeHtml(text);
      return buildCodeBlockHtml(text, lang, innerHtml);
    },
  },
});

// 针对已完成历史消息的静态 HTML 缓存，避免流式打字时对所有历史消息重复跑 Marked
const renderedHtmlCache = new Map<string, string>();
const MAX_RENDERED_CACHE_SIZE = 100;

export interface RenderMarkdownOptions {
  isStreaming?: boolean;
}

export interface MarkdownPerfStats {
  totalCalls: number;
  streamingCalls: number;
  highlightCalls: number;
  cacheHits: number;
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
  perfStats.totalDurationMs = 0;
  perfStats.avgDurationMs = 0;
  perfStats.maxDurationMs = 0;
  perfStats.durations = [];
  perfStats.longTasksCount = 0;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __DUET_MARKDOWN_PERF__?: unknown }).__DUET_MARKDOWN_PERF__ = {
    getStats: getMarkdownPerfStats,
    reset: resetMarkdownPerfStats,
    log: () => {
      const stats = getMarkdownPerfStats();
      console.table({
        总解析调用次数: stats.totalCalls,
        流式降级调用次数: stats.streamingCalls,
        完整高亮调用次数: stats.highlightCalls,
        静态缓存命中次数: stats.cacheHits,
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

  // 对于已完成的历史消息，优先读取整段 HTML 缓存，实现 0ms 闪电复用
  if (!isStreaming) {
    const cachedHtml = renderedHtmlCache.get(markdownText);
    if (cachedHtml !== undefined) {
      perfStats.totalCalls++;
      perfStats.cacheHits++;
      return cachedHtml;
    }
  }

  const parser = isStreaming ? streamingMarked : highlightMarked;
  const startTime = performance.now();

  try {
    const html = parser.parse(markdownText, { async: false }) as string;
    const duration = performance.now() - startTime;

    perfStats.totalCalls++;
    if (isStreaming) {
      perfStats.streamingCalls++;
    } else {
      perfStats.highlightCalls++;
      if (renderedHtmlCache.size >= MAX_RENDERED_CACHE_SIZE) {
        const firstKey = renderedHtmlCache.keys().next().value;
        if (firstKey) renderedHtmlCache.delete(firstKey);
      }
      renderedHtmlCache.set(markdownText, html);
    }

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
