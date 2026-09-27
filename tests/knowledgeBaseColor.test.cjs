const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/utils/knowledgeBaseColor.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const moduleOutput = { exports: {} };
new Function('module', 'exports', compiled.outputText)(moduleOutput, moduleOutput.exports);
const { KNOWLEDGE_BASE_COLORS, getKnowledgeBaseColor } = moduleOutput.exports;

test('only the legacy default icon falls back to the amber theme', () => {
  assert.equal(getKnowledgeBaseColor('book-open'), '#f59e0b');
  assert.equal(getKnowledgeBaseColor(''), '#f59e0b');
  assert.equal(getKnowledgeBaseColor('#3b82f6'), '#3b82f6');
});

test('amber remains one of the preset knowledge base colors', () => {
  assert.ok(KNOWLEDGE_BASE_COLORS.includes(getKnowledgeBaseColor('book-open')));
});
