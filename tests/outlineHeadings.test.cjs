const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { Schema } = require('@tiptap/pm/model');

const source = fs.readFileSync(
  path.join(__dirname, '../src/components/Editor/outlineHeadings.ts'),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const moduleOutput = { exports: {} };
new Function('module', 'exports', compiled.outputText)(moduleOutput, moduleOutput.exports);
const { getOutlineHeadings } = moduleOutput.exports;

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    heading: {
      group: 'block',
      content: 'text*',
      attrs: { level: { default: 1 } },
    },
    paragraph: { group: 'block', content: 'text*' },
    text: { group: 'inline' },
  },
});

function heading(text, level = 1) {
  return schema.node('heading', { level }, [schema.text(text)]);
}

test('keeps repeated headings distinct and follows positions after edits', () => {
  const original = schema.node('doc', null, [heading('概述'), heading('概述', 2)]);
  const before = getOutlineHeadings(original);
  assert.deepEqual(
    before.map(({ text, level }) => [text, level]),
    [
      ['概述', 1],
      ['概述', 2],
    ],
  );
  assert.notEqual(before[0].pos, before[1].pos);

  const changed = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('新增内容')]),
    heading('概述'),
    heading('概述', 2),
  ]);
  const after = getOutlineHeadings(changed);
  assert.equal(after.length, 2);
  assert.ok(after[0].pos > before[0].pos);
  assert.equal(changed.nodeAt(after[1].pos).textContent, '概述');
});
