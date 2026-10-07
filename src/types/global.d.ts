import type { Editor } from '@tiptap/core';
import type { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import type { useEditorStore } from '../store';

declare global {
  interface Window {
    editor?: Editor;
    useKnowledgeBaseStore?: typeof useKnowledgeBaseStore;
    useEditorStore?: typeof useEditorStore;
    __DUET_EDITOR_PERF__?: {
      start: () => void;
      stop: () => void;
      log: () => void;
      reset: () => void;
      getRawSamples: () => unknown[];
    };
    __DUET_AI_PERF__?: {
      log: () => void;
      reset: () => void;
      getRawRecords: () => unknown[];
    };
    __DUET_DOC_LOAD_PERF__?: {
      log: () => void;
      getRecord: () => unknown;
      getHistory: () => unknown[];
      reset: () => void;
    };
    __DUET_PASTE_PERF__?: {
      log: () => void;
      getRecord: () => unknown;
      getHistory: () => unknown[];
      reset: () => void;
    };
  }
}

export {};
