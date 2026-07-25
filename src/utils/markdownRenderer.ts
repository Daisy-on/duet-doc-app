import { marked } from 'marked';
import { common, createLowlight } from 'lowlight';
import { normalizeUrl } from './urlUtils';

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

const renderer = new marked.Renderer();

// Custom code block renderer with lowlight syntax highlighting
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const validLang = lang && lowlight.registered(lang) ? lang : null;
  let highlightedHtml = '';

  if (validLang) {
    try {
      const tree = lowlight.highlight(validLang, text);
      highlightedHtml = hastToHtml(tree as unknown as HastNode);
    } catch {
      highlightedHtml = escapeHtml(text);
    }
  } else {
    highlightedHtml = escapeHtml(text);
  }

  const displayLang = lang || 'code';
  const encodedCode = escapeHtml(text);
  return `<div class="my-3 rounded-xl overflow-hidden border border-gray-800 bg-gray-900 shadow-inner group/code relative">
    <div class="flex justify-between items-center px-4 py-1.5 bg-gray-800/80 text-xs font-sans font-medium text-gray-400 border-b border-gray-800 select-none">
      <span class="tracking-wide">${displayLang}</span>
      <button type="button" class="copy-code-btn flex items-center gap-1.5 text-xs font-sans text-gray-400 hover:text-gray-200 transition-colors cursor-pointer py-0.5 px-1.5 rounded hover:bg-gray-700/60" data-code="${encodedCode}">
        <svg class="copy-icon w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
        </svg>
        <span class="copy-label pointer-events-none">复制代码</span>
      </button>
    </div>
    <pre class="p-4 text-xs md:text-[13px] font-mono text-gray-100 overflow-x-auto leading-relaxed"><code>${highlightedHtml}</code></pre>
  </div>`;
};

// Custom link renderer with URL normalization and target="_blank"
renderer.link = function ({ href, title, text }: { href: string; title?: string | null; text: string }) {
  const normalizedHref = normalizeUrl(href);
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<a href="${normalizedHref}" target="_blank" rel="noopener noreferrer"${titleAttr} class="text-accent underline hover:text-indigo-700 cursor-pointer">${text}</a>`;
};

// Custom inline code span renderer
renderer.codespan = function ({ text }: { text: string }) {
  return `<code class="bg-indigo-50/80 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100/80 font-mono text-xs select-text">${text}</code>`;
};

// Custom horizontal rule renderer
renderer.hr = function () {
  return `<hr class="my-4 border-t border-border-color" />`;
};

export function renderMarkdownToHtml(markdownText: string): string {
  if (!markdownText) return '';
  try {
    const html = marked.parse(markdownText, { renderer, async: false }) as string;
    return html;
  } catch (err) {
    console.error('[renderMarkdownToHtml] Failed:', err);
    return escapeHtml(markdownText);
  }
}
