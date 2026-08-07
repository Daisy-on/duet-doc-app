interface TiptapNode {
  type?: string;
  text?: string;
  content?: TiptapNode[];
  [key: string]: unknown;
}

/**
 * Utility to safely extract clean plain text from Tiptap JSON content string or object.
 * Prevents passing raw JSON node structures to LLM prompt context.
 */
export function extractPlainTextFromTiptap(rawContent: string | object | null | undefined): string {
  if (!rawContent) return '';

  let jsonObj: unknown = rawContent;
  if (typeof rawContent === 'string') {
    try {
      jsonObj = JSON.parse(rawContent);
    } catch {
      // If it's not valid JSON, treat it as already plain text
      return rawContent;
    }
  }

  if (typeof jsonObj !== 'object' || !jsonObj) {
    return String(jsonObj);
  }

  const textPieces: string[] = [];

  function traverse(node: TiptapNode) {
    if (!node) return;

    if (node.type === 'text' && typeof node.text === 'string') {
      textPieces.push(node.text);
    }

    if (node.type === 'image') {
      const attrs = node.attrs as { alt?: string; title?: string } | undefined;
      const altText = attrs?.alt || attrs?.title || '图片';
      textPieces.push(`[Image: ${altText}]`);
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child);
      }
      if (
        node.type &&
        [
          'paragraph',
          'heading',
          'codeBlock',
          'bulletList',
          'orderedList',
          'listItem',
          'tableRow',
        ].includes(node.type)
      ) {
        textPieces.push('\n');
      }
    }
  }

  traverse(jsonObj as TiptapNode);

  return textPieces.join('').replace(/\n+/g, '\n').trim();
}
