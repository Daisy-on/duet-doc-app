const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/ai/editableMessageTail.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const moduleOutput = { exports: {} };
new Function('module', 'exports', compiled.outputText)(moduleOutput, moduleOutput.exports);
const { editableMessageTail, persistEditedMessage } = moduleOutput.exports;

const messages = [
  { id: 'user-1', role: 'user' },
  { id: 'assistant-1', role: 'assistant' },
  { id: 'user-2', role: 'user' },
  { id: 'assistant-2', role: 'assistant' },
];

test('only the latest user turn can replace its answer', () => {
  assert.deepEqual(
    editableMessageTail(messages, 'user-2').map((message) => message.id),
    ['user-2', 'assistant-2'],
  );
  assert.equal(editableMessageTail(messages, 'user-1'), null);
  assert.equal(editableMessageTail(messages, 'assistant-2'), null);
  assert.equal(editableMessageTail(messages, 'missing'), null);
});

test('a latest user message without an answer is editable', () => {
  assert.deepEqual(editableMessageTail(messages.slice(0, 3), 'user-2'), [messages[2]]);
});

test('does not delete the old turn when saving the replacement fails', async () => {
  const calls = [];
  await assert.rejects(
    persistEditedMessage({ id: 'new' }, messages.slice(2), {
      addMessage: async () => {
        calls.push('add');
        throw new Error('write failed');
      },
      removeMessages: async () => calls.push('remove-old'),
      removeMessage: async () => calls.push('rollback'),
    }),
    /write failed/,
  );
  assert.deepEqual(calls, ['add']);
});

test('rolls back the replacement if deleting the old turn fails', async () => {
  const calls = [];
  await assert.rejects(
    persistEditedMessage({ id: 'new' }, messages.slice(2), {
      addMessage: async () => calls.push('add'),
      removeMessages: async (ids) => {
        calls.push(ids);
        throw new Error('delete failed');
      },
      removeMessage: async (id) => calls.push(`rollback:${id}`),
    }),
    /delete failed/,
  );
  assert.deepEqual(calls, ['add', ['user-2', 'assistant-2'], 'rollback:new']);
});
