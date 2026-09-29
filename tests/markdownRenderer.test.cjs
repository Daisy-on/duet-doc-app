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
    (name) => {
      if (dependencies[name]) return dependencies[name];
      return require(name);
    },
    module,
    module.exports,
  );
  return module.exports;
}

const urlUtils = loadTypeScript('src/utils/urlUtils.ts');
const codeLanguageUtils = loadTypeScript('src/utils/codeLanguageUtils.ts');

const { splitMarkdownBlocks, renderMarkdownToHtml, getMarkdownPerfStats, resetMarkdownPerfStats } =
  loadTypeScript('src/utils/markdownRenderer.ts', {
    './urlUtils': urlUtils,
    './codeLanguageUtils': codeLanguageUtils,
  });

test('splitMarkdownBlocks separates frozen paragraphs and trailing activeTail', () => {
  const markdown = '# Heading 1\n\nThis is paragraph 1.\n\nThis is paragraph 2.';
  const { frozenBlocks, activeTail } = splitMarkdownBlocks(markdown);
  assert.equal(frozenBlocks.length, 2);
  assert.equal(frozenBlocks[0].text, '# Heading 1');
  assert.equal(frozenBlocks[1].text, 'This is paragraph 1.');
  assert.equal(activeTail, 'This is paragraph 2.');
});

test('splitMarkdownBlocks keeps closed code block in frozenBlocks with isCodeBlock: true', () => {
  const codeBlock = '```typescript\nconst x = 10;\nconst y = 20;\n```';
  const markdown = `Intro text.\n\n${codeBlock}\n\nOutro text.`;
  const { frozenBlocks, activeTail } = splitMarkdownBlocks(markdown);

  assert.equal(frozenBlocks.length, 2);
  assert.equal(frozenBlocks[0].text, 'Intro text.');
  assert.equal(frozenBlocks[0].isCodeBlock, false);

  assert.equal(frozenBlocks[1].text, codeBlock);
  assert.equal(frozenBlocks[1].isCodeBlock, true);

  assert.equal(activeTail, 'Outro text.');
});

test('splitMarkdownBlocks places unclosed code block in activeTail with fence intact', () => {
  const unclosed = '```python\ndef hello():\n    print("world")';
  const markdown = `Before block.\n\n${unclosed}`;
  const { frozenBlocks, activeTail } = splitMarkdownBlocks(markdown);

  assert.equal(frozenBlocks.length, 1);
  assert.equal(frozenBlocks[0].text, 'Before block.');
  assert.equal(activeTail, unclosed);
});

test('active unclosed code block downgrades to plain text during streaming', () => {
  const unclosed = '```typescript\nconst greeting: string = "hello";';
  const html = renderMarkdownToHtml(unclosed, { isStreaming: true });

  // During streaming, unclosed code block should NOT contain hljs-keyword spans
  assert.ok(
    !html.includes('hljs-keyword'),
    'Unclosed code block in stream should not invoke lowlight',
  );
  assert.ok(
    html.includes('const greeting: string = &quot;hello&quot;') ||
      html.includes('const greeting: string = "hello"'),
    'Must contain escaped plain text',
  );
});

test('closed code block highlights immediately even during streaming ("闭合即上色")', () => {
  const closed = '```typescript\nconst greeting: string = "hello";\n```';
  const html = renderMarkdownToHtml(closed, { isStreaming: true });

  // Closed code block MUST have syntax highlight even while isStreaming is true
  assert.ok(html.includes('hljs-keyword'), 'Closed code block must be highlighted immediately');
});

test('block cache successfully reuses HTML across incremental streaming chunks', () => {
  resetMarkdownPerfStats();

  const chunk1 = '### Section 1\n\nFirst paragraph content.\n\n';
  const chunk2 =
    '### Section 1\n\nFirst paragraph content.\n\n### Section 2\n\nSecond paragraph content.';

  // Render chunk 1
  renderMarkdownToHtml(chunk1, { isStreaming: true });
  const statsAfter1 = getMarkdownPerfStats();
  assert.equal(statsAfter1.cacheHits, 0);

  // Render chunk 2 (Section 1 and first paragraph should hit blockHtmlCache)
  renderMarkdownToHtml(chunk2, { isStreaming: true });
  const statsAfter2 = getMarkdownPerfStats();
  assert.ok(
    statsAfter2.blockCacheHits >= 2,
    `Expected at least 2 block cache hits, got ${statsAfter2.blockCacheHits}`,
  );
});

test('terminal render (isStreaming: false) hits whole message cacheHits on repeated calls', () => {
  resetMarkdownPerfStats();

  const finalMarkdown =
    '# Document\n\n```javascript\nfunction add(a, b) { return a + b; }\n```\n\nDone.';
  const html1 = renderMarkdownToHtml(finalMarkdown, { isStreaming: false });
  const html2 = renderMarkdownToHtml(finalMarkdown, { isStreaming: false });

  assert.equal(html1, html2);
  const stats = getMarkdownPerfStats();
  assert.equal(
    stats.cacheHits,
    1,
    'Second identical non-streaming call must hit whole message cache',
  );
});
