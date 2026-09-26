import type { AIRequest } from './types';

const FALLBACK_INSTRUCTION =
  '本次知识库检索不可用。你没有获得用户文档的检索证据，不得声称已阅读或引用其文档，也不要编造来源编号。' +
  '如果问题必须依赖用户文档，明确说明无法核实，再仅提供相关的通用方法或背景知识。';

export function generalAnswerFallback(request: AIRequest): AIRequest {
  if (!request.messages?.length) throw new Error('通用回答缺少用户问题');
  const messages = [...request.messages];
  const last = messages.at(-1);
  if (!last || last.role !== 'user') throw new Error('通用回答缺少用户问题');
  messages[messages.length - 1] = {
    ...last,
    content: `${FALLBACK_INSTRUCTION}\n\n用户问题：${last.content}`,
  };
  return {
    ...request,
    messages,
    contexts: undefined,
    capabilities: [],
    toolChoice: 'none',
    toolContinuation: undefined,
  };
}
