import type { Editor } from '@tiptap/core';

export type GhostTextPromptInput = {
  prompt: string;
  contextText: string;
  cursorPos: number;
};

const MIN_CONTEXT_LENGTH = 8;
const MAX_CONTEXT_LENGTH = 180;

function takeTailText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return text.slice(text.length - maxLength);
}

export function buildGhostTextPrompt(editor: Editor): GhostTextPromptInput | null {
  const { state } = editor;
  const { selection } = state;

  if (!selection.empty) return null;
  if (editor.isActive('codeBlock')) return null;
  if (editor.isActive('table') || editor.isActive('tableCell') || editor.isActive('tableHeader')) {
    return null;
  }

  const cursorPos = selection.from;
  const $from = selection.$from;

  if ($from.parent.type.name !== 'paragraph') return null;

  const paragraphStart = $from.start();
  const rawContext = state.doc.textBetween(paragraphStart, cursorPos, '\n', '\n').trimEnd();

  if (rawContext.length < MIN_CONTEXT_LENGTH) return null;

  const contextText = takeTailText(rawContext, MAX_CONTEXT_LENGTH);

  return {
    cursorPos,
    contextText,
    prompt: [
      '请根据下面的文本，续写一句自然、简短的中文内容。',
      '要求：只输出续写内容，不要重复原文，不要解释。',
      '',
      '文本：',
      contextText,
      '',
      '续写：',
    ].join('\n'),
  };
}

export function cleanGhostText(rawText: string, contextText: string) {
  let text = rawText.trim();

  if (!text) return '';

  if (text.startsWith(contextText)) {
    text = text.slice(contextText.length).trimStart();
  }

  text = text
    .replace(/^续写[:：]\s*/, '')
    .replace(/^["“]/, '')
    .replace(/["”]$/, '')
    .trim();

  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0);
  text = firstLine?.trim() ?? '';

  const sentenceEndIndex = text.search(/[。！？!?]/);
  if (sentenceEndIndex >= 0) {
    text = text.slice(0, sentenceEndIndex + 1);
  }

  if (text.length > 40) {
    text = text.slice(0, 40);
  }

  return text;
}