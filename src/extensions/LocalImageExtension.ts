import { Node, ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin } from '@tiptap/pm/state';
import LocalImageNodeView from '../components/Editor/LocalImageNodeView';
import { assetRepository } from '../assets/assetRepository';

export interface LocalImageOptions {
  getDocId: () => string | null;
}

export const LocalImageExtension = Node.create<LocalImageOptions>({
  name: 'image',

  group: 'block',

  draggable: true,

  addOptions() {
    return {
      getDocId: () => null,
    };
  },

  addAttributes() {
    return {
      assetId: {
        default: null,
      },
      src: {
        default: null,
      },
      alt: {
        default: '',
      },
      title: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-asset-id]',
        getAttrs: (dom) => ({
          assetId: (dom as HTMLElement).getAttribute('data-asset-id'),
          alt: (dom as HTMLElement).getAttribute('alt'),
          title: (dom as HTMLElement).getAttribute('title'),
        }),
      },
      {
        tag: 'img[src]',
        getAttrs: (dom) => ({
          src: (dom as HTMLElement).getAttribute('src'),
          alt: (dom as HTMLElement).getAttribute('alt'),
          title: (dom as HTMLElement).getAttribute('title'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    if (HTMLAttributes.assetId) {
      return ['img', { 'data-asset-id': HTMLAttributes.assetId, alt: HTMLAttributes.alt || '' }];
    }
    return ['img', HTMLAttributes];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LocalImageNodeView);
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            const files = event.clipboardData?.files;
            if (!files || files.length === 0) return false;

            const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
            if (imageFiles.length === 0) return false; // 没有图片时不拦截，交给普通粘贴流程

            event.preventDefault();

            const docId = options.getDocId();
            if (!docId) {
              alert('无法识别当前文档 ID，存储图片失败');
              return true;
            }

            // 循环处理每张粘贴的图片
            for (const file of imageFiles) {
              assetRepository
                .saveAsset(docId, file)
                .then((asset) => {
                  const node = view.state.schema.nodes.image.create({
                    assetId: asset.id,
                    alt: file.name,
                  });
                  const tr = view.state.tr.replaceSelectionWith(node);
                  view.dispatch(tr);
                })
                .catch((err: unknown) => {
                  alert(err instanceof Error ? err.message : '保存图片失败');
                });
            }

            return true;
          },

          handleDrop(view, event, _slice, moved) {
            if (moved) return false;

            const files = event.dataTransfer?.files;
            if (!files || files.length === 0) return false;

            const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
            if (imageFiles.length === 0) return false;

            event.preventDefault();

            const docId = options.getDocId();
            if (!docId) {
              alert('无法识别当前文档 ID，存储图片失败');
              return true;
            }

            const coordinates = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });

            const targetPos = coordinates ? coordinates.pos : view.state.selection.from;

            for (const file of imageFiles) {
              assetRepository
                .saveAsset(docId, file)
                .then((asset) => {
                  const node = view.state.schema.nodes.image.create({
                    assetId: asset.id,
                    alt: file.name,
                  });
                  const tr = view.state.tr.insert(targetPos, node);
                  view.dispatch(tr);
                })
                .catch((err: unknown) => {
                  alert(err instanceof Error ? err.message : '保存图片失败');
                });
            }

            return true;
          },
        },
      }),
    ];
  },
});

export default LocalImageExtension;
