import { marked } from 'marked';
import { common, createLowlight } from 'lowlight';

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
  return `<div class="my-3 rounded-xl overflow-hidden border border-gray-800 bg-gray-900 shadow-inner">
    <div class="flex justify-between items-center px-4 py-1.5 bg-gray-800/80 text-[11px] font-mono text-gray-400 border-b border-gray-800 select-none">
      <span>${displayLang}</span>
    </div>
    <pre class="p-4 text-xs md:text-[13px] font-mono text-gray-100 overflow-x-auto leading-relaxed"><code>${highlightedHtml}</code></pre>
  </div>`;
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
