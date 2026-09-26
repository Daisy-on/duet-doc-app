const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/ai/cloudClient.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const moduleOutput = { exports: {} };
const state = { body: '', trace: null };
const imports = {
  '../utils/apiUtils': { buildApiUrl: (path) => path },
  './aiLogger': {
    logAITrace: (trace) => {
      state.trace = trace;
    },
  },
  '../auth/authClient': { authFetch: async () => new Response(state.body) },
};
new Function('module', 'exports', 'require', compiled.outputText)(
  moduleOutput,
  moduleOutput.exports,
  (name) => imports[name],
);
const { streamCloudAI } = moduleOutput.exports;

test('marks an unfinished stream as failed', async () => {
  state.body = 'data: {"event":"text_delta","text":"半截回答"}\n\n';
  const errors = [];
  await streamCloudAI({ task: 'chat', messages: [] }, { onError: (error) => errors.push(error) });
  assert.deepEqual(
    errors.map((error) => error.code),
    ['INCOMPLETE_STREAM'],
  );
  assert.equal(state.trace.status, 'failed');
});

test('accepts an explicit finish event', async () => {
  state.body = 'data: {"event":"finish","finishReason":"stop"}\n\n';
  const errors = [];
  let finished = false;
  await streamCloudAI(
    { task: 'chat', messages: [] },
    {
      onError: (error) => errors.push(error),
      onFinish: () => {
        finished = true;
      },
    },
  );
  assert.equal(finished, true);
  assert.deepEqual(errors, []);
  assert.equal(state.trace.status, 'completed');
});
