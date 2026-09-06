import type { ChatMessageSyncData, ChatSessionSyncData } from '../db';
import type { ChatMessage, ChatSession } from '../store/aiWritingStore';

export function toChatSessionSyncData(session: ChatSession): ChatSessionSyncData {
  return {
    title: session.title,
    is_pinned: session.isPinned ?? false,
    created_at: new Date(session.createdAt).toISOString(),
    updated_at: new Date(session.updatedAt).toISOString(),
  };
}

export function toChatMessageSyncData(message: ChatMessage): ChatMessageSyncData | null {
  if (message.status === 'streaming') return null;

  const aiMetadata = message.aiMetadata
    ? (JSON.parse(JSON.stringify(message.aiMetadata)) as Record<string, unknown>)
    : null;

  return {
    session_id: message.sessionId,
    role: message.role,
    content: message.content,
    status: message.status ?? 'complete',
    web_search_urls: message.webSearchUrls?.map(({ title, url }) => ({ title, url })) ?? [],
    referenced_docs: message.referencedDocs?.map(({ id, title }) => ({ id, title })) ?? [],
    knowledge_sources:
      message.knowledgeSources?.map((source) => ({
        source_id: source.sourceId,
        source_type: source.sourceType,
        title: source.title,
        chunk_index: source.chunkIndex,
        heading_path: [...source.headingPath],
      })) ?? [],
    ai_metadata: aiMetadata,
    created_at: new Date(message.createdAt).toISOString(),
  };
}
