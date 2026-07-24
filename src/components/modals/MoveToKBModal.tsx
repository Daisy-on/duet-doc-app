import KBTreePickerModal from './KBTreePickerModal';

interface MoveToKBModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  onConfirm: (targetKbId: string, targetGroupId: string | null) => void;
}

export default function MoveToKBModal({
  isOpen,
  onClose,
  documentId: _documentId,
  documentTitle,
  onConfirm,
}: MoveToKBModalProps) {
  return (
    <KBTreePickerModal
      isOpen={isOpen}
      onClose={onClose}
      title="移动文档至知识库"
      mode="folder"
      subtitle={
        <span>
          文档：<span className="font-semibold text-text-primary">“{documentTitle}”</span>
        </span>
      }
      onSelectFolder={onConfirm}
    />
  );
}
