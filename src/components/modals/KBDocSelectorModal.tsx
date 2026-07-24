import KBTreePickerModal from './KBTreePickerModal';

interface KBDocSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (doc: { id: string; title: string }) => void;
}

export default function KBDocSelectorModal({
  isOpen,
  onClose,
  onSelect,
}: KBDocSelectorModalProps) {
  return (
    <KBTreePickerModal
      isOpen={isOpen}
      onClose={onClose}
      title="选择知识库文档"
      mode="document"
      onSelectDoc={onSelect}
    />
  );
}
