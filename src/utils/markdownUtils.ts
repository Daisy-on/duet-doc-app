import { marked } from 'marked';

/**
 * Converts Markdown text to formatted HTML string suitable for TipTap editor ingestion.
 */
export function markdownToHtml(markdownText: string): string {
  if (!markdownText) return '';

  const trimmed = markdownText.trim();
  // If it's already HTML (starts with <), return directly
  if (trimmed.startsWith('<')) {
    return markdownText;
  }

  try {
    const html = marked.parse(markdownText, { async: false }) as string;
    return html;
  } catch (err) {
    console.error('[markdownToHtml] Failed to parse markdown:', err);
    return markdownText;
  }
}

const GENERIC_TITLES = new Set([
  '总结',
  '概述',
  '结论',
  '回答',
  '简介',
  '小结',
  '说明',
  '分析',
  '注意事项',
  '提示',
  '核心要点',
  'summary',
  'overview',
  'conclusion',
  'note',
  'introduction',
  'notes',
]);

function isGenericTitle(title: string): boolean {
  const lower = title
    .toLowerCase()
    .trim()
    .replace(/[:：\s]/g, '');
  return GENERIC_TITLES.has(lower) || lower.length <= 2;
}

/**
 * Extracts a clean, non-truncated document title from Markdown content or prompt context.
 */
export function getSmartTitle(content: string, fallbackTitle?: string): string {
  const cleanFallback =
    fallbackTitle && fallbackTitle !== '新对话'
      ? fallbackTitle
          .trim()
          .replace(/(\.\.\.|\u2026)$/, '')
          .trim()
      : undefined;

  if (content) {
    // 1. Check for markdown headings (# Heading or ## Heading)
    const headingMatch = content.match(/^#+\s+(.+)$/m);
    if (headingMatch && headingMatch[1].trim()) {
      const cleanHeading = headingMatch[1].replace(/[*_`]/g, '').trim();
      if (cleanHeading.length > 0 && !isGenericTitle(cleanHeading)) {
        return cleanHeading.slice(0, 50);
      }
    }

    // 2. Check for bold title lines like **Title**
    const boldMatch = content.match(/^\*\*(.+?)\*\*/m);
    if (boldMatch && boldMatch[1].trim()) {
      const cleanBold = boldMatch[1].replace(/[:：]/g, '').trim();
      if (cleanBold.length > 0 && cleanBold.length <= 40 && !isGenericTitle(cleanBold)) {
        return cleanBold;
      }
    }
  }

  // 3. Fallback to provided session title / user prompt if valid
  if (cleanFallback && !isGenericTitle(cleanFallback)) {
    return cleanFallback.slice(0, 50);
  }

  // 4. Ultimate fallback
  return cleanFallback || 'Duet 助手文档';
}
