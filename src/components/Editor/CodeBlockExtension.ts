import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { ReactNodeViewRenderer } from '@tiptap/react'
import CodeBlockNodeView from './CodeBlockNodeView'
import { TextSelection } from 'prosemirror-state'


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

function getAllLineStarts(text: string): number[] {
  const starts: number[] = []
  let pos = 0
  while (pos <= text.length) {
    starts.push(pos)
    const nextNewline = text.indexOf('\n', pos)
    if (nextNewline === -1) {
      break
    }
    pos = nextNewline + 1
  }
  return starts
}

function calculateNewOffsets(
  text: string,
  fromOffset: number,
  toOffset: number,
  allLineStarts: number[],
  lineChanges: { start: number; change: number }[]
) {
  const changesMap = new Map<number, number>()
  for (const start of allLineStarts) {
    changesMap.set(start, 0)
  }
  for (const c of lineChanges) {
    changesMap.set(c.start, c.change)
  }

  const cumulativeChanges = new Map<number, number>()
  let currentCumulative = 0
  for (const start of allLineStarts) {
    cumulativeChanges.set(start, currentCumulative)
    currentCumulative += changesMap.get(start) || 0
  }

  const getLineIndex = (offset: number) => {
    let low = 0
    let high = allLineStarts.length - 1
    let ans = 0
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      if (allLineStarts[mid] <= offset) {
        ans = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return ans
  }

  // Calculate new fromOffset
  const fromLineIdx = getLineIndex(fromOffset)
  const fromLineStart = allLineStarts[fromLineIdx]
  const d_from = changesMap.get(fromLineStart) || 0
  const C_from = cumulativeChanges.get(fromLineStart) || 0

  let newFromOffset = fromOffset
  if (d_from > 0) {
    if (fromOffset === fromLineStart) {
      newFromOffset = fromLineStart + C_from
    } else {
      newFromOffset = fromOffset + C_from + d_from
    }
  } else if (d_from < 0) {
    const x = -d_from
    if (fromOffset - fromLineStart < x) {
      newFromOffset = fromLineStart + C_from
    } else {
      newFromOffset = fromOffset + C_from + d_from
    }
  } else {
    newFromOffset = fromOffset + C_from
  }

  // Calculate new toOffset
  const toLineIdx = getLineIndex(toOffset)
  const toLineStart = allLineStarts[toLineIdx]
  const d_to = changesMap.get(toLineStart) || 0
  const C_to = cumulativeChanges.get(toLineStart) || 0

  let newToOffset = toOffset
  if (d_to > 0) {
    if (toOffset === toLineStart) {
      newToOffset = toLineStart + C_to
    } else {
      newToOffset = toOffset + C_to + d_to
    }
  } else if (d_to < 0) {
    const y = -d_to
    if (toOffset - toLineStart < y) {
      newToOffset = toLineStart + C_to
    } else {
      newToOffset = toOffset + C_to + d_to
    }
  } else {
    newToOffset = toOffset + C_to
  }

  const newTextLength = text.length + currentCumulative
  newFromOffset = Math.max(0, Math.min(newFromOffset, newTextLength))
  newToOffset = Math.max(0, Math.min(newToOffset, newTextLength))

  return { newFromOffset, newToOffset }
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

          const allLineStarts = getAllLineStarts(text)
          const lineChanges = lineStarts.map(start => ({
            start,
            change: INDENT_SIZE
          }))

          const { newFromOffset, newToOffset } = calculateNewOffsets(
            text,
            fromOffset,
            toOffset,
            allLineStarts,
            lineChanges
          )

          tr.setSelection(TextSelection.create(tr.doc, nodeStart + newFromOffset, nodeStart + newToOffset))

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

          const allLineStarts = getAllLineStarts(text)
          const lineChanges = lineStarts.map((start, idx) => ({
            start,
            change: -removedCounts[idx]
          }))

          const { newFromOffset, newToOffset } = calculateNewOffsets(
            text,
            fromOffset,
            toOffset,
            allLineStarts,
            lineChanges
          )

          tr.setSelection(TextSelection.create(tr.doc, nodeStart + newFromOffset, nodeStart + newToOffset))

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
