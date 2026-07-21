import { useState, useEffect } from 'react';
import { X, Check, BookOpen } from 'lucide-react';
import { useKnowledgeBaseStore, MEMO_KB_ID } from '../../store/knowledgeBaseStore';

interface KBChooserModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTitle: string;
  onConfirm: (targetKbId: string, targetGroupId: string | null, title: string) => void;
}

export default function KBChooserModal({
  isOpen,
  onClose,
  defaultTitle,
  onConfirm,
}: KBChooserModalProps) {
  const { knowledgeBases, getGroupsByKb } = useKnowledgeBaseStore();

  const visibleKBs = knowledgeBases.filter((kb) => kb.id !== MEMO_KB_ID);

  const [docTitle, setDocTitle] = useState(defaultTitle);
  const [selectedKbId, setSelectedKbId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDocTitle(defaultTitle || 'AI 对话提取文档');
      if (visibleKBs.length > 0) {
        setSelectedKbId(visibleKBs[0].id);
      }
      setSelectedGroupId(null);
    }
  }, [isOpen, defaultTitle]);

  if (!isOpen) return null;

  const currentGroups = selectedKbId ? getGroupsByKb(selectedKbId) : [];

  const handleConfirm = () => {
    if (!selectedKbId) return;
    onConfirm(selectedKbId, selectedGroupId, docTitle.trim() || '未命名文档');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-border-color w-full max-w-md rounded-2xl shadow-2xl p-6 relative flex flex-col gap-5">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-border-color">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <BookOpen size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">生成为知识库文档</h3>
              <p className="text-[11px] text-text-secondary">选择目标知识库，将当前回答转存为文档</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex flex-col gap-4">
          {/* Document Title */}
          <div>
            <label className="block text-[11px] font-bold text-text-secondary mb-1.5">
              文档标题
            </label>
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="输入文档标题..."
              className="w-full px-3 py-2 border border-border-color rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent bg-gray-50/50"
            />
          </div>

          {/* Select KB */}
          <div>
            <label className="block text-[11px] font-bold text-text-secondary mb-1.5">
              保存到知识库
            </label>
            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
              {visibleKBs.map((kb) => {
                const isSelected = kb.id === selectedKbId;
                return (
                  <button
                    key={kb.id}
                    type="button"
                    onClick={() => {
                      setSelectedKbId(kb.id);
                      setSelectedGroupId(null);
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/60 border-indigo-200 text-indigo-700 font-semibold shadow-sm'
                        : 'bg-white border-border-color text-text-primary hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: kb.icon || '#6366f1' }}
                      />
                      <span className="truncate">{kb.name}</span>
                    </div>
                    {isSelected && <Check size={14} className="text-indigo-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Select Group (Optional) */}
          {currentGroups.length > 0 && (
            <div>
              <label className="block text-[11px] font-bold text-text-secondary mb-1.5">
                选择分组（可选）
              </label>
              <select
                value={selectedGroupId || ''}
                onChange={(e) => setSelectedGroupId(e.target.value || null)}
                className="w-full px-3 py-2 border border-border-color rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent bg-gray-50/50"
              >
                <option value="">(根目录 - 不放入任何分组)</option>
                {currentGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    📁 {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2.5 pt-2 border-t border-border-color">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-border-color text-xs font-medium text-text-secondary hover:bg-gray-100 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-indigo-700 shadow-md transition-all cursor-pointer"
          >
            确认创建
          </button>
        </div>
      </div>
    </div>
  );
}
