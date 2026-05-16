import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'

export default function CodeBlockNodeView({ node, updateAttributes, extension }: any) {
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)

  const name = node.attrs.name || ''
  const language = node.attrs.language || 'plaintext'
  const theme = node.attrs.theme || 'Dracula'

  const languages = ['plaintext', 'javascript', 'typescript', 'html', 'css', 'python', 'java', 'go', 'rust', 'xml']
  const themes = ['dark', 'light']

  const isDark = theme === 'dark'

  const handleCopy = () => {
    const text = node.textContent
    const markdown = `\`\`\`${language}\n${text}\n\`\`\``
    navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <NodeViewWrapper className={`code-block group relative my-4 rounded-lg border overflow-hidden font-sans ${
      isDark ? 'border-[#333] bg-[#1E1E1E]' : 'border-gray-200 bg-[#F8F9FA]'
    }`}>
      
      {/* 极简展开按钮 (折叠状态显示) */}
      {collapsed && (
        <button 
          className={`absolute top-2 right-2 p-1 rounded z-10 transition-colors ${
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
        <div className={`flex items-center justify-between px-3 py-2 border-b select-none ${
          isDark ? 'bg-[#2D2D2D] border-[#444] text-[#A0A0A0]' : 'bg-[#EAECEF] border-gray-300 text-gray-600'
        }`}>
          <div className="flex items-center gap-2 flex-1">
            <button 
              className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-gray-900'}`}
              onClick={() => setCollapsed(true)}
              title="折叠工具栏"
            >
              <ChevronRight size={14} />
            </button>
            
            <input
              type="text"
              className={`bg-transparent border-none outline-none text-sm w-48 ${
                isDark ? 'text-[#D4D4D4] placeholder-[#666]' : 'text-gray-800 placeholder-gray-400'
              }`}
              placeholder="请输入代码块名称"
              value={name}
              onChange={(e) => updateAttributes({ name: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-4">
            <select 
              className={`bg-transparent outline-none cursor-pointer appearance-none pr-4 transition-colors ${
                isDark ? 'hover:text-white' : 'hover:text-gray-900'
              }`}
              style={{ backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23${isDark ? 'A0A0A0' : '666666'}%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.4-12.8z%22%2F%3E%3C%2Fsvg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '8px auto' }}
              value={language}
              onChange={(e) => updateAttributes({ language: e.target.value })}
            >
              {languages.map(lang => <option key={lang} value={lang} className={isDark ? "bg-[#2D2D2D]" : "bg-white"}>{lang}</option>)}
            </select>

            <select 
              className={`bg-transparent outline-none cursor-pointer appearance-none pr-4 transition-colors ${
                isDark ? 'hover:text-white' : 'hover:text-gray-900'
              }`}
              style={{ backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23${isDark ? 'A0A0A0' : '666666'}%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.4-12.8z%22%2F%3E%3C%2Fsvg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '8px auto' }}
              value={theme}
              onChange={(e) => updateAttributes({ theme: e.target.value })}
            >
              {themes.map(t => <option key={t} value={t} className={isDark ? "bg-[#2D2D2D]" : "bg-white"}>{t === 'dark' ? '暗色' : '亮色'}</option>)}
            </select>

            <div className={`w-px h-4 mx-1 ${isDark ? 'bg-[#444]' : 'bg-gray-300'}`}></div>

            <button 
              className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-gray-900'}`}
              title="复制代码区块"
              onClick={handleCopy}
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* 代码编辑区始终可见，通过 data-theme 设置主题让 CSS 进行高亮渲染 */}
      <div data-theme={theme}>
        <pre className={`!m-0 !bg-transparent !p-4 !border-none ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
          <NodeViewContent as="code" className={`language-${language}`} />
        </pre>
      </div>
    </NodeViewWrapper>
  )
}
