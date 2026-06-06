import type { Editor } from '@tiptap/core';

export type GhostTextPromptInput = {
  messages: Array<{ role: string; content: string }>;
  contextText: string;
  cursorPos: number;
};

const MIN_CONTEXT_LENGTH = 8;
const MAX_CONTEXT_LENGTH = 48;

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
    messages: [
      {
        role: 'system',
        content: '你是一个富有创造力的文本续写引擎。请根据用户的上文，自然地续写接下来的一句话或几个字。要求：\n1. 绝对不要重复上文已经出现的内容！\n2. 只需要输出紧接着的续写内容，使其可以直接拼接到编辑光标后面。\n3. 不要进行任何解释，不要输出思考过程。'
      },
      {
        role: 'user',
        content: `上文是：'${contextText}'\n请提供续写：`
      }
    ],
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