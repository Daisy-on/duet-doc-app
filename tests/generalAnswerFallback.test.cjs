const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/ai/generalAnswerFallback.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const moduleOutput = { exports: {} };
new Function('module', 'exports', compiled.outputText)(moduleOutput, moduleOutput.exports);
const { generalAnswerFallback } = moduleOutput.exports;

test('drops retrieved and manual contexts, disables tools, and preserves the question', () => {
  const request = {
    task: 'chat',
    messages: [{ role: 'user', content: '我的文档如何处理图片？' }],
    contexts: [{ sourceId: 'doc-1', content: '过期证据' }],
    capabilities: ['knowledge_search'],
    toolChoice: 'auto',
  };
  const fallback = generalAnswerFallback(request);
  assert.equal(fallback.contexts, undefined);
  assert.deepEqual(fallback.capabilities, []);
  assert.equal(fallback.toolChoice, 'none');
  assert.match(fallback.messages[0].content, /不得声称已阅读或引用其文档/);
  assert.match(fallback.messages[0].content, /我的文档如何处理图片？/);
  assert.equal(request.messages[0].content, '我的文档如何处理图片？');
});
