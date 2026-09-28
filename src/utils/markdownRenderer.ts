import { Marked, type Tokens } from 'marked';
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

interface CitationToken {
  type: 'citation';
  raw: string;
  indices: number[];
}

import { formatLanguageName } from './codeLanguageUtils';

const customMarked = new Marked();

customMarked.use({
  extensions: [
    {
      name: 'citation',
      level: 'inline',
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
    code({ text, lang }: { text: string; lang?: string }) {
      const validLang = lang && lowlight.registered(lang) ? lang : null;
      let highlightedHtml: string;

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
    <pre class="p-4 text-[13px] font-mono text-text-primary overflow-x-auto leading-[1.68] scrollbar-thin"><code>${highlightedHtml}</code></pre>
  </div>`;
    },

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
});

export function renderMarkdownToHtml(markdownText: string): string {
  if (!markdownText) return '';
  try {
    const html = customMarked.parse(markdownText, { async: false }) as string;
    return html;
  } catch (err) {
    console.error('[renderMarkdownToHtml] Failed:', err);
    return escapeHtml(markdownText);
  }
}
