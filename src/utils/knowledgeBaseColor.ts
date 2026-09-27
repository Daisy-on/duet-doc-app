export const KNOWLEDGE_BASE_COLORS = [
  '#f97316',
  '#3b82f6',
  '#10b981',
  '#a855f7',
  '#ef4444',
  '#f59e0b',
  '#6366f1',
  '#ec4899',
];

export const DEFAULT_KNOWLEDGE_BASE_COLOR = '#f59e0b';

export function getKnowledgeBaseColor(icon: string): string {
  return icon === 'book-open' || !icon ? DEFAULT_KNOWLEDGE_BASE_COLOR : icon;
}
