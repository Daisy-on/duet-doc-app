const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { Schema } = require('@tiptap/pm/model');

function loadSource(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/Editor', file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const output = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputText)(
    (name) => dependencies[name],
    output,
    output.exports,
  );
  return output.exports;
}

const headings = loadSource('outlineHeadings.ts');
const { locateCitation } = loadSource('citationLocator.ts', { './outlineHeadings': headings });

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    heading: { group: 'block', content: 'text*', attrs: { level: { default: 1 } } },
    paragraph: { group: 'block', content: 'inline*' },
    hardBreak: { group: 'inline', inline: true },
    text: { group: 'inline' },
  },
});

const heading = (text, level = 1) => schema.node('heading', { level }, [schema.text(text)]);
const paragraph = (text) => schema.node('paragraph', null, [schema.text(text)]);

test('locates the whole excerpt across paragraphs in the right section', () => {
  const doc = schema.node('doc', null, [
    heading('文档'),
    heading('第一节', 2),
    paragraph('重复内容'),
    heading('第二节', 2),
    paragraph('重复内容'),
    paragraph('后续说明'),
  ]);
  const result = locateCitation(doc, {
    documentId: 'doc-1',
    excerpt: '重复内容\n后续说明',
    headingPath: ['文档', '第二节'],
  });
  assert.equal(result.kind, 'exact');
  assert.equal(doc.textBetween(result.from, result.to, ' '), '重复内容 后续说明');
});

test('does not highlight a changed or ambiguous excerpt, then falls back to section', () => {
  const doc = schema.node('doc', null, [
    heading('文档'),
    heading('章节', 2),
    paragraph('修改后的正文'),
    paragraph('重复'),
    paragraph('重复'),
  ]);
  const target = { documentId: 'doc-1', headingPath: ['文档', '章节'] };
  const changed = locateCitation(doc, { ...target, excerpt: '原来的正文' });
  assert.equal(changed.kind, 'section');
  assert.equal(doc.nodeAt(changed.pos).textContent, '章节');
  assert.equal(locateCitation(doc, { ...target, excerpt: '重复' }).kind, 'section');
  assert.equal(locateCitation(doc, target).kind, 'section');
  const duplicateSections = schema.node('doc', null, [
    heading('文档'),
    heading('章节', 2),
    paragraph('新内容'),
    heading('章节', 2),
    paragraph('另一处新内容'),
  ]);
  assert.equal(locateCitation(duplicateSections, { ...target, excerpt: '旧内容' }).kind, 'missing');
  assert.equal(
    locateCitation(doc, { documentId: 'doc-1', excerpt: '原来的正文', headingPath: [] }).kind,
    'missing',
  );
});

test('matches normalized whitespace without losing text positions', () => {
  const doc = schema.node('doc', null, [
    heading('文档'),
    schema.node('paragraph', null, [
      schema.text('第一行'),
      schema.node('hardBreak'),
      schema.text('第二行'),
    ]),
  ]);
  const result = locateCitation(doc, {
    documentId: 'doc-1',
    excerpt: '第一行 第二行',
    headingPath: ['文档'],
  });
  assert.equal(result.kind, 'exact');
  assert.equal(doc.textBetween(result.from, result.to, ' ', ' '), '第一行 第二行');
});
