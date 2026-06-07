import {
  env,
  pipeline,
  type TextGenerationOutput,
  type TextGenerationPipeline,
} from '@huggingface/transformers';

env.allowLocalModels = true;
env.allowRemoteModels = false;

type LoadPayload = {
  modelPath: string;
  dtype: 'q4f16';
  device: 'webgpu';
};

type GeneratePayload = {
  messages: Array<{ role: string; content: string }>;
  maxNewTokens?: number;
  temperature?: number;
  topP?: number;
};

type AiWorkerRequest =
  | {
      type: 'load';
      payload: LoadPayload;
    }
  | {
      type: 'generate';
      requestId: string;
      payload: GeneratePayload;
    };

type AiWorkerResponse =
  | { type: 'load-progress'; payload: unknown }
  | { type: 'ready' }
  | { type: 'result'; requestId: string; payload: { text: string; inferenceTime?: number } }
  | { type: 'error'; requestId?: string; payload: { message: string } };

let generator: TextGenerationPipeline | null = null;
let loadingPromise: Promise<void> | null = null;

function postMessageToMain(message: AiWorkerResponse) {
  self.postMessage(message);
}

function extractGeneratedText(result: TextGenerationOutput): string {
  const output = result as unknown;
  console.log('[ghost-text] raw output:', output);

  if (Array.isArray(output)) {
    const first = output[0] as any;
    if (first && first.generated_text) {
      if (typeof first.generated_text === 'string') {
        return first.generated_text.trim();
      }
      if (Array.isArray(first.generated_text)) {
        // 从对话数组中提取最后一条 assistant 角色的消息内容
        const assistantMessage = [...first.generated_text]
          .reverse()
          .find((msg: any) => msg.role === 'assistant');
        return assistantMessage?.content?.trim() ?? '';
      }
    }
  }

  if (output && typeof output === 'object') {
    if ('generated_text' in output) {
      const genText = (output as any).generated_text;
      if (typeof genText === 'string') {
        return genText.trim();
      }
      if (Array.isArray(genText)) {
        const assistantMessage = [...genText]
          .reverse()
          .find((msg: any) => msg.role === 'assistant');
        return assistantMessage?.content?.trim() ?? '';
      }
    }
  }

  return '';
}

async function loadModel(payload: LoadPayload) {
  if (generator) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      if (navigator.gpu) {
        const adapter = await navigator.gpu.requestAdapter();
        console.log('[ghost-text] WebGPU Adapter 对象:', adapter);
        if (adapter) {
          const info = (adapter as any).info || ((adapter as any).requestAdapterInfo ? await (adapter as any).requestAdapterInfo() : null);
          console.log('[ghost-text] WebGPU Adapter Info (显卡信息):', info);
        } else {
          console.warn('[ghost-text] navigator.gpu.requestAdapter() 返回了 null，WebGPU 在当前 Worker 被禁用！');
        }
      }
    } catch (e) {
      console.warn('[ghost-text] 获取 WebGPU Adapter 失败:', e);
    }

    generator = (await pipeline('text-generation', payload.modelPath, {
      dtype: payload.dtype,
      device: payload.device,
      progress_callback: (progress: unknown) => {
        postMessageToMain({ type: 'load-progress', payload: progress });
      },
    })) as TextGenerationPipeline;

    postMessageToMain({ type: 'ready' });
  })();

  return loadingPromise;
}

self.onmessage = async (event: MessageEvent<AiWorkerRequest>) => {
  const message = event.data;

  try {
    if (message.type === 'load') {
      await loadModel(message.payload);
      return;
    }

    if (message.type === 'generate') {
      if (!generator) {
        postMessageToMain({
          type: 'error',
          requestId: message.requestId,
          payload: { message: 'Ghost text model is not ready.' },
        });
        return;
      }


      const startTime = performance.now();
      const result = await generator(message.payload.messages, {
        max_new_tokens: message.payload.maxNewTokens ?? 16,
        temperature: message.payload.temperature ?? 0.3,
        top_p: message.payload.topP ?? 0.7,
        do_sample: true,
        return_full_text: false,
      });
      const duration = performance.now() - startTime;
      console.log(`[ghost-text] inference completed in ${duration.toFixed(1)}ms`);

      postMessageToMain({
        type: 'result',
        requestId: message.requestId,
        payload: {
          text: extractGeneratedText(result as TextGenerationOutput),
          inferenceTime: duration,
        },
      });
    }
  } catch (error) {
    postMessageToMain({
      type: 'error',
      requestId: 'requestId' in message ? message.requestId : undefined,
      payload: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
};

export {};