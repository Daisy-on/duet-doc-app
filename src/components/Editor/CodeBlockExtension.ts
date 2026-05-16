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

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  },
})
