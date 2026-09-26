const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/rag/assistantRetriever.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const moduleOutput = { exports: {} };
const state = {
  local: [],
  indexedChunks: [],
  remote: { has_index: false, hits: [] },
  cloudError: null,
  localError: null,
  localStale: false,
  cloudStale: 0,
  remoteClientStale: 0,
  unavailableStaleIds: [],
};
const imports = {
  '../models/modelCache': { inspectModelInstallation: async () => ({ installed: true }) },
  './chunkRepository': {
    getCurrentLocalSourceIds: async () => new Set(['doc-1']),
    hasStaleLocalIndex: async () => state.localStale,
    listIndexedChunks: async ({ sourceTypes }) =>
      sourceTypes
        ? state.indexedChunks.filter((chunk) => sourceTypes.includes(chunk.sourceType))
        : state.indexedChunks,
  },
  './adjacentEvidence': { appendAdjacentEvidence: (hits) => hits },
  './cloudRagSearch': {
    searchCloudRag: async () => {
      if (state.cloudError) throw state.cloudError;
      return state.remote;
    },
  },
  './cloudRagClient': {
    getCloudRagCoverage: async () => ({
      stale_sources: state.cloudStale,
      stale_client_sources: state.remoteClientStale,
      unavailable_stale_source_ids: state.unavailableStaleIds,
    }),
  },
  './embeddingClient': {
    embedPassages: async () => ({ vectors: [new Float32Array(1024)] }),
    withEmbeddingRuntime: (run) => run(),
  },
  './localRetriever': {
    searchLocalKnowledge: async () => {
      if (state.localError) throw state.localError;
      return state.local;
    },
  },
};
new Function('module', 'exports', 'require', compiled.outputText)(
  moduleOutput,
  moduleOutput.exports,
  (name) => imports[name],
);
const { searchAssistantKnowledge } = moduleOutput.exports;

test.beforeEach(() => {
  state.local = [];
  state.indexedChunks = [];
  state.remote = { has_index: false, hits: [] };
  state.cloudError = null;
  state.localError = null;
  state.localStale = false;
  state.cloudStale = 0;
  state.remoteClientStale = 0;
  state.unavailableStaleIds = [];
});

test('keeps local evidence when cloud search fails', async () => {
  state.local = [
    {
      id: 'chunk-1',
      sourceId: 'doc-1',
      sourceType: 'document',
      kbId: 'kb-1',
      title: '文档',
      chunkIndex: 0,
      headingPath: [],
      content: '内容',
      score: 0.9,
      sourceUpdatedAt: Date.now(),
    },
  ];
  state.cloudError = new Error('offline');
  const result = await searchAssistantKnowledge('workspace', '问题', { allowCloudQuery: false });
  assert.equal(result.hasIndex, true);
  assert.deepEqual(
    result.hits.map((hit) => hit.chunkId),
    ['chunk-1'],
  );
  assert.match(result.notice, /仅使用本地/);
});

test('distinguishes a valid index with zero hits from no index', async () => {
  state.indexedChunks = [{ sourceId: 'doc-1', sourceType: 'document' }];
  const result = await searchAssistantKnowledge('workspace', '问题', { allowCloudQuery: false });
  assert.equal(result.hasIndex, true);
  assert.deepEqual(result.hits, []);
  assert.equal(result.notice, undefined);
});

test('does not count a document index for an image-only search', async () => {
  state.indexedChunks = [{ sourceId: 'doc-1', sourceType: 'document' }];
  const result = await searchAssistantKnowledge('workspace', '问题', {
    allowCloudQuery: false,
    sourceTypes: ['image'],
  });
  assert.equal(result.hasIndex, false);
  assert.equal(result.indexState, 'missing');
});

test('reports an expired local index when no current evidence exists', async () => {
  state.localStale = true;
  const result = await searchAssistantKnowledge('workspace', '问题', { allowCloudQuery: false });
  assert.equal(result.hasIndex, false);
  assert.equal(result.indexState, 'stale');
  assert.equal(result.localReindexAvailable, true);
});

test('reports an expired cloud index when no current evidence exists', async () => {
  state.unavailableStaleIds = ['doc-2'];
  const result = await searchAssistantKnowledge('workspace', '问题', { allowCloudQuery: false });
  assert.equal(result.hasIndex, false);
  assert.equal(result.indexState, 'stale');
  assert.equal(result.localReindexAvailable, true);
});

test('recognizes an expired uploaded client index on another device', async () => {
  state.unavailableStaleIds = ['doc-2'];
  const result = await searchAssistantKnowledge('workspace', '问题', { allowCloudQuery: false });
  assert.equal(result.indexState, 'stale');
  assert.equal(result.localReindexAvailable, true);
});

test('warns when a different document is excluded by a stale index', async () => {
  state.local = [
    {
      id: 'chunk-1',
      sourceId: 'doc-1',
      sourceType: 'document',
      kbId: 'kb-1',
      title: '当前文档',
      chunkIndex: 0,
      headingPath: [],
      content: '可用内容',
      score: 0.9,
      sourceUpdatedAt: Date.now(),
    },
  ];
  state.unavailableStaleIds = ['doc-2'];
  const result = await searchAssistantKnowledge('workspace', '问题', { allowCloudQuery: false });
  assert.equal(result.hasIndex, true);
  assert.match(result.notice, /另有 1 项资源的索引已过期/);
  assert.deepEqual(
    result.hits.map((hit) => hit.chunkId),
    ['chunk-1'],
  );
});

test('does not warn when a current local index covers a stale cloud copy', async () => {
  state.local = [
    {
      id: 'chunk-1',
      sourceId: 'doc-1',
      sourceType: 'document',
      kbId: 'kb-1',
      title: '当前文档',
      chunkIndex: 0,
      headingPath: [],
      content: '可用内容',
      score: 0.9,
      sourceUpdatedAt: Date.now(),
    },
  ];
  state.unavailableStaleIds = ['doc-1'];
  const result = await searchAssistantKnowledge('workspace', '问题', { allowCloudQuery: false });
  assert.equal(result.notice, undefined);
});

test('fails when cloud search fails and local search found no evidence', async () => {
  state.cloudError = new Error('offline');
  await assert.rejects(
    searchAssistantKnowledge('workspace', '问题', { allowCloudQuery: false }),
    /offline/,
  );
});

test('keeps cloud evidence when local search fails', async () => {
  state.localError = new Error('local unavailable');
  state.remote = {
    has_index: true,
    hits: [
      {
        source_id: 'doc-2',
        source_type: 'document',
        document_id: 'doc-2',
        kb_id: 'kb-1',
        asset_id: null,
        title: '云端文档',
        chunk_id: 'cloud-1',
        chunk_index: 0,
        heading_path: [],
        content: '云端内容',
        score: 0.8,
        source_updated_at: new Date().toISOString(),
      },
    ],
  };
  const result = await searchAssistantKnowledge('workspace', '问题', { allowCloudQuery: false });
  assert.deepEqual(
    result.hits.map((hit) => hit.chunkId),
    ['cloud-1'],
  );
  assert.match(result.notice, /仅使用云端/);
});

test('does not swallow cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    searchAssistantKnowledge('workspace', '问题', { allowCloudQuery: false }, controller.signal),
    { name: 'AbortError' },
  );
});
