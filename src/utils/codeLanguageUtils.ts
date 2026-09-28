/**
 * 集中管理代码块编程语言的定义、标准化大小写格式化与双向映射
 */

// 特殊缩写或非标准首字母大写的专有名词映射 (查找性能 O(1))
const SPECIAL_LANG_MAP: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  cpp: 'C++',
  'c++': 'C++',
  cs: 'C#',
  csharp: 'C#',
  'c#': 'C#',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
  php: 'PHP',
  r: 'R',
  plaintext: 'PlainText',
  plain: 'PlainText',
  text: 'PlainText',
  txt: 'PlainText',
};

// 逆向映射：从界面展示名称转回底层的 lowlight / ProseMirror 属性值
const DISPLAY_TO_VALUE_MAP: Record<string, string> = {
  'C++': 'cpp',
  'C#': 'csharp',
  HTML: 'html',
  CSS: 'css',
  SCSS: 'scss',
  Sass: 'sass',
  Less: 'less',
  JSON: 'json',
  XML: 'xml',
  YAML: 'yaml',
  SQL: 'sql',
  PHP: 'php',
  TSX: 'tsx',
  JSX: 'jsx',
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  PlainText: 'plaintext',
};

/**
 * 健壮且高性能的代码语言名称格式化纯函数
 * O(1) 字典命中，未命中则自动首字母大写，空值统一规范为 'PlainText'
 */
export function formatLanguageName(rawLang?: string | null): string {
  if (!rawLang || !rawLang.trim()) return 'PlainText';
  const clean = rawLang.trim();
  const lower = clean.toLowerCase();
  return SPECIAL_LANG_MAP[lower] || clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * 从界面展示名称转回标准 language 属性值 (用于编辑器属性更新)
 */
export function displayToLanguageValue(displayName: string): string {
  if (!displayName) return 'plaintext';
  return DISPLAY_TO_VALUE_MAP[displayName] || displayName.toLowerCase();
}

/**
 * 文档编辑器预置支持的全部语言列表
 */
export const EDITOR_SUPPORTED_LANGUAGES = [
  'plaintext',
  'javascript',
  'typescript',
  'html',
  'css',
  'python',
  'java',
  'go',
  'rust',
  'c',
  'cpp',
  'csharp',
  'sql',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'markdown',
  'yaml',
  'json',
  'xml',
  'tsx',
  'vue',
  'bash',
  'shell',
  'dockerfile',
  'makefile',
  'r',
  'dart',
] as const;

/**
 * 模块级预排序和格式化后的语言列表（单例常量，避免每次渲染重复创建与排序数组）
 */
export const SORTED_CODE_LANGUAGES: readonly string[] = Object.freeze(
  [...EDITOR_SUPPORTED_LANGUAGES].sort().map((lang) => formatLanguageName(lang)),
);
