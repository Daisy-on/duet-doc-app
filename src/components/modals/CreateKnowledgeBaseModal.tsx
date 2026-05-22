import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useKnowledgeBaseStore } from '../../store/knowledgeBaseStore';

interface CreateKnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLORS = [
  '#f97316', // Orange
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#a855f7', // Purple
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#6366f1', // Indigo
  '#ec4899', // Pink
];

export default function CreateKnowledgeBaseModal({ isOpen, onClose }: CreateKnowledgeBaseModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const createKnowledgeBase = useKnowledgeBaseStore((state) => state.createKnowledgeBase);
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newKbId = createKnowledgeBase(name.trim(), description.trim(), selectedColor);
    onClose();
    // Navigate to the newly created KB homepage
    navigate(`/kb/${newKbId}`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl w-[500px] border border-border-color overflow-hidden flex flex-col p-6 animate-modal-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-5 pb-1">
          <h2 className="text-[17px] font-bold text-text-primary">新建知识库</h2>
          <button 
            onClick={onClose} 
            className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded-md hover:bg-hover-bg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">知识库名称 *</label>
            <input
              type="text"
              required
              placeholder="例如：大前端、核心产品规划..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-3.5 py-2 border border-border-color rounded-lg text-sm text-text-primary outline-none focus:border-accent transition-colors"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">简介</label>
            <textarea
              placeholder="请输入知识库的简介或说明..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="px-3.5 py-2 border border-border-color rounded-lg text-sm text-text-primary outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">选择图标颜色</label>
            <div className="flex gap-2.5 flex-wrap py-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-7 h-7 rounded-full border-2 transition-all relative flex items-center justify-center`}
                  style={{
                    backgroundColor: color,
                    borderColor: selectedColor === color ? 'white' : 'transparent',
                    boxShadow: selectedColor === color ? `0 0 0 2px ${color}` : 'none',
                  }}
                  title={color}
                >
                  {selectedColor === color && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-color">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border-color rounded-lg text-[13px] font-medium text-text-secondary hover:bg-hover-bg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className={`px-5 py-2 rounded-lg text-[13px] font-semibold text-white shadow-sm transition-all ${
                name.trim() 
                  ? 'bg-accent hover:bg-indigo-700 cursor-pointer' 
                  : 'bg-indigo-300 cursor-not-allowed'
              }`}
            >
              新建知识库
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
