import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type GhostTextPayload = {
  text: string;
  pos: number;
  requestId: string;
};

type GhostTextState = GhostTextPayload | null;

type GhostTextMeta = { type: 'set'; payload: GhostTextPayload } | { type: 'clear' };

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ghostText: {
      setGhostText: (payload: GhostTextPayload) => ReturnType;
      clearGhostText: () => ReturnType;
      acceptGhostText: () => ReturnType;
    };
  }
}

export const ghostTextPluginKey = new PluginKey<GhostTextState>('ghostText');

export const GhostTextExtension = Extension.create({
  name: 'ghostText',

  addCommands() {
    return {
      setGhostText:
        (payload) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(ghostTextPluginKey, {
              type: 'set',
              payload,
            } satisfies GhostTextMeta);
          }
          return true;
        },

      clearGhostText:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(ghostTextPluginKey, {
              type: 'clear',
            } satisfies GhostTextMeta);
          }
          return true;
        },

      acceptGhostText:
        () =>
        ({ tr, dispatch, state }) => {
          const ghostText = ghostTextPluginKey.getState(state);
          if (!ghostText?.text) return false;
          if (dispatch) {
            tr.insertText(ghostText.text, ghostText.pos);
            tr.setMeta(ghostTextPluginKey, {
              type: 'clear',
            } satisfies GhostTextMeta);
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Escape: () => {
        return this.editor.commands.clearGhostText();
      },
      Tab: () => {
        return this.editor.commands.acceptGhostText();
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<GhostTextState>({
        key: ghostTextPluginKey,

        state: {
          init: () => null,
          apply: (tr, value) => {
            const meta = tr.getMeta(ghostTextPluginKey) as GhostTextMeta | undefined;

            if (meta?.type === 'set') {
              return meta.payload;
            }

            if (meta?.type === 'clear') {
              return null;
            }

            if (tr.docChanged || tr.selectionSet) {
              return null;
            }

            return value;
          },
        },

        props: {
          decorations: (state) => {
            const ghostText = ghostTextPluginKey.getState(state);

            if (!ghostText?.text) return DecorationSet.empty;
            if (ghostText.pos < 0 || ghostText.pos > state.doc.content.size) {
              return DecorationSet.empty;
            }

            const widget = Decoration.widget(
              ghostText.pos,
              () => {
                const span = document.createElement('span');
                span.className = 'duet-ghost-text';
                span.textContent = ghostText.text;
                span.dataset.requestId = ghostText.requestId;
                return span;
              },
              { side: 1 },
            );

            return DecorationSet.create(state.doc, [widget]);
          },
        },
      }),
    ];
  },
});
