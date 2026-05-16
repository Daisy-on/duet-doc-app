import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { common, createLowlight } from 'lowlight'
import CodeBlockNodeView from './CodeBlockNodeView'

const lowlight = createLowlight(common)

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
      Tab: () => {
        if (this.editor.isActive('codeBlock')) {
          return this.editor.commands.insertContent('\t')
        }
        return false
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('codeBlock')) {
          const { state, dispatch } = this.editor.view
          const { tr, selection } = state
          const { from } = selection
          
          // 尝试删除光标前的一个制表符或空格（最多4个）
          const textBefore = tr.doc.textBetween(Math.max(0, from - 1), from)
          if (textBefore === '\t') {
            if (dispatch) dispatch(tr.delete(from - 1, from))
            return true
          }
          
          // 即使没删掉东西，也要返回 true 来阻止焦点跳到浏览器
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
