const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/rag/adjacentEvidence.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const moduleOutput = { exports: {} };
new Function('module', 'exports', compiled.outputText)(moduleOutput, moduleOutput.exports);
const { appendAdjacentEvidence } = moduleOutput.exports;

function hit(index, headingPath = ['章节'], sourceType = 'document') {
  return {
    source: { sourceId: 'doc-1', sourceType, chunkIndex: index, headingPath },
    chunkId: `chunk-${index}`,
    score: 0.8,
    origin: 'local_retrieval',
    sourceUpdatedAt: 100,
  };
}

test('adds same-section neighbors with their own chunk IDs, preserving primary rank', () => {
  const result = appendAdjacentEvidence([hit(5), hit(7)], [hit(4), hit(6), hit(8)]);
  assert.deepEqual(
    result.map((row) => row.chunkId),
    ['chunk-5', 'chunk-7', 'chunk-4', 'chunk-6', 'chunk-8'],
  );
  assert.ok(result[2].score < result[0].score);
});

test('rejects a different section, revision, origin, and image neighbor', () => {
  const stale = { ...hit(4), sourceUpdatedAt: 99 };
  const remote = { ...hit(4), origin: 'cloud_retrieval' };
  const result = appendAdjacentEvidence(
    [hit(5), hit(10, ['章节'], 'image')],
    [hit(4, ['另一节']), stale, remote, hit(6), hit(9, ['章节'], 'image')],
  );
  assert.deepEqual(
    result.map((row) => row.chunkId),
    ['chunk-5', 'chunk-10', 'chunk-6'],
  );
});

test('respects the context cap', () => {
  assert.deepEqual(
    appendAdjacentEvidence([hit(5)], [hit(4), hit(6)], 2).map((row) => row.chunkId),
    ['chunk-5', 'chunk-4'],
  );
});
