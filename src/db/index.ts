import Dexie, { type Table } from 'dexie';
import type { KnowledgeBase, Group, Document } from '../store/knowledgeBaseStore';
import type { FavoriteFolder, FavoriteItem } from '../store/favoritesStore';
import type { ChatSession, ChatMessage } from '../store/aiWritingStore';

export interface DocumentVersion {
  id: string;
  docId: string;
  title: string;
  content: string; // TipTap JSON string
  createdAt: number;
  saveType: 'auto' | 'manual' | 'published';
}

export class DuetDocDB extends Dexie {
  knowledgeBases!: Table<KnowledgeBase, string>;
  groups!: Table<Group, string>;
  documents!: Table<Document, string>;
  favoriteFolders!: Table<FavoriteFolder, string>;
  favoriteItems!: Table<FavoriteItem, string>;
  chatSessions!: Table<ChatSession, string>;
  chatMessages!: Table<ChatMessage, string>;
  documentVersions!: Table<DocumentVersion, string>;

  constructor() {
    super('DuetDocDB');
    this.version(1).stores({
      knowledgeBases: 'id, createdAt',
      groups: 'id, kbId, parentGroupId, createdAt',
      documents: 'id, kbId, groupId, createdAt',
      favoriteFolders: 'id, createdAt',
      favoriteItems: 'id, docId, favoritedAt',
      chatSessions: 'id, createdAt',
      chatMessages: 'id, sessionId, createdAt',
    });
    this.version(2).stores({
      knowledgeBases: 'id, createdAt',
      groups: 'id, kbId, parentGroupId, createdAt',
      documents: 'id, kbId, groupId, createdAt',
      favoriteFolders: 'id, createdAt',
      favoriteItems: 'id, docId, favoritedAt',
      chatSessions: 'id, createdAt',
      chatMessages: 'id, sessionId, createdAt',
      documentVersions: 'id, docId, createdAt',
    });
    this.version(3).stores({
      knowledgeBases: 'id, createdAt',
      groups: 'id, kbId, parentGroupId, createdAt',
      documents: 'id, kbId, groupId, createdAt',
      favoriteFolders: 'id, createdAt',
      favoriteItems: 'id, docId, favoritedAt',
      chatSessions: 'id, createdAt',
      chatMessages: 'id, sessionId, createdAt',
      documentVersions: 'id, docId, createdAt, [docId+createdAt]',
    });
  }
}

export const db = new DuetDocDB();
export default db;
