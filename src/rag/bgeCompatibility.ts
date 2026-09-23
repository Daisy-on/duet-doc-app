import { embedPassagesInBatches, withEmbeddingRuntime } from './embeddingClient';

const formatBgeQuery = (query: string) => `为这个句子生成表示以用于检索相关文章：${query.trim()}`;

const passages = [
  {
    id: 'postgres',
    text: 'PostgreSQL 使用 pgvector 扩展存储向量，并通过距离运算检索相近的文档分块。',
  },
  {
    id: 'indexeddb',
    text: '浏览器使用 IndexedDB 保存本地文档、图片 Blob 和历史版本，离线时仍可编辑。',
  },
  { id: 'webgpu', text: '端侧模型在 Web Worker 中通过 WebGPU 运行，避免长时间阻塞编辑器主线程。' },
  { id: 'oss', text: '图片上传到阿里云 OSS，服务器使用 ECS RAM Role 签发短期读取地址。' },
  { id: 'alembic', text: '数据库表结构变更通过 Alembic 迁移管理，部署前先升级数据库版本。' },
  { id: 'vite', text: 'Vite 在开发时按需提供原生 ES 模块，文件修改后通过热更新快速刷新页面。' },
  { id: 'media-gc', text: '图片垃圾回收只清理超过保留期且不再被正文或历史版本引用的资源。' },
  {
    id: 'auth',
    text: '登录后由服务器签发短期 Access Token，Refresh Token 放在 HttpOnly Cookie 中。',
  },
  { id: 'sse', text: 'AI 助手使用 SSE 将生成的回答逐段推送到浏览器，用户可以实时看到输出。' },
  { id: 'docker', text: '服务器通过 Docker Compose 同时运行 FastAPI、PostgreSQL 和后台索引任务。' },
  { id: 'chunking', text: '长文档先按标题和段落切分为小块，再分别生成语义向量用于检索。' },
  { id: 'sync', text: '用户主动同步时，客户端先上传正文引用的图片，再推送文档变更到云端。' },
];

const queries = [
  { id: 'q-postgres', text: '数据库如何做向量检索？', expectedPassageId: 'postgres' },
  { id: 'q-indexeddb', text: '离线文档和图片保存在浏览器哪里？', expectedPassageId: 'indexeddb' },
  { id: 'q-webgpu', text: '怎样避免本地模型卡住编辑器？', expectedPassageId: 'webgpu' },
  { id: 'q-oss', text: '服务器怎样取得私有图片的临时下载地址？', expectedPassageId: 'oss' },
  { id: 'q-alembic', text: '部署时数据库结构如何升级？', expectedPassageId: 'alembic' },
  { id: 'q-sse', text: '助手如何实时返回生成中的答案？', expectedPassageId: 'sse' },
  { id: 'q-media-gc', text: '什么情况下可以删除云端旧图片？', expectedPassageId: 'media-gc' },
  { id: 'q-sync', text: '手动同步文档前需要先上传什么？', expectedPassageId: 'sync' },
];

async function embedTexts(texts: string[]): Promise<number[][]> {
  const result = await embedPassagesInBatches(texts);
  return result.vectors.map((vector) => Array.from(vector));
}

export async function exportBgeCompatibilityFixture(): Promise<void> {
  const passageInputs = passages.map((passage) => passage.text);
  const queryInputs = queries.map((query) => formatBgeQuery(query.text));

  await withEmbeddingRuntime(async () => {
    const passageVectors = await embedTexts(passageInputs);
    const queryVectors = await embedTexts(queryInputs);
    const fixture = {
      version: 1,
      localModel: 'bge-large-zh-v1.5-fp16',
      passages: passages.map((passage, index) => ({
        ...passage,
        embedding: passageVectors[index],
      })),
      queries: queries.map((query, index) => ({
        ...query,
        input: queryInputs[index],
        embedding: queryVectors[index],
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(fixture)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'duet-bge-compatibility-fp16.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  });
}
