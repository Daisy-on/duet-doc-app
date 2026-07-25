import { useState, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Loader2, ImageOff } from 'lucide-react';
import { assetRepository } from '../../assets/assetRepository';

export default function LocalImageNodeView(props: NodeViewProps) {
  const { node, selected } = props;
  const { assetId, src, alt, title } = node.attrs;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [errorText, setErrorText] = useState('图片无法载入');

  useEffect(() => {
    let active = true;
    let createdObjectUrl: string | null = null;

    // 1. 如果有直连网络图片或 Base64 (兼容外部链接)
    if (!assetId && src) {
      setImageUrl(src);
      setStatus('loaded');
      return;
    }

    // 2. 没有 assetId 也没有 src
    if (!assetId) {
      setStatus('error');
      setErrorText('缺少的图片资源标识');
      return;
    }

    // 3. 从 IndexedDB 异步读取 Blob 并生成对象内存 URL
    setStatus('loading');
    assetRepository
      .getAsset(assetId)
      .then((asset) => {
        if (!active) return;
        if (asset && asset.blob) {
          createdObjectUrl = URL.createObjectURL(asset.blob);
          setImageUrl(createdObjectUrl);
          setStatus('loaded');
        } else {
          setStatus('error');
          setErrorText('图片资源不存在或已被清除');
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setStatus('error');
        setErrorText(err instanceof Error ? err.message : '加载图片失败');
      });

    // 4. 卸载或 assetId 变化时必须调用 revokeObjectURL 释放内存，防止内存泄漏！
    return () => {
      active = false;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [assetId, src]);

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
