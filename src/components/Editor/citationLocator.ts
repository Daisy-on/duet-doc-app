import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { getOutlineHeadings } from './outlineHeadings';

export interface CitationTarget {
  documentId: string;
  excerpt?: string;
  headingPath: string[];
}

export type CitationLocation =
  | { kind: 'exact'; from: number; to: number }
  | { kind: 'section'; pos: number }
  | { kind: 'missing' };

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function locateCitation(doc: ProseMirrorNode, target: CitationTarget): CitationLocation {
  const headings = getOutlineHeadings(doc);
  const paths: string[][] = [];
  for (const heading of headings) {
    const previous = paths.length > 0 ? [...paths[paths.length - 1]] : [];
    paths.push([...previous.slice(0, Math.max(0, heading.level - 1)), normalize(heading.text)]);
  }
  const pathAt = (pos: number) => {
    let index = headings.length - 1;
    while (index >= 0 && headings[index].pos > pos) index -= 1;
    return index >= 0 ? paths[index] : [];
  };
  const matchesPath = (pos: number) =>
    JSON.stringify(pathAt(pos)) === JSON.stringify(target.headingPath);

  const excerpt = normalize(target.excerpt ?? '');
  if (excerpt) {
    const chars: string[] = [];
    const starts: number[] = [];
    const ends: number[] = [];
    const append = (char: string, from: number, to: number) => {
      if (/\s/.test(char)) {
        if (!chars.length || chars[chars.length - 1] === ' ') return;
        char = ' ';
      }
      chars.push(char);
      starts.push(from);
      ends.push(to);
    };

    doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      if (chars.length) append(' ', pos, pos);
      node.forEach((child, offset) => {
        const childPos = pos + 1 + offset;
        if (child.isText) {
          const text = child.text ?? '';
          for (let index = 0; index < text.length; index += 1) {
            append(text[index], childPos + index, childPos + index + 1);
          }
        } else if (child.type.name === 'hardBreak') {
          append(' ', childPos, childPos + child.nodeSize);
        }
      });
      return false;
    });

    const text = chars.join('');
    const matches: Array<{ from: number; to: number }> = [];
    for (
      let offset = text.indexOf(excerpt);
      offset !== -1;
      offset = text.indexOf(excerpt, offset + 1)
    ) {
      matches.push({ from: starts[offset], to: ends[offset + excerpt.length - 1] });
    }
    const inSection = matches.filter((match) => matchesPath(match.from));
    const resolved =
      inSection.length === 1 ? inSection[0] : matches.length === 1 ? matches[0] : null;
    if (resolved) return { kind: 'exact', ...resolved };
  }

  const sections = paths.flatMap((path, index) =>
    path.length > 0 && JSON.stringify(path) === JSON.stringify(target.headingPath) ? [index] : [],
  );
  if (sections.length === 1) return { kind: 'section', pos: headings[sections[0]].pos };
  return { kind: 'missing' };
}
