import type { Editor } from '@tiptap/core';

export type GhostTextPromptInput = {
  messages: Array<{ role: string; content: string }>;
  contextText: string;
  cursorPos: number;
};

const MIN_CONTEXT_LENGTH = 8;
const MAX_CONTEXT_LENGTH = 192;

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
        content: '你是一个文本续写助手。请直接、无缝地续写用户给出的文字。绝对不能重复用户已经输入的字！不要做任何解释，不要输出除了续写内容之外的任何字符。'
      },
      {
        role: 'user',
        content: contextText
      }
    ],
  };
}

export function cleanGhostText(rawText: string, contextText: string) {
  let text = rawText.trim();

  if (!text) return '';

  // 1. 先进行基础格式清理（去除引号、前缀等引导语）
  text = text
    .replace(/^续写[:：]\s*/, '')
    .replace(/^["“]/, '')
    .replace(/["”]$/, '')
    .trim();

  // 2. 只提取第一行
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0);
  text = firstLine?.trim() ?? '';

  // 3. 智能重叠消除：检查生成文本头部是否重复了上文的尾部
  let overlapLength = 0;
  const maxOverlapCheck = Math.min(text.length, contextText.length);
  for (let i = maxOverlapCheck; i > 0; i--) {
    if (contextText.endsWith(text.slice(0, i))) {
      overlapLength = i;
      break;
    }
  }
  if (overlapLength > 0) {
    text = text.slice(overlapLength).trimStart();
  }

  // 4. 句号截断与字数限制
  const sentenceEndIndex = text.search(/[。！？!?]/);
  if (sentenceEndIndex >= 0) {
    text = text.slice(0, sentenceEndIndex + 1);
  }

  if (text.length > 40) {
    text = text.slice(0, 40);
  }

  return text;
}