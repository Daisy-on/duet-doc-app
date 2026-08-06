import { useEffect, useState, useRef, useCallback } from 'react'
import type { Editor } from '@tiptap/core'
import { ExternalLink, Edit2, Copy, Unlink } from 'lucide-react'
import { normalizeUrl } from '../../utils/urlUtils'

interface LinkHoverPopoverProps {
  editor: Editor | null
  containerRef: React.RefObject<HTMLDivElement | null>
}

export default function LinkHoverPopover({ editor, containerRef }: LinkHoverPopoverProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [href, setHref] = useState('')

  const hoverRef = useRef<{
    anchor: HTMLAnchorElement | null
    timeout: ReturnType<typeof setTimeout> | null
    isOverPopover: boolean
  }>({
    anchor: null,
    timeout: null,
    isOverPopover: false,
  })

  const cancelClose = useCallback(() => {
    if (hoverRef.current.timeout) {
      clearTimeout(hoverRef.current.timeout)
      hoverRef.current.timeout = null
    }
  }, [])

  const scheduleClose = useCallback((delay = 300) => {
    cancelClose()
    hoverRef.current.timeout = setTimeout(() => {
      if (!hoverRef.current.isOverPopover) {
        if (hoverRef.current.anchor) {
          hoverRef.current.anchor.style.backgroundColor = ''
        }
        setOpen(false)
        hoverRef.current.anchor = null
      }
    }, delay)
  }, [cancelClose])

  useEffect(() => {
    const container = containerRef.current
    const hoverState = hoverRef.current
    if (!editor || !container) return

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // If mouse is moving over/into the popover itself
      if (target.closest('.link-hover-popover')) {
        cancelClose()
        hoverState.isOverPopover = true
        return
      }

      const anchor = target.closest('a')
      if (anchor && container.contains(anchor)) {
        cancelClose()
        
        // Reset background on previous anchor if different
        if (hoverState.anchor && hoverState.anchor !== anchor) {
          hoverState.anchor.style.backgroundColor = ''
        }

        const rawHref = anchor.getAttribute('href') || ''
        const normalized = normalizeUrl(rawHref)
        if (normalized && normalized !== rawHref) {
          anchor.setAttribute('href', normalized)
          anchor.setAttribute('target', '_blank')
          anchor.setAttribute('rel', 'noopener noreferrer')
        }

        hoverState.anchor = anchor
        anchor.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'
        anchor.style.borderRadius = '2px'

        const rect = anchor.getBoundingClientRect()
        setHref(normalized || rawHref)
        // 2px distance below anchor
        setPos({ top: rect.bottom + 2, left: rect.left })
        setOpen(true)
      }
    }

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement
      if (related?.closest('.link-hover-popover')) {
        cancelClose()
        hoverState.isOverPopover = true
        return
      }

      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (anchor && anchor === hoverState.anchor) {
        scheduleClose(300)
      }
    }

    container.addEventListener('mouseover', handleMouseOver)
    container.addEventListener('mouseout', handleMouseOut)

    return () => {
      container.removeEventListener('mouseover', handleMouseOver)
      container.removeEventListener('mouseout', handleMouseOut)
      if (hoverState.timeout) {
        clearTimeout(hoverState.timeout)
        hoverState.timeout = null
      }
      if (hoverState.anchor) {
        hoverState.anchor.style.backgroundColor = ''
        hoverState.anchor = null
      }
      hoverState.isOverPopover = false
    }
  }, [editor, containerRef, cancelClose, scheduleClose])

  if (!open) return null

  return (
    <div 
      className="link-hover-popover fixed z-[100] flex items-center gap-1 p-1 bg-[#252525] border border-[#333] rounded-lg shadow-xl animate-dropdown-fade-in
                 before:absolute before:-top-3 before:left-0 before:right-0 before:h-3 before:bg-transparent"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={() => {
        cancelClose()
        hoverRef.current.isOverPopover = true
      }}
      onMouseLeave={() => {
        hoverRef.current.isOverPopover = false
        scheduleClose(250)
      }}
    >
      <button 
        tabIndex={-1}
        className="p-1.5 text-gray-300 hover:text-white hover:bg-[#333] rounded transition-colors cursor-pointer"
        title="打开链接"
        onClick={() => {
          const targetUrl = normalizeUrl(href)
          if (targetUrl) {
            window.open(targetUrl, '_blank', 'noopener,noreferrer')
          }
        }}
      >
        <ExternalLink size={14} />
      </button>
      <button 
        tabIndex={-1}
        className="p-1.5 text-gray-300 hover:text-white hover:bg-[#333] rounded transition-colors cursor-pointer"
        title="编辑链接"
        onClick={() => {
          if (editor && hoverRef.current.anchor) {
            try {
              const pos = editor.view.posAtDOM(hoverRef.current.anchor, 0)
              editor.commands.setTextSelection(pos)
            } catch {
              // DOM node rebuild fallback
            }
          }
          if (hoverRef.current.anchor) hoverRef.current.anchor.style.backgroundColor = ''
          setOpen(false)
          hoverRef.current.anchor = null
          window.dispatchEvent(new CustomEvent('duet-edit-link'))
        }}
      >
        <Edit2 size={14} />
      </button>
      <button 
        tabIndex={-1}
        className="p-1.5 text-gray-300 hover:text-white hover:bg-[#333] rounded transition-colors cursor-pointer"
        title="复制链接"
        onClick={() => {
          navigator.clipboard.writeText(href)
          if (hoverRef.current.anchor) hoverRef.current.anchor.style.backgroundColor = ''
          setOpen(false)
          hoverRef.current.anchor = null
        }}
      >
        <Copy size={14} />
      </button>
      <button 
        tabIndex={-1}
        className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-[#333] rounded transition-colors cursor-pointer"
        title="取消链接"
        onClick={() => {
          if (editor && hoverRef.current.anchor) {
            try {
              const pos = editor.view.posAtDOM(hoverRef.current.anchor, 0)
              editor.commands.setTextSelection(pos)
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
            } catch {
              editor.chain().focus().unsetLink().run()
            }
          }
          if (hoverRef.current.anchor) hoverRef.current.anchor.style.backgroundColor = ''
          setOpen(false)
          hoverRef.current.anchor = null
        }}
      >
        <Unlink size={14} />
      </button>
    </div>
  )
}
