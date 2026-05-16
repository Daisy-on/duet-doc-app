import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'

export default function CodeBlockNodeView({ node, updateAttributes }: any) {
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)

  const langRef = useRef<HTMLDivElement>(null)
  const themeRef = useRef<HTMLDivElement>(null)

  const name = node.attrs.name || ''
  const language = node.attrs.language || 'plaintext'
  const theme = node.attrs.theme || 'dark'

  const allLanguages = [
    'plaintext', 'javascript', 'typescript', 'html', 'css', 'python', 'java', 'go', 'rust', 
    'c', 'cpp', 'csharp', 'sql', 'ruby', 'php', 'swift', 'kotlin', 'markdown', 'yaml', 'json', 'xml',
    'tsx', 'vue', 'bash', 'shell', 'dockerfile', 'makefile', 'r', 'dart'
  ]

  // Sort and Capitalize
  const sortedLanguages = [...allLanguages].sort().map(lang => {
    if (lang === 'cpp') return 'C++'
    if (lang === 'csharp') return 'C#'
    if (lang === 'html') return 'HTML'
    if (lang === 'css') return 'CSS'
    if (lang === 'json') return 'JSON'
    if (lang === 'xml') return 'XML'
    if (lang === 'yaml') return 'YAML'
    if (lang === 'sql') return 'SQL'
    if (lang === 'php') return 'PHP'
    if (lang === 'tsx') return 'TSX'
    return lang.charAt(0).toUpperCase() + lang.slice(1)
  })

  // Map capitalized back to original for updateAttributes
  const displayToValue = (display: string) => {
    if (display === 'C++') return 'cpp'
    if (display === 'C#') return 'csharp'
    if (display === 'HTML') return 'html'
    if (display === 'CSS') return 'css'
    if (display === 'JSON') return 'json'
    if (display === 'XML') return 'xml'
    if (display === 'YAML') return 'yaml'
    if (display === 'SQL') return 'sql'
    if (display === 'PHP') return 'php'
    if (display === 'TSX') return 'tsx'
    return display.toLowerCase()
  }

  const themes = ['dark', 'light']
  const isDark = theme === 'dark'

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangOpen(false)
      }
      if (themeRef.current && !themeRef.current.contains(event.target as Node)) {
        setThemeOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCopy = () => {
    const text = node.textContent
    const markdown = `\`\`\`${language}\n${text}\n\`\`\``
    navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const currentLangDisplay = sortedLanguages.find(l => displayToValue(l) === language) || 'Plaintext'

  return (
    <NodeViewWrapper className={`code-block group relative my-6 rounded-xl border font-sans transition-all duration-300 shadow-sm hover:shadow-md ${
      isDark ? 'border-[#333] bg-[#1E1E1E]' : 'border-gray-200 bg-[#F8F9FA]'
    }`}>
      
      {/* 极简展开按钮 (折叠状态显示) */}
      {collapsed && (
        <button 
          tabIndex={-1}
          className={`absolute top-2 right-2 p-1.5 rounded-lg z-10 transition-colors ${
            isDark ? 'text-[#A0A0A0] hover:text-white hover:bg-[#333]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'
          }`}
          onClick={() => setCollapsed(false)}
          title="展开工具栏"
        >
          <ChevronDown size={14} />
        </button>
      )}

      {/* 顶部工具栏 (展开状态显示) */}
      {!collapsed && (
        <div className={`flex items-center justify-between px-4 py-2 border-b select-none rounded-t-xl ${
          isDark ? 'bg-[#2D2D2D] border-[#444] text-[#A0A0A0]' : 'bg-[#EAECEF] border-gray-300 text-gray-600'
        }`}>
          <div className="flex items-center gap-3 flex-1">
            <button 
              tabIndex={-1}
              className={`p-1 rounded-md transition-colors ${isDark ? 'hover:text-white hover:bg-[#444]' : 'hover:text-gray-900 hover:bg-gray-300'}`}
              onClick={() => setCollapsed(true)}
              title="折叠工具栏"
            >
              <ChevronRight size={14} />
            </button>
            
            <input
              type="text"
              tabIndex={-1}
              className={`bg-transparent border-none outline-none text-sm w-48 font-medium ${
                isDark ? 'text-[#D4D4D4] placeholder-[#666]' : 'text-gray-800 placeholder-gray-400'
              }`}
              placeholder="请输入代码块名称"
              value={name}
              onChange={(e) => updateAttributes({ name: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Language Dropdown */}
            <div className="relative" ref={langRef}>
              <button 
                tabIndex={-1}
                onClick={() => setLangOpen(!langOpen)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
                  isDark ? 'hover:text-white hover:bg-[#444]' : 'hover:text-gray-900 hover:bg-gray-300'
                }`}
              >
                {currentLangDisplay}
                <ChevronDown size={12} className={`transition-transform duration-200 ${langOpen ? 'rotate-180' : ''}`} />
              </button>
              {langOpen && (
                <div className={`absolute top-full right-0 mt-1 py-1 w-40 max-h-[280px] overflow-y-auto rounded-lg shadow-xl border z-[60] custom-scrollbar ${
                  isDark ? 'bg-[#2D2D2D] border-[#444] text-[#D4D4D4]' : 'bg-white border-gray-200 text-gray-700'
                }`}>
                  {sortedLanguages.map(lang => {
                    const value = displayToValue(lang)
                    const isActive = language === value
                    return (
                      <button
                        key={lang}
                        tabIndex={-1}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${
                          isDark 
                            ? (isActive ? 'bg-[#3E3E3E] text-white' : 'hover:bg-[#3E3E3E] hover:text-white') 
                            : (isActive ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 hover:text-gray-900')
                        }`}
                        onClick={() => {
                          updateAttributes({ language: value })
                          setLangOpen(false)
                        }}
                      >
                        {lang}
                        {isActive && <Check size={12} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Theme Dropdown */}
            <div className="relative" ref={themeRef}>
              <button 
                tabIndex={-1}
                onClick={() => setThemeOpen(!themeOpen)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
                  isDark ? 'hover:text-white hover:bg-[#444]' : 'hover:text-gray-900 hover:bg-gray-300'
                }`}
              >
                {theme === 'dark' ? '暗色' : '亮色'}
                <ChevronDown size={12} className={`transition-transform duration-200 ${themeOpen ? 'rotate-180' : ''}`} />
              </button>
              {themeOpen && (
                <div className={`absolute top-full right-0 mt-1 py-1 w-24 rounded-lg shadow-xl border z-[60] ${
                  isDark ? 'bg-[#2D2D2D] border-[#444] text-[#D4D4D4]' : 'bg-white border-gray-200 text-gray-700'
                }`}>
                  {themes.map(t => {
                    const isActive = theme === t
                    return (
                      <button
                        key={t}
                        tabIndex={-1}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${
                          isDark 
                            ? (isActive ? 'bg-[#3E3E3E] text-white' : 'hover:bg-[#3E3E3E] hover:text-white') 
                            : (isActive ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 hover:text-gray-900')
                        }`}
                        onClick={() => {
                          updateAttributes({ theme: t })
                          setThemeOpen(false)
                        }}
                      >
                        {t === 'dark' ? '暗色' : '亮色'}
                        {isActive && <Check size={12} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className={`w-px h-4 mx-1 ${isDark ? 'bg-[#444]' : 'bg-gray-300'}`}></div>

            <button 
              tabIndex={-1}
              className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:text-white hover:bg-[#444]' : 'hover:text-gray-900 hover:bg-gray-300'}`}
              title="复制代码区块"
              onClick={handleCopy}
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* 代码编辑区始终可见，通过 data-theme 设置主题让 CSS 进行高亮渲染 */}
      <div data-theme={theme} className="rounded-b-xl">
        <pre className={`!m-0 !bg-transparent !p-4 !border-none ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
          <NodeViewContent as={"code" as any} className={`language-${language}`} />
        </pre>
      </div>
    </NodeViewWrapper>
  )
}

