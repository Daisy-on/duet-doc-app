import {
  loadGhostTextModel as loadLocalGhostTextModel,
  requestGhostText as requestLocalGhostText,
  clearActiveGhostTextRequest,
  getGhostTextStatus,
} from './aiClient';
import type { GhostTextRequest, GhostTextResult } from './aiClient';
import { streamCloudAI } from './cloudClient';
import type { AIRequest, StreamCallbacks } from './types';

/**
 * 统一 AI 调度层 (Dispatcher)
 * - 本地轻量极速任务 (Ghost Text 自动补全) -> 路由给 WebGPU Worker
 * - 云端长文本生成任务 (润色、扩写、解释、问答) -> 路由给 FastAPI 后端
 */

export const AIDispatcher = {
  // --- 本地端侧 AI 路由 ---
  loadGhostTextModel(): void {
    loadLocalGhostTextModel();
  },

  requestGhostText(input: GhostTextRequest): Promise<GhostTextResult | null> {
    return requestLocalGhostText(input);
  },

  clearGhostTextRequest(): void {
    clearActiveGhostTextRequest();
  },

  getGhostTextStatus(): string {
    return getGhostTextStatus();
  },

  // --- 云端 AI 路由 ---
  streamCloudTask(
    request: AIRequest,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    return streamCloudAI(request, callbacks, signal);
  },
};
