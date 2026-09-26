import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { HeadingItem } from '../../store';

export function getOutlineHeadings(doc: ProseMirrorNode): HeadingItem[] {
  const headings: HeadingItem[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({ level: node.attrs.level as number, text: node.textContent, pos });
    }
  });
  return headings;
}
