import {
  pipeline,
  env,
  type TextGenerationOutput,
  type ProgressInfo,
} from '@huggingface/transformers';

// 告诉 Transformers.js 不要尝试从 HuggingFace Hub 下载模型，而是从本地加载
// 注意：如果你放在 public/ 下，Vite dev server 会自动提供静态文件服务
// 路径前面加 / 代表从 Vite 的 public 目录根路径访问
env.allowLocalModels = true;

async function testTextGeneration() {
  console.log('⏳ 开始加载模型...');
  const startLoad = performance.now();

  // 初始化 text-generation pipeline
  // 路径指向 public/ai-models/qwen3.5-0.8b-opt/（Vite 会自动映射 public/ 为根路径）
  const generator = await pipeline(
    'text-generation',
    '/ai-models/qwen3.5-0.8b-opt/', // 注意末尾斜杠
    {
      dtype: 'q4f16', // 使用 q4f16 量化
      device: 'webgpu', // 优先 WebGPU；如果不支持会自动降级到 wasm
      progress_callback: (progress: ProgressInfo) => {
        // 模型加载进度回调
        if (progress.status === 'progress') {
          console.log(`📦 加载中: ${progress.file} - ${Math.round(progress.progress)}%`);
        }
      },
    },
  );

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
