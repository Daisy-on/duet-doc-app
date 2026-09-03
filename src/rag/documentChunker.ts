import { stableHash } from './hash';
import type { DocumentChunkDraft, DocumentSourceType, IndexableDocument } from './types';

const TARGET_CHUNK_CHARS = 320;
const MAX_CHUNK_CHARS = 480;
const OVERLAP_CHARS = 60;
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

  return blocks;
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

function splitLongBlock(block: TextBlock): TextBlock[] {
  if (block.text.length <= MAX_CHUNK_CHARS) return [block];

  const parts: TextBlock[] = [];
  let offset = 0;
  while (offset < block.text.length) {
    const end = Math.min(block.text.length, offset + MAX_CHUNK_CHARS);
    parts.push({ text: block.text.slice(offset, end), headingPath: block.headingPath });
    if (end >= block.text.length) break;
    offset = end - OVERLAP_CHARS;
  }
  return parts;
}

function packBlocks(blocks: TextBlock[]): TextBlock[] {
  const chunks: TextBlock[] = [];
  let current: TextBlock | null = null;

  for (const block of blocks.flatMap(splitLongBlock)) {
    if (!current) {
      current = { text: block.text, headingPath: block.headingPath };
      continue;
    }

    const sameSection = current.headingPath.join('\u0000') === block.headingPath.join('\u0000');
    const nextLength = current.text.length + 1 + block.text.length;
    if (sameSection && nextLength <= TARGET_CHUNK_CHARS) {
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

  const chunks = packBlocks(blocks);

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
