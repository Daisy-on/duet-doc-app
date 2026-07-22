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

/**
 * Extracts a clean, non-truncated document title from Markdown content or prompt context.
 */
export function getSmartTitle(content: string, fallbackTitle?: string): string {
  if (content) {
    // 1. Check for markdown headings (# Heading or ## Heading)
    const headingMatch = content.match(/^#+\s+(.+)$/m);
    if (headingMatch && headingMatch[1].trim()) {
      const cleanHeading = headingMatch[1].replace(/[*_`]/g, '').trim();
      if (cleanHeading.length > 0) {
        return cleanHeading.slice(0, 50);
      }
    }

    // 2. Check for bold title lines like **Title**
    const boldMatch = content.match(/^\*\*(.+?)\*\*/m);
    if (boldMatch && boldMatch[1].trim()) {
      const cleanBold = boldMatch[1].replace(/[:：]/g, '').trim();
      if (cleanBold.length > 0 && cleanBold.length <= 40) {
        return cleanBold;
      }
    }
  }

  // 3. Fallback to provided session title / user prompt
  if (fallbackTitle && fallbackTitle !== '新对话' && fallbackTitle.trim().length > 0) {
    const cleanTitle = fallbackTitle.trim().replace(/(\.\.\.|\u2026)$/, '').trim();
    if (cleanTitle) {
      return cleanTitle.slice(0, 50);
    }
  }

  // 4. Ultimate fallback
  return 'AI 写作文档';
}
