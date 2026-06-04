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
  prompt: string;
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
  | { type: 'result'; requestId: string; payload: { text: string } }
  | { type: 'error'; requestId?: string; payload: { message: string } };

let generator: TextGenerationPipeline | null = null;
let loadingPromise: Promise<void> | null = null;

function postMessageToMain(message: AiWorkerResponse) {
  self.postMessage(message);
}

function extractGeneratedText(result: TextGenerationOutput): string {
  const output = result as unknown;

  if (Array.isArray(output)) {
    const first = output[0] as { generated_text?: string } | undefined;
    return first?.generated_text?.trim() ?? '';
  }

  if (output && typeof output === 'object' && 'generated_text' in output) {
    return String((output as { generated_text?: string }).generated_text ?? '').trim();
  }

  return '';
}

async function loadModel(payload: LoadPayload) {
  if (generator) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
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

      const result = await generator(message.payload.prompt, {
        max_new_tokens: message.payload.maxNewTokens ?? 12,
        temperature: message.payload.temperature ?? 0.3,
        top_p: message.payload.topP ?? 0.7,
        do_sample: true,
        return_full_text: false,
      });

      postMessageToMain({
        type: 'result',
        requestId: message.requestId,
        payload: {
          text: extractGeneratedText(result as TextGenerationOutput),
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