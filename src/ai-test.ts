import {
  pipeline,
  env,
  type TextGenerationOutput,
  type ProgressInfo,
} from '@huggingface/transformers';
import { getModelBasePath } from './models/catalog';
import { requireModelInstallation } from './models/modelCache';
import { ensureModelCacheServiceWorkerReady } from './models/modelCacheServiceWorker';

// 告诉 Transformers.js 不要尝试从 HuggingFace Hub 下载模型，而是从本地加载
// 注意：如果你放在 public/ 下，Vite dev server 会自动提供静态文件服务
// 路径前面加 / 代表从 Vite 的 public 目录根路径访问
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = false;

const MODEL_ID = 'qwen3.5-0.8b-opt-q4f16' as const;

async function testTextGeneration() {
  await requireModelInstallation(MODEL_ID);
  await ensureModelCacheServiceWorkerReady();
  console.log('⏳ 开始加载模型...');
  const startLoad = performance.now();

  const generator = await pipeline('text-generation', getModelBasePath(MODEL_ID), {
    dtype: 'q4f16', // 使用 q4f16 量化
    device: 'webgpu', // 优先 WebGPU；如果不支持会自动降级到 wasm
    progress_callback: (progress: ProgressInfo) => {
      // 模型加载进度回调
      if (progress.status === 'progress') {
        console.log(`📦 加载中: ${progress.file} - ${Math.round(progress.progress)}%`);
      }
    },
  });

  const loadTime = ((performance.now() - startLoad) / 1000).toFixed(1);
  console.log(`✅ 模型加载完成，耗时 ${loadTime}s`);

  // 测试推理
  console.log('⏳ 开始推理...');
  const startInfer = performance.now();

  const result = (await generator('今天天气很好，我决定', {
    max_new_tokens: 30, // 最多生成 30 个新 token
    temperature: 0.3, // 低温度 = 更确定的输出
    top_p: 0.9,
    do_sample: true,
    return_full_text: false, // 只返回新生成的文本，不重复输入
  })) as TextGenerationOutput;

  const inferTime = ((performance.now() - startInfer) / 1000).toFixed(2);

  console.log(`✅ 推理完成，耗时 ${inferTime}s`);
  console.log('📝 生成结果:', result);
  if (Array.isArray(result) && result.length > 0) {
    console.log('📝 生成文本:', result[0].generated_text);
  }
}

// 导出以便在页面中调用
export { testTextGeneration };
