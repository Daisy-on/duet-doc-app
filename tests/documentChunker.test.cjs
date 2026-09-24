const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScript(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputText)(
    (name) => dependencies[name],
    module,
    module.exports,
  );
  return module.exports;
}

const hash = loadTypeScript('src/rag/hash.ts');
const { chunkDocument, createDocumentPassageText } = loadTypeScript('src/rag/documentChunker.ts', {
  './hash': hash,
});

function documentWith(content, title = '设计文档') {
  return { id: 'doc-test', kbId: 'kb', title, content: JSON.stringify(content), updatedAt: 1 };
}

test('keeps section context in embedding input, not citation content', () => {
  const document = documentWith({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '架构' }] },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '第一段说明数据库如何保存文档。'.repeat(4) }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '列表中的同步策略' }] }],
          },
        ],
      },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '检索' }] },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '第二节介绍向量查询与引用。'.repeat(5) }],
      },
    ],
  });

  const chunks = chunkDocument(document);
  assert.deepEqual(
    chunks.map((chunk) => chunk.headingPath),
    [['架构'], ['架构', '检索']],
  );
  assert.equal(
    chunks[0].content,
    `${'第一段说明数据库如何保存文档。'.repeat(4)}\n列表中的同步策略`,
  );
  assert.equal(createDocumentPassageText(chunks[0]), `设计文档\n架构\n${chunks[0].content}`);
  assert.ok(!chunks[0].content.includes('设计文档'));
});

test('bounds the whole embedding input even for long headings and unbroken text', () => {
  const document = documentWith(
    {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: '标题'.repeat(100) }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: '正文'.repeat(600) }] },
      ],
    },
    '文档'.repeat(100),
  );

  const chunks = chunkDocument(document);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => [...createDocumentPassageText(chunk)].length <= 320));
  assert.equal(chunks.map((chunk) => chunk.content).join(''), '正文'.repeat(600));
});
