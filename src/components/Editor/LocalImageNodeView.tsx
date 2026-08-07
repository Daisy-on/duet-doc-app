import { useState, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Loader2, ImageOff } from 'lucide-react';
import { assetRepository } from '../../assets/assetRepository';

interface AsyncAssetState {
  loadedAssetId: string | null;
  objectUrl: string | null;
  status: 'loading' | 'loaded' | 'error';
  errorText: string;
}

export default function LocalImageNodeView(props: NodeViewProps) {
  const { node, selected } = props;
  const { assetId, src, alt, title } = node.attrs;

  const [asyncState, setAsyncState] = useState<AsyncAssetState>({
    loadedAssetId: null,
    objectUrl: null,
    status: 'loading',
    errorText: '图片无法载入',
  });

  // 1. 直连网络图片/Base64 或 缺少标识的派生计算
  const isDirectSrc = !assetId && Boolean(src);
  const isMissingAssetId = !assetId && !src;

  useEffect(() => {
    if (!assetId) return;

    let active = true;
    let createdObjectUrl: string | null = null;

    // 2. 从 IndexedDB 异步读取 Blob 并生成内存 URL
    assetRepository
      .getAsset(assetId)
      .then((asset) => {
        if (!active) return;
        if (asset && asset.blob) {
          createdObjectUrl = URL.createObjectURL(asset.blob);
          setAsyncState({
            loadedAssetId: assetId,
            objectUrl: createdObjectUrl,
            status: 'loaded',
            errorText: '',
          });
        } else {
          setAsyncState({
            loadedAssetId: assetId,
            objectUrl: null,
            status: 'error',
            errorText: '图片资源不存在或已被清除',
          });
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setAsyncState({
          loadedAssetId: assetId,
          objectUrl: null,
          status: 'error',
          errorText: err instanceof Error ? err.message : '加载图片失败',
        });
      });

    // 3. 卸载或 assetId 变化时释放 ObjectURL，防止内存泄漏
    return () => {
      active = false;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [assetId]);

  // 4. 派生当前视图渲染状态 (防止切图时旧图闪烁)
  let status: 'loading' | 'loaded' | 'error';
  let imageUrl: string | null = null;
  let errorText = '图片无法载入';

  if (isDirectSrc) {
    status = 'loaded';
    imageUrl = src;
  } else if (isMissingAssetId) {
    status = 'error';
    errorText = '缺少的图片资源标识';
  } else if (asyncState.loadedAssetId === assetId) {
    status = asyncState.status;
    imageUrl = asyncState.objectUrl;
    errorText = asyncState.errorText;
  } else {
    status = 'loading';
  }

  return (
    <NodeViewWrapper className="my-3 flex justify-start group select-none">
      <div
        className={`relative max-w-full overflow-hidden rounded-lg border border-gray-200/80 transition-all ${
          selected ? 'ring-2 ring-accent shadow-md' : 'shadow-xs hover:shadow-sm'
        }`}
      >
        {status === 'loading' && (
          <div className="flex h-36 w-64 items-center justify-center gap-2 bg-gray-50 text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span className="text-xs font-medium">正在载入图片...</span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex h-28 min-w-[200px] items-center justify-center gap-2.5 bg-red-50/60 px-4 text-red-500">
            <ImageOff className="h-5 w-5 shrink-0" />
            <span className="text-xs font-medium">{errorText}</span>
          </div>
        )}

        {status === 'loaded' && imageUrl && (
          <img
            src={imageUrl}
            alt={alt || ''}
            title={title || ''}
            className="block max-w-full h-auto object-contain max-h-[600px] rounded-lg"
            draggable={false}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}
