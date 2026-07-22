/**
 * Utility to safely extract clean plain text from Tiptap JSON content string or object.
 * Prevents passing raw JSON node structures to LLM prompt context.
 */
export function extractPlainTextFromTiptap(rawContent: string | object | null | undefined): string {
  if (!rawContent) return '';

  let jsonObj: any = rawContent;
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

  function traverse(node: any) {
    if (!node) return;

    if (node.type === 'text' && typeof node.text === 'string') {
      textPieces.push(node.text);
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child);
      }
      if (['paragraph', 'heading', 'codeBlock', 'bulletList', 'orderedList', 'listItem', 'tableRow'].includes(node.type)) {
        textPieces.push('\n');
      }
    }
  }

  traverse(jsonObj);

  return textPieces.join('').replace(/\n+/g, '\n').trim();
}
