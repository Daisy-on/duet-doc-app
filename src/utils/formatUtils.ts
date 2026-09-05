/**
 * 集中识别文档正文格式（HTML 或 TipTap JSON）
 * 若内容首尾符合 JSON 结构，且根节点为 { type: 'doc' }，则判定为 'tiptap_json'；其余一律判定为 'html'。
 */
export function detectContentFormat(content: string | undefined | null): 'tiptap_json' | 'html' {
  if (!content) return 'html';
  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { type?: unknown };
      if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
        return 'tiptap_json';
      }
    } catch {
      // 忽略 JSON 解析失败，回退为 html
    }
  }
  return 'html';
}
