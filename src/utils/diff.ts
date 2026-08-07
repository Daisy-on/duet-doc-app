import type { JSONContent } from '@tiptap/core';

export interface DiffLine {
  text: string;
  type: 'added' | 'deleted' | 'normal' | 'empty';
  lineNumber?: number;
}

export interface DiffResult {
  left: DiffLine;
  right: DiffLine;
}

function getInlineText(node: JSONContent): string {
  if (!node.content) return '';
  return node.content
    .map((c) => {
      if (c.type === 'text') return c.text || '';
      return getInlineText(c);
    })
    .join('');
}

function traverseNode(node: JSONContent, listPrefix = ''): string[] {
  if (!node) return [];

  switch (node.type) {
    case 'doc':
      return (node.content || []).flatMap((c) => traverseNode(c));
    case 'heading': {
      const level = node.attrs?.level || 1;
      const hash = '#'.repeat(level);
      const text = getInlineText(node);
      return [`${hash} ${text}`];
    }
    case 'paragraph': {
      const text = getInlineText(node);
      return [text];
    }
    case 'blockquote': {
      const children = (node.content || []).flatMap((c) => traverseNode(c));
      return children.map((line: string) => `> ${line}`);
    }
    case 'bulletList':
      return (node.content || []).flatMap((c) => traverseNode(c, '- '));
    case 'orderedList':
      return (node.content || []).flatMap((c, index: number) => traverseNode(c, `${index + 1}. `));
    case 'listItem': {
      const children = (node.content || []).flatMap((c) => traverseNode(c));
      if (children.length > 0) {
        const result = [...children];
        result[0] = listPrefix + result[0];
        for (let i = 1; i < result.length; i++) {
          result[i] = '  ' + result[i];
        }
        return result;
      }
      return [];
    }
    case 'codeBlock': {
      const codeText = getInlineText(node);
      return codeText.split('\n');
    }
    case 'table': {
      return (node.content || []).flatMap((c) => traverseNode(c));
    }
    case 'tableRow': {
      const cellsText = (node.content || []).map((c) => getInlineText(c));
      return ['| ' + cellsText.join(' | ') + ' |'];
    }
    case 'image': {
      const altOrId = node.attrs?.alt || node.attrs?.title || node.attrs?.assetId || '无名图片';
      return [`[图片: ${altOrId}]`];
    }
    default:
      if (node.content && Array.isArray(node.content)) {
        return node.content.flatMap((c) => traverseNode(c));
      }
      return [];
  }
}

export function jsonToLines(content: string): string[] {
  if (!content) return [];
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as JSONContent;
      return traverseNode(parsed);
    } catch {
      // Fallback below
    }
  }

  // Fallback to strip HTML tags
  const cleanText = trimmed
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, text) => `# ${text}`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?[^>]+(>|$)/g, ''); // strip tags

  return cleanText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function diffLines(oldLines: string[], newLines: string[]): DiffResult[] {
  const n = oldLines.length;
  const m = newLines.length;

  const dp: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffResult[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({
        left: { text: oldLines[i - 1], type: 'normal', lineNumber: i },
        right: { text: newLines[j - 1], type: 'normal', lineNumber: j },
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({
        left: { text: '', type: 'empty' },
        right: { text: newLines[j - 1], type: 'added', lineNumber: j },
      });
      j--;
    } else {
      result.push({
        left: { text: oldLines[i - 1], type: 'deleted', lineNumber: i },
        right: { text: '', type: 'empty' },
      });
      i--;
    }
  }

  return result.reverse();
}
