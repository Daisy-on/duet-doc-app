import { stableHash } from './hash';
import type { DocumentChunkDraft, DocumentSourceType, IndexableDocument } from './types';

const TARGET_CHUNK_CHARS = 280;
const MAX_PASSAGE_CHARS = 320;
const MIN_BREAK_CHARS = 140;
const SEPARATORS = ['\n', '。', '！', '？', '.', '!', '?', '；', ';', '，', ',', ' '];
const MIN_DOCUMENT_TEXT_CHARS = 30;
const MIN_MEMO_TEXT_CHARS = 8;
const MEMO_KB_ID = 'kb-memo-system';
const DEFAULT_PLACEHOLDER_PATTERN = /开始书写你的内容(?:\.{3}|…)?/g;

interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
}

interface TextBlock {
  text: string;
  headingPath: string[];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function passagePrefix(title: string, headingPath: string[]): string {
  const name = Array.from(title.trim()).slice(0, 60).join('');
  const section = Array.from(headingPath.join(' > ')).slice(0, 60).join('');
  return [name, section].filter(Boolean).join('\n');
}

export function createDocumentPassageText(chunk: {
  title: string;
  headingPath: string[];
  content: string;
}): string {
  return [passagePrefix(chunk.title, chunk.headingPath), chunk.content].filter(Boolean).join('\n');
}

function bodyLimit(title: string, headingPath: string[]): number {
  const prefix = passagePrefix(title, headingPath);
  return MAX_PASSAGE_CHARS - Array.from(prefix).length - (prefix ? 1 : 0);
}

function removeDefaultPlaceholder(value: string): string {
  return normalizeText(value.replace(DEFAULT_PLACEHOLDER_PATTERN, ' '));
}

function countMeaningfulCharacters(value: string): number {
  return value.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}

function nodeText(node: TiptapNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'image') return '';
  return (node.content ?? []).map(nodeText).join('');
}

function collectTiptapBlocks(nodes: TiptapNode[], headingPath: string[] = []): TextBlock[] {
  const blocks: TextBlock[] = [];
  let activeHeadingPath = [...headingPath];

  for (const node of nodes) {
    if (node.type === 'heading') {
      const level = Number(node.attrs?.level ?? 1);
      const text = normalizeText(nodeText(node));
      if (text) {
        activeHeadingPath = [...activeHeadingPath.slice(0, Math.max(0, level - 1)), text];
      }
      continue;
    }

    if (['paragraph', 'codeBlock', 'blockquote'].includes(node.type ?? '')) {
      const text = normalizeText(nodeText(node));
      if (text) blocks.push({ text, headingPath: [...activeHeadingPath] });
      continue;
    }

    if (node.type === 'listItem' || node.type === 'tableCell' || node.type === 'tableHeader') {
      const text = normalizeText(nodeText(node));
      if (text) blocks.push({ text, headingPath: [...activeHeadingPath] });
      continue;
    }

    if (node.content?.length) {
      blocks.push(...collectTiptapBlocks(node.content, activeHeadingPath));
    }
  }

  return blocks;
}

function collectHtmlBlocks(content: string): TextBlock[] {
  if (typeof DOMParser === 'undefined') {
    const text = normalizeText(content.replace(/<[^>]*>/g, ' '));
    return text ? [{ text, headingPath: [] }] : [];
  }

  const document = new DOMParser().parseFromString(content, 'text/html');
  const blocks: TextBlock[] = [];
  const headingPath: string[] = [];

  for (const element of document.body.querySelectorAll(
    'h1, h2, h3, h4, h5, h6, p, li, pre, blockquote',
  )) {
    if (element.parentElement?.closest('p, li, pre, blockquote')) continue;
    const text = normalizeText(element.textContent ?? '');
    if (!text) continue;

    if (/^H[1-6]$/.test(element.tagName)) {
      const level = Number(element.tagName.slice(1));
      headingPath.splice(Math.max(0, level - 1));
      headingPath[level - 1] = text;
      continue;
    }

    blocks.push({ text, headingPath: [...headingPath] });
  }

  if (blocks.length > 0) return blocks;
  const text = normalizeText(document.body.textContent ?? '');
  return text ? [{ text, headingPath: [] }] : [];
}

function extractBlocks(content: string): TextBlock[] {
  try {
    const parsed = JSON.parse(content) as TiptapNode;
    if (parsed && typeof parsed === 'object') {
      return collectTiptapBlocks(parsed.content ?? []);
    }
  } catch {
    // Legacy documents can still contain HTML.
  }

  return collectHtmlBlocks(content);
}

function splitLongBlock(block: TextBlock, title: string): TextBlock[] {
  const limit = bodyLimit(title, block.headingPath);
  if (Array.from(block.text).length <= limit) return [block];

  const parts: TextBlock[] = [];
  let remaining = block.text;
  while (remaining) {
    const characters = Array.from(remaining);
    let end = Math.min(characters.length, limit);
    if (end < characters.length) {
      let found = false;
      for (const separator of SEPARATORS) {
        for (let index = end - 1; index >= MIN_BREAK_CHARS; index -= 1) {
          if (characters[index] === separator) {
            end = index + 1;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    const text = characters.slice(0, end).join('').trim();
    if (text) parts.push({ text, headingPath: block.headingPath });
    remaining = characters.slice(end).join('').trimStart();
  }
  return parts;
}

function packBlocks(blocks: TextBlock[], title: string): TextBlock[] {
  const chunks: TextBlock[] = [];
  let current: TextBlock | null = null;

  for (const block of blocks.flatMap((item) => splitLongBlock(item, title))) {
    if (!current) {
      current = { text: block.text, headingPath: block.headingPath };
      continue;
    }

    const sameSection = current.headingPath.join('\u0000') === block.headingPath.join('\u0000');
    const nextLength = Array.from(current.text).length + 1 + Array.from(block.text).length;
    if (
      sameSection &&
      nextLength <= Math.min(TARGET_CHUNK_CHARS, bodyLimit(title, block.headingPath))
    ) {
      current.text = `${current.text}\n${block.text}`;
      continue;
    }

    chunks.push(current);
    current = { text: block.text, headingPath: block.headingPath };
  }

  if (current) chunks.push(current);
  return chunks;
}

export function getDocumentSourceType(document: IndexableDocument): DocumentSourceType {
  return document.kbId === MEMO_KB_ID ? 'memo' : 'document';
}

export function getDocumentFingerprint(document: IndexableDocument): string {
  return stableHash(`${document.title}\u0000${document.content}`);
}

export function chunkDocument(document: IndexableDocument): DocumentChunkDraft[] {
  const sourceType = getDocumentSourceType(document);
  const sourceFingerprint = getDocumentFingerprint(document);
  const blocks = extractBlocks(document.content)
    .map((block) => ({ ...block, text: removeDefaultPlaceholder(block.text) }))
    .filter((block) => block.text.length > 0);
  const minimumTextCharacters =
    sourceType === 'memo' ? MIN_MEMO_TEXT_CHARS : MIN_DOCUMENT_TEXT_CHARS;

  if (
    countMeaningfulCharacters(blocks.map((block) => block.text).join('')) < minimumTextCharacters
  ) {
    return [];
  }

  const chunks = packBlocks(blocks, document.title);

  return chunks.map((chunk, chunkIndex) => {
    const contentHash = stableHash(chunk.text);
    return {
      id: `chunk-${stableHash(`${document.id}\u0000${sourceFingerprint}\u0000${chunkIndex}`)}`,
      sourceId: document.id,
      kbId: document.kbId,
      sourceType,
      title: document.title,
      chunkIndex,
      headingPath: chunk.headingPath,
      content: chunk.text,
      contentHash,
      sourceUpdatedAt: document.updatedAt,
    };
  });
}
