import { useEffect, useState, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { ExternalLink, Edit2, Copy, Unlink } from 'lucide-react'

interface LinkHoverPopoverProps {
  editor: Editor | null
  containerRef: React.RefObject<HTMLDivElement | null>
}

export default function LinkHoverPopover({ editor, containerRef }: LinkHoverPopoverProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [href, setHref] = useState('')
  const hoverRef = useRef<{ anchor: HTMLAnchorElement | null; timeout: ReturnType<typeof setTimeout> | null }>({
    anchor: null,
    timeout: null,
  })

  useEffect(() => {
    if (!editor || !containerRef.current) return

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')

      if (anchor && containerRef.current?.contains(anchor)) {
        if (hoverRef.current.timeout) clearTimeout(hoverRef.current.timeout)
        
        hoverRef.current.anchor = anchor
        anchor.style.backgroundColor = 'rgba(59, 130, 246, 0.1)' // Highlight light blue
        anchor.style.borderRadius = '2px'

        const rect = anchor.getBoundingClientRect()
        setHref(anchor.getAttribute('href') || '')
        setPos({ top: rect.bottom + 4, left: rect.left })
        setOpen(true)
      }
    }

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // If we are moving to the popover itself, don't close
      const related = e.relatedTarget as HTMLElement
      if (related?.closest('.link-hover-popover')) return

      if (hoverRef.current.anchor) {
        const anchor = hoverRef.current.anchor
        hoverRef.current.timeout = setTimeout(() => {
          anchor.style.backgroundColor = ''
          setOpen(false)
          hoverRef.current.anchor = null
        }, 150) // Small delay to allow moving mouse to popover
      }
    }

    const container = containerRef.current
    container.addEventListener('mouseover', handleMouseOver)
    container.addEventListener('mouseout', handleMouseOut)

    return () => {
      container.removeEventListener('mouseover', handleMouseOver)
      container.removeEventListener('mouseout', handleMouseOut)
      if (hoverRef.current.timeout) clearTimeout(hoverRef.current.timeout)
    }
  }, [editor, containerRef])

  if (!open) return null

  return (
    <div 
      className="link-hover-popover fixed z-[100] flex items-center gap-1 p-1 bg-[#252525] border border-[#333] rounded shadow-xl"
      style={{ top: pos.top, left: pos.left }}
      onMouseLeave={() => {
        if (hoverRef.current.anchor) hoverRef.current.anchor.style.backgroundColor = ''
        setOpen(false)
        hoverRef.current.anchor = null
      }}
    >
      <button 
        className="p-1.5 text-gray-300 hover:text-white hover:bg-[#333] rounded transition-colors"
        title="打开链接"
        onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
      >
        <ExternalLink size={14} />
      </button>
      <button 
        className="p-1.5 text-gray-300 hover:text-white hover:bg-[#333] rounded transition-colors"
        title="编辑链接"
        onClick={() => {
          if (editor && hoverRef.current.anchor) {
            try {
              const pos = editor.view.posAtDOM(hoverRef.current.anchor, 0)
              editor.commands.setTextSelection(pos)
            } catch(e) {}
          }
          setOpen(false)
          window.dispatchEvent(new CustomEvent('duet-edit-link'))
        }}
      >
        <Edit2 size={14} />
      </button>
      <button 
        className="p-1.5 text-gray-300 hover:text-white hover:bg-[#333] rounded transition-colors"
        title="复制链接"
        onClick={() => {
          navigator.clipboard.writeText(href)
          setOpen(false)
        }}
      >
        <Copy size={14} />
      </button>
      <button 
        className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-[#333] rounded transition-colors"
        title="取消链接"
        onClick={() => {
          if (editor) {
            editor.chain().focus().unsetLink().run()
          }
          setOpen(false)
        }}
      >
        <Unlink size={14} />
      </button>
    </div>
  )
}
