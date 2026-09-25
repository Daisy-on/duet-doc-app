const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const appRoot = path.resolve(__dirname, '..');
const backendRoot = path.resolve(appRoot, '..', 'duet-doc-backend');

function loadTypeScript(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(appRoot, file), 'utf8');
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

function sampleDocument() {
  return {
    id: 'chunker-sample',
    kbId: 'kb-sample',
    title: '端云分块对照',
    updatedAt: 1,
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '同步设计' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '文档先保存到本地，再由用户主动同步到云端。'.repeat(10) },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: '先上传正文引用的图片' }] },
              ],
            },
          ],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '索引' }] },
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'SELECT * FROM rag_text_chunks WHERE source_id = ?;' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '长段落需要在完整向量输入预算内寻找自然边界。'.repeat(15) },
          ],
        },
      ],
    },
  };
}

function readDocument(file, title) {
  const input = file ? JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) : sampleDocument();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('输入文件必须是 TipTap JSON 对象或包含 title/content 的文档对象。');
  }
  const raw = input.type === 'doc' ? { content: input } : input;
  const content = raw.content;
  if (typeof content !== 'string' && (!content || typeof content !== 'object')) {
    throw new Error('文档缺少 content。');
  }
  const contentFormat = raw.contentFormat ?? raw.content_format ?? 'tiptap_json';
  const document = {
    id: raw.id ?? 'chunker-input',
    kbId: raw.kbId ?? raw.kb_id ?? 'kb-sample',
    title: title ?? raw.title ?? (file ? path.basename(file, path.extname(file)) : ''),
    content: typeof content === 'string' ? content : JSON.stringify(content),
    updatedAt: raw.updatedAt ?? 1,
    contentFormat,
  };
  if (typeof document.title !== 'string' || !document.title.trim()) {
    throw new Error('文档标题不能为空；可以通过 --title 指定。');
  }
  return document;
}

function pythonCommand() {
  const candidates = [
    path.join(backendRoot, '.venv', 'Scripts', 'python.exe'),
    path.join(backendRoot, '.venv', 'bin', 'python'),
  ];
  return (
    process.env.PYTHON || candidates.find((candidate) => fs.existsSync(candidate)) || 'python3'
  );
}

function compare(document) {
  const hash = loadTypeScript('src/rag/hash.ts');
  const { chunkDocument, createDocumentPassageText, getDocumentSourceType } = loadTypeScript(
    'src/rag/documentChunker.ts',
    { './hash': hash },
  );
  const local = chunkDocument(document).map((chunk) => ({
    chunkIndex: chunk.chunkIndex,
    headingPath: chunk.headingPath,
    content: chunk.content,
    passage: createDocumentPassageText(chunk),
  }));
  const result = spawnSync(pythonCommand(), ['-m', 'app.chunker_compare'], {
    cwd: backendRoot,
    input: JSON.stringify({ ...document, sourceType: getDocumentSourceType(document) }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || '后端分块命令运行失败。');
  const cloud = JSON.parse(result.stdout);
  const differences = [];
  for (let index = 0; index < Math.max(local.length, cloud.length); index += 1) {
    const front = local[index];
    const back = cloud[index];
    for (const field of ['chunkIndex', 'headingPath', 'content', 'passage']) {
      if (JSON.stringify(front?.[field]) !== JSON.stringify(back?.[field])) {
        differences.push({ index, field, front: front?.[field], back: back?.[field] });
      }
    }
  }
  return {
    title: document.title,
    localChunks: local.length,
    cloudChunks: cloud.length,
    maxLocalPassageChars: local.reduce(
      (maximum, row) => Math.max(maximum, [...row.passage].length),
      0,
    ),
    maxCloudPassageChars: cloud.reduce(
      (maximum, row) => Math.max(maximum, [...row.passage].length),
      0,
    ),
    preview: local.slice(0, 5).map((row) => ({
      index: row.chunkIndex,
      headingPath: row.headingPath,
      passageChars: [...row.passage].length,
      content: row.content.slice(0, 90),
    })),
    differences,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('用法：npm run compare:chunkers -- [文档.json] [--title "文档标题"]');
    console.log('无参数时运行内置样例；文件可为 TipTap JSON 或含 title/content 的文档对象。');
    return;
  }
  const titleIndex = args.indexOf('--title');
  if (titleIndex >= 0 && !args[titleIndex + 1]) throw new Error('--title 后面需要文档标题。');
  const file = args.find(
    (argument, index) => !argument.startsWith('--') && (titleIndex < 0 || index !== titleIndex + 1),
  );
  const document = readDocument(file, titleIndex >= 0 ? args[titleIndex + 1] : undefined);
  const report = compare(document);
  console.log(`文档：${report.title}`);
  console.log(`分块数：前端 ${report.localChunks}，后端 ${report.cloudChunks}`);
  console.log(
    `最长 embedding 输入：前端 ${report.maxLocalPassageChars}，后端 ${report.maxCloudPassageChars} 字符（不是 token 数）`,
  );
  for (const row of report.preview) {
    console.log(
      `  块 ${row.index} · ${row.passageChars} 字符 · ${row.headingPath.join(' > ') || '无标题'} · ${JSON.stringify(row.content)}`,
    );
  }
  if (report.localChunks > report.preview.length) console.log('  仅预览前 5 块。');
  if (report.localChunks === 0 && report.cloudChunks === 0) {
    console.log('结果：两端均未产生可检索分块；请检查文档内容是否达到最低长度。');
    process.exitCode = 1;
    return;
  }
  if (Math.max(report.maxLocalPassageChars, report.maxCloudPassageChars) > 320) {
    console.log('结果：完整 embedding 输入超过 320 字符预算。');
    process.exitCode = 1;
  }
  if (report.differences.length === 0) {
    console.log('逐块一致（标题路径、正文、embedding 输入）。');
    return;
  }
  console.log(`结果：${report.differences.length} 处字段差异：`);
  for (const difference of report.differences.slice(0, 10)) {
    console.log(`  块 ${difference.index} · ${difference.field}`);
    console.log(`    前端：${JSON.stringify(difference.front)?.slice(0, 180) ?? '缺失'}`);
    console.log(`    后端：${JSON.stringify(difference.back)?.slice(0, 180) ?? '缺失'}`);
  }
  if (report.differences.length > 10) console.log('  仅显示前 10 处差异。');
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`对照失败：${error.message}`);
  process.exitCode = 2;
}
