import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import CodeBlockNodeView from './CodeBlockNodeView';
import { TextSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { DOMSerializer, type Node as ProseMirrorNode, type ResolvedPos } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const INDENT = '  ';
const INDENT_SIZE = INDENT.length;

function getLineStartOffsets(text: string, fromOffset: number, toOffset: number) {
  const starts: number[] = [];
  const safeFrom = Math.max(0, Math.min(fromOffset, text.length));
  const safeTo = Math.max(0, Math.min(toOffset, text.length));
  let start = text.lastIndexOf('\n', Math.max(0, safeFrom - 1));
  start = start === -1 ? 0 : start + 1;
  while (start < safeTo) {
    starts.push(start);
    const nextNewline = text.indexOf('\n', start);
    if (nextNewline === -1) {
      break;
    }
    start = nextNewline + 1;
  }
  return starts;
}

function getLineRange(text: string, lineStarts: number[]) {
  const rangeStart = lineStarts[0];
  const lastStart = lineStarts[lineStarts.length - 1];
  const nextNewline = text.indexOf('\n', lastStart);
  const rangeEnd = nextNewline === -1 ? text.length : nextNewline;
  return { rangeStart, rangeEnd };
}

function getAllLineStarts(text: string): number[] {
  const starts: number[] = [];
  let pos = 0;
  while (pos <= text.length) {
    starts.push(pos);
    const nextNewline = text.indexOf('\n', pos);
    if (nextNewline === -1) {
      break;
    }
    pos = nextNewline + 1;
  }
  return starts;
}

function calculateNewOffsets(
  text: string,
  fromOffset: number,
  toOffset: number,
  allLineStarts: number[],
  lineChanges: { start: number; change: number }[],
) {
  const changesMap = new Map<number, number>();
  for (const start of allLineStarts) {
    changesMap.set(start, 0);
  }
  for (const c of lineChanges) {
    changesMap.set(c.start, c.change);
  }

  const cumulativeChanges = new Map<number, number>();
  let currentCumulative = 0;
  for (const start of allLineStarts) {
    cumulativeChanges.set(start, currentCumulative);
    currentCumulative += changesMap.get(start) || 0;
  }

  const getLineIndex = (offset: number) => {
    let low = 0;
    let high = allLineStarts.length - 1;
    let ans = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (allLineStarts[mid] <= offset) {
        ans = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return ans;
  };

  // Calculate new fromOffset
  const fromLineIdx = getLineIndex(fromOffset);
  const fromLineStart = allLineStarts[fromLineIdx];
  const d_from = changesMap.get(fromLineStart) || 0;
  const C_from = cumulativeChanges.get(fromLineStart) || 0;

  let newFromOffset: number;
  if (d_from > 0) {
    if (fromOffset === fromLineStart) {
      newFromOffset = fromLineStart + C_from;
    } else {
      newFromOffset = fromOffset + C_from + d_from;
    }
  } else if (d_from < 0) {
    const x = -d_from;
    if (fromOffset - fromLineStart < x) {
      newFromOffset = fromLineStart + C_from;
    } else {
      newFromOffset = fromOffset + C_from + d_from;
    }
  } else {
    newFromOffset = fromOffset + C_from;
  }

  // Calculate new toOffset
  const toLineIdx = getLineIndex(toOffset);
  const toLineStart = allLineStarts[toLineIdx];
  const d_to = changesMap.get(toLineStart) || 0;
  const C_to = cumulativeChanges.get(toLineStart) || 0;

  let newToOffset: number;
  if (d_to > 0) {
    if (toOffset === toLineStart) {
      newToOffset = toLineStart + C_to;
    } else {
      newToOffset = toOffset + C_to + d_to;
    }
  } else if (d_to < 0) {
    const y = -d_to;
    if (toOffset - toLineStart < y) {
      newToOffset = toLineStart + C_to;
    } else {
      newToOffset = toOffset + C_to + d_to;
    }
  } else {
    newToOffset = toOffset + C_to;
  }

  const newTextLength = text.length + currentCumulative;
  newFromOffset = Math.max(0, Math.min(newFromOffset, newTextLength));
  newToOffset = Math.max(0, Math.min(newToOffset, newTextLength));

  return { newFromOffset, newToOffset };
}

export const CustomCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    const parentAttrs = (this.parent?.() || {}) as Record<string, Record<string, unknown>>;
    return {
      ...parentAttrs,
      language: {
        ...parentAttrs.language,
        default: 'plaintext',
      },
      name: {
        default: '',
      },
      theme: {
        default: 'dark',
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: ({ editor }) => {
        if (editor.isActive('codeBlock')) {
          const { state, dispatch } = editor.view;
          const { selection } = state;

          if (selection.empty) {
            editor.commands.insertContent(INDENT);
            return true;
          }

          const { $from, $to, from, to } = selection;
          if (!$from.sameParent($to) || $from.parent.type.name !== 'codeBlock') {
            return true;
          }

          const nodeStart = $from.start($from.depth);
          const text = $from.parent.textContent;
          const fromOffset = from - nodeStart;
          const toOffset = to - nodeStart;
          const lineStarts = getLineStartOffsets(text, fromOffset, toOffset);

          if (lineStarts.length === 0) {
            return true;
          }

          const { rangeStart, rangeEnd } = getLineRange(text, lineStarts);
          const segment = text.slice(rangeStart, rangeEnd);
          const lines = segment.split('\n');
          const newSegment = lines.map((line) => `${INDENT}${line}`).join('\n');

          const tr = state.tr.insertText(newSegment, nodeStart + rangeStart, nodeStart + rangeEnd);

          const allLineStarts = getAllLineStarts(text);
          const lineChanges = lineStarts.map((start) => ({
            start,
            change: INDENT_SIZE,
          }));

          const { newFromOffset, newToOffset } = calculateNewOffsets(
            text,
            fromOffset,
            toOffset,
            allLineStarts,
            lineChanges,
          );

          tr.setSelection(
            TextSelection.create(tr.doc, nodeStart + newFromOffset, nodeStart + newToOffset),
          );

          if (dispatch) {
            dispatch(tr);
          }
          return true;
        }
        return false;
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('codeBlock')) {
          const { state, dispatch } = editor.view;
          const { selection } = state;

          if (selection.empty) {
            const { from } = selection;
            // 尝试删除光标前的两个空格或一个空格
            const textBefore = state.doc.textBetween(Math.max(0, from - INDENT_SIZE), from);
            if (textBefore.endsWith(INDENT)) {
              if (dispatch) dispatch(state.tr.delete(from - INDENT_SIZE, from));
              return true;
            } else if (textBefore.endsWith(' ')) {
              if (dispatch) dispatch(state.tr.delete(from - 1, from));
              return true;
            }

            return true;
          }

          const { $from, $to, from, to } = selection;
          if (!$from.sameParent($to) || $from.parent.type.name !== 'codeBlock') {
            return true;
          }

          const nodeStart = $from.start($from.depth);
          const text = $from.parent.textContent;
          const fromOffset = from - nodeStart;
          const toOffset = to - nodeStart;
          const lineStarts = getLineStartOffsets(text, fromOffset, toOffset);

          if (lineStarts.length === 0) {
            return true;
          }

          const { rangeStart, rangeEnd } = getLineRange(text, lineStarts);
          const segment = text.slice(rangeStart, rangeEnd);
          const lines = segment.split('\n');
          const removedCounts: number[] = [];
          const newSegment = lines
            .map((line) => {
              if (line.startsWith(INDENT)) {
                removedCounts.push(INDENT_SIZE);
                return line.slice(INDENT_SIZE);
              }
              if (line.startsWith(' ')) {
                removedCounts.push(1);
                return line.slice(1);
              }
              removedCounts.push(0);
              return line;
            })
            .join('\n');

          const tr = state.tr.insertText(newSegment, nodeStart + rangeStart, nodeStart + rangeEnd);

          const allLineStarts = getAllLineStarts(text);
          const lineChanges = lineStarts.map((start, idx) => ({
            start,
            change: -removedCounts[idx],
          }));

          const { newFromOffset, newToOffset } = calculateNewOffsets(
            text,
            fromOffset,
            toOffset,
            allLineStarts,
            lineChanges,
          );

          tr.setSelection(
            TextSelection.create(tr.doc, nodeStart + newFromOffset, nodeStart + newToOffset),
          );

          if (dispatch) {
            dispatch(tr);
          }

          return true;
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() || []),
      new Plugin({
        key: new PluginKey('codeBlockSelectionRestriction'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.selectionSet)) {
            return null;
          }

          const { selection } = newState;
          if (!(selection instanceof TextSelection)) {
            return null;
          }

          const getCodeBlockInfo = ($pos: ResolvedPos) => {
            for (let d = $pos.depth; d > 0; d--) {
              if ($pos.node(d).type.name === 'codeBlock') {
                return {
                  node: $pos.node(d),
                  start: $pos.before(d),
                  end: $pos.after(d),
                };
              }
            }
            return null;
          };

          const anchorInfo = getCodeBlockInfo(selection.$anchor);
          const headInfo = getCodeBlockInfo(selection.$head);

          if (anchorInfo) {
            // Rule 1: Anchor is inside code block. Clamp head to the same code block.
            let newHead = selection.head;
            const minPos = anchorInfo.start + 1;
            const maxPos = anchorInfo.end - 1;

            if (selection.head < minPos) {
              newHead = minPos;
            } else if (selection.head > maxPos) {
              newHead = maxPos;
            }

            if (newHead !== selection.head) {
              const tr = newState.tr;
              tr.setSelection(TextSelection.create(newState.doc, selection.anchor, newHead));
              return tr;
            }
          } else if (headInfo) {
            // Rule 2: Anchor is outside, head is inside code block. Snap head to the boundary.
            let newHead = selection.head;
            if (selection.anchor < headInfo.start) {
              newHead = headInfo.end - 1;
            } else if (selection.anchor > headInfo.end) {
              newHead = headInfo.start + 1;
            }

            if (newHead !== selection.head) {
              const tr = newState.tr;
              tr.setSelection(TextSelection.create(newState.doc, selection.anchor, newHead));
              return tr;
            }
          }

          return null;
        },
        props: {
          decorations(state) {
            const { selection } = state;
            if (selection.empty) {
              return null;
            }

            const decos: Decoration[] = [];

            state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
              if (node.type.name === 'codeBlock') {
                const anchorPos = selection.$anchor.pos;
                const isAnchorOutside = anchorPos < pos || anchorPos > pos + node.nodeSize;
                if (
                  isAnchorOutside &&
                  selection.from <= pos + 1 &&
                  selection.to >= pos + node.nodeSize - 1
                ) {
                  decos.push(
                    Decoration.node(pos, pos + node.nodeSize, { class: 'is-fully-selected' }),
                  );
                }
              }
            });

            return decos.length ? DecorationSet.create(state.doc, decos) : null;
          },
          handleDOMEvents: {
            copy(view, event) {
              const { state } = view;
              const { selection } = state;
              if (selection.empty) {
                return false;
              }

              const slice = selection.content();

              let hasCodeBlock = false;
              slice.content.forEach((node) => {
                if (node.type.name === 'codeBlock') {
                  hasCodeBlock = true;
                }
                node.descendants((child) => {
                  if (child.type.name === 'codeBlock') {
                    hasCodeBlock = true;
                  }
                });
              });

              if (!hasCodeBlock) {
                return false;
              }

              let plainText = '';
              slice.content.forEach((node) => {
                if (node.type.name === 'codeBlock') {
                  const lang = node.attrs.language || '';
                  plainText += `\`\`\`${lang}\n${node.textContent}\n\`\`\`\n`;
                } else {
                  const serializeNode = (n: ProseMirrorNode): string => {
                    if (n.type.name === 'codeBlock') {
                      const lang = n.attrs.language || '';
                      return `\`\`\`${lang}\n${n.textContent}\n\`\`\`\n`;
                    }
                    if (n.isText) {
                      return n.text || '';
                    }
                    let text = '';
                    n.content.forEach((child: ProseMirrorNode) => {
                      text += serializeNode(child);
                    });
                    if (n.isBlock) {
                      text += '\n';
                    }
                    return text;
                  };
                  plainText += serializeNode(node);
                }
              });

              plainText = plainText.trim();

              const serializer =
                view.someProp('clipboardSerializer') || DOMSerializer.fromSchema(state.schema);
              const dom = serializer.serializeFragment(slice.content);
              const div = document.createElement('div');
              div.appendChild(dom);
              const htmlText = div.innerHTML;

              if (event.clipboardData) {
                event.clipboardData.clearData();
                event.clipboardData.setData('text/plain', plainText);
                event.clipboardData.setData('text/html', htmlText);
                event.preventDefault();
                return true;
              }

              return false;
            },
            mousedown(_view, event) {
              const target = event.target as HTMLElement;
              const codeBlockEl = target.closest('.code-block');
              if (codeBlockEl) {
                document.body.classList.add('is-selecting-codeblock');

                let anchorNode: Node | null = null;
                let anchorOffset = 0;

                const handleWindowMouseMove = (moveEvent: MouseEvent) => {
                  const sel = window.getSelection();
                  if (!sel) return;

                  if (!anchorNode && sel.anchorNode) {
                    if (codeBlockEl.contains(sel.anchorNode)) {
                      anchorNode = sel.anchorNode;
                      anchorOffset = sel.anchorOffset;
                    }
                  }

                  if (!anchorNode) return;

                  const rect = codeBlockEl.getBoundingClientRect();
                  const isOutside =
                    moveEvent.clientY < rect.top ||
                    moveEvent.clientY > rect.bottom ||
                    moveEvent.clientX < rect.left ||
                    moveEvent.clientX > rect.right;

                  if (isOutside) {
                    moveEvent.preventDefault();
                    moveEvent.stopPropagation();

                    const codeEl = codeBlockEl.querySelector('code');
                    if (codeEl) {
                      if (
                        moveEvent.clientY < rect.top ||
                        (moveEvent.clientY <= rect.bottom && moveEvent.clientX < rect.left)
                      ) {
                        sel.setBaseAndExtent(anchorNode, anchorOffset, codeEl, 0);
                      } else {
                        sel.setBaseAndExtent(
                          anchorNode,
                          anchorOffset,
                          codeEl,
                          codeEl.childNodes.length,
                        );
                      }
                    }
                  }
                };

                const handleWindowMouseUp = () => {
                  document.body.classList.remove('is-selecting-codeblock');
                  window.removeEventListener('mousemove', handleWindowMouseMove, { capture: true });
                  window.removeEventListener('mouseup', handleWindowMouseUp, { capture: true });
                };

                window.addEventListener('mousemove', handleWindowMouseMove, { capture: true });
                window.addEventListener('mouseup', handleWindowMouseUp, { capture: true });
              }
              return false;
            },
            mouseup() {
              document.body.classList.remove('is-selecting-codeblock');
              return false;
            },
          },
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
});
