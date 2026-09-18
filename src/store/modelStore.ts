import { create } from 'zustand';
import { MODEL_DEFINITIONS, type ModelId } from '../models/catalog';
import {
  downloadModel,
  inspectModelInstallation,
  type ModelInstallation,
} from '../models/modelCache';

export type ModelDownloadStatus =
  'checking' | 'not-installed' | 'downloading' | 'installed' | 'error';

export interface ModelDownloadState {
  status: ModelDownloadStatus;
  downloadedBytes: number;
  totalBytes: number;
  installation: ModelInstallation | null;
  error: string | null;
}

interface ModelStore {
  initialized: boolean;
  activeModelId: ModelId | null;
  models: Record<ModelId, ModelDownloadState>;
  initialize: () => Promise<void>;
  install: (modelId: ModelId) => Promise<void>;
  cancel: (modelId: ModelId) => void;
}

const controllers = new Map<ModelId, AbortController>();
const initialModels = Object.fromEntries(
  MODEL_DEFINITIONS.map((definition) => [
    definition.id,
    {
      status: 'checking',
      downloadedBytes: 0,
      totalBytes: definition.estimatedSizeBytes,
      installation: null,
      error: null,
    },
  ]),
) as Record<ModelId, ModelDownloadState>;

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '下载已取消';
  return error instanceof Error ? error.message : '模型下载失败';
}

export const useModelStore = create<ModelStore>((set, get) => ({
  initialized: false,
  activeModelId: null,
  models: initialModels,

  initialize: async () => {
    if (get().initialized) return;
    const entries = await Promise.all(
      MODEL_DEFINITIONS.map(
        async (definition) =>
          [definition.id, await inspectModelInstallation(definition.id)] as const,
      ),
    );
    set((state) => ({
      initialized: true,
      models: Object.fromEntries(
        entries.map(([modelId, installation]) => [
          modelId,
          {
            ...state.models[modelId],
            status: installation ? 'installed' : 'not-installed',
            downloadedBytes: installation?.totalSizeBytes ?? 0,
            totalBytes: installation?.totalSizeBytes ?? state.models[modelId].totalBytes,
            installation,
          },
        ]),
      ) as Record<ModelId, ModelDownloadState>,
    }));
  },

  install: async (modelId) => {
    if (get().activeModelId) return;
    const controller = new AbortController();
    controllers.set(modelId, controller);
    set((state) => ({
      activeModelId: modelId,
      models: {
        ...state.models,
        [modelId]: {
          ...state.models[modelId],
          status: 'downloading',
          downloadedBytes: 0,
          error: null,
        },
      },
    }));

    try {
      const installation = await downloadModel(modelId, controller.signal, (progress) => {
        set((state) => ({
          models: {
            ...state.models,
            [modelId]: { ...state.models[modelId], ...progress },
          },
        }));
      });
      set((state) => ({
        activeModelId: null,
        models: {
          ...state.models,
          [modelId]: {
            status: 'installed',
            downloadedBytes: installation.totalSizeBytes,
            totalBytes: installation.totalSizeBytes,
            installation,
            error: null,
          },
        },
      }));
      window.dispatchEvent(
        new CustomEvent('duet-model-installed', { detail: { modelId: installation.modelId } }),
      );
    } catch (error) {
      set((state) => ({
        activeModelId: null,
        models: {
          ...state.models,
          [modelId]: {
            ...state.models[modelId],
            status: controller.signal.aborted ? 'not-installed' : 'error',
            downloadedBytes: 0,
            error: controller.signal.aborted ? null : errorMessage(error),
          },
        },
      }));
    } finally {
      controllers.delete(modelId);
    }
  },

  cancel: (modelId) => controllers.get(modelId)?.abort(),
}));
