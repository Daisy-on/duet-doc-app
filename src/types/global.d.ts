import type { Editor } from '@tiptap/core';
import type { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import type { useEditorStore } from '../store';

declare global {
  interface Window {
    editor?: Editor;
    useKnowledgeBaseStore?: typeof useKnowledgeBaseStore;
    useEditorStore?: typeof useEditorStore;
  }
}

export {};
