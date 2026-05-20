import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { common, createLowlight } from 'lowlight'
import CodeBlockNodeView from './CodeBlockNodeView'
import { TextSelection } from 'prosemirror-state'

const lowlight = createLowlight(common)

const INDENT = '  '
const INDENT_SIZE = INDENT.length

function getLineStartOffsets(text: string, fromOffset: number, toOffset: number) {
  const starts: number[] = []
  const safeFrom = Math.max(0, Math.min(fromOffset, text.length))
  const safeTo = Math.max(0, Math.min(toOffset, text.length))
  let start = text.lastIndexOf('\n', Math.max(0, safeFrom - 1))
  start = start === -1 ? 0 : start + 1
  while (start < safeTo) {
    starts.push(start)
    const nextNewline = text.indexOf('\n', start)
    if (nextNewline === -1) {
      break
    }
    start = nextNewline + 1
  }
  return starts
}

function getLineRange(text: string, lineStarts: number[]) {
  const rangeStart = lineStarts[0]
  const lastStart = lineStarts[lineStarts.length - 1]
  const nextNewline = text.indexOf('\n', lastStart)
  const rangeEnd = nextNewline === -1 ? text.length : nextNewline
  return { rangeStart, rangeEnd }
}

export const CustomCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      name: {
        default: '',
      },
      language: {
        default: 'plaintext',
      },
      theme: {
        default: 'dark',
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: ({ editor }) => {
        if (editor.isActive('codeBlock')) {
          const { state, dispatch } = editor.view
          const { selection } = state

          if (selection.empty) {
            editor.commands.insertContent(INDENT)
            return true
          }

          const { $from, $to, from, to } = selection
          if (!$from.sameParent($to) || $from.parent.type.name !== 'codeBlock') {
            return true
          }

          const nodeStart = $from.start($from.depth)
          const text = $from.parent.textContent
          const fromOffset = from - nodeStart
          const toOffset = to - nodeStart
          const lineStarts = getLineStartOffsets(text, fromOffset, toOffset)

          if (lineStarts.length === 0) {
            return true
          }

          const { rangeStart, rangeEnd } = getLineRange(text, lineStarts)
          const segment = text.slice(rangeStart, rangeEnd)
          const lines = segment.split('\n')
          const newSegment = lines.map((line) => `${INDENT}${line}`).join('\n')

          const tr = state.tr.insertText(
            newSegment,
            nodeStart + rangeStart,
            nodeStart + rangeEnd,
          )
          const totalAdded = INDENT_SIZE * lines.length
          const newFrom = nodeStart + fromOffset + INDENT_SIZE
          const newTo = nodeStart + toOffset + totalAdded
          tr.setSelection(TextSelection.create(tr.doc, newFrom, newTo))

          if (dispatch) {
            dispatch(tr)
          }
          return true
        }
        return false
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('codeBlock')) {
          const { state, dispatch } = editor.view
          const { selection } = state

          if (selection.empty) {
            const { from } = selection
            // 尝试删除光标前的两个空格或一个空格
            const textBefore = state.doc.textBetween(Math.max(0, from - INDENT_SIZE), from)
            if (textBefore.endsWith(INDENT)) {
              if (dispatch) dispatch(state.tr.delete(from - INDENT_SIZE, from))
              return true
            } else if (textBefore.endsWith(' ')) {
              if (dispatch) dispatch(state.tr.delete(from - 1, from))
              return true
            }

            return true
          }

          const { $from, $to, from, to } = selection
          if (!$from.sameParent($to) || $from.parent.type.name !== 'codeBlock') {
            return true
          }

          const nodeStart = $from.start($from.depth)
          const text = $from.parent.textContent
          const fromOffset = from - nodeStart
          const toOffset = to - nodeStart
          const lineStarts = getLineStartOffsets(text, fromOffset, toOffset)

          if (lineStarts.length === 0) {
            return true
          }

          const { rangeStart, rangeEnd } = getLineRange(text, lineStarts)
          const segment = text.slice(rangeStart, rangeEnd)
          const lines = segment.split('\n')
          const removedCounts: number[] = []
          const newSegment = lines.map((line) => {
            if (line.startsWith(INDENT)) {
              removedCounts.push(INDENT_SIZE)
              return line.slice(INDENT_SIZE)
            }
            if (line.startsWith(' ')) {
              removedCounts.push(1)
              return line.slice(1)
            }
            removedCounts.push(0)
            return line
          }).join('\n')

          const tr = state.tr.insertText(
            newSegment,
            nodeStart + rangeStart,
            nodeStart + rangeEnd,
          )
          const totalRemoved = removedCounts.reduce((sum, n) => sum + n, 0)
          const firstRemoved = removedCounts[0] ?? 0
          const newFrom = nodeStart + fromOffset - firstRemoved
          const newTo = nodeStart + toOffset - totalRemoved
          tr.setSelection(TextSelection.create(tr.doc, newFrom, newTo))

          if (dispatch) {
            dispatch(tr)
          }

          return true
        }
        return false
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  },
})
