import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const citationHighlightKey = new PluginKey<{ from: number; to: number } | null>(
  'citationHighlight',
);

export const CitationHighlightExtension = Extension.create({
  name: 'citationHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: citationHighlightKey,
        state: {
          init: () => null,
          apply(tr, range) {
            const next = tr.getMeta(citationHighlightKey);
            return next !== undefined ? next : tr.docChanged ? null : range;
          },
        },
        props: {
          decorations(state) {
            const range = citationHighlightKey.getState(state);
            if (!range || range.from >= range.to || range.to > state.doc.content.size) {
              return DecorationSet.empty;
            }
            return DecorationSet.create(state.doc, [
              Decoration.inline(range.from, range.to, { class: 'citation-flash' }),
            ]);
          },
        },
      }),
    ];
  },
});
