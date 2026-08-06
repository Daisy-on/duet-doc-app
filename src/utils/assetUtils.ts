import type { JSONContent } from '@tiptap/core';

/**
 * 从 JSON 或 HTML 文档正文中提取所有引用的 assetId 集合
 */
export function extractAssetIds(content: string): Set<string> {
  const assetIds = new Set<string>();
  if (!content) return assetIds;

  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    try {
      const jsonDoc = JSON.parse(trimmed) as JSONContent;
      const traverse = (node: JSONContent) => {
        if (!node) return;
        const assetId = node.attrs?.assetId;
        if (node.type === 'image' && typeof assetId === 'string') {
          assetIds.add(assetId);
        }
        if (Array.isArray(node.content)) {
          node.content.forEach(traverse);
        }
      };
      traverse(jsonDoc);
      return assetIds;
    } catch {
      // 解析 JSON 失败时退回到正则抽取
    }
  }

  // 正则提取 data-asset-id="xxx" 或 json 内字符串 "assetId":"xxx"
  const attrRegex = /data-asset-id=["']([^"']+)["']/g;
  let match;
  while ((match = attrRegex.exec(trimmed)) !== null) {
    if (match[1]) assetIds.add(match[1]);
  }

  const jsonAttrRegex = /"assetId"\s*:\s*["']([^"']+)["']/g;
  while ((match = jsonAttrRegex.exec(trimmed)) !== null) {
    if (match[1]) assetIds.add(match[1]);
  }

  return assetIds;
}
