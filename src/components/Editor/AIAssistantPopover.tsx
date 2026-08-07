import React, { useState } from 'react';
import { Sparkles, X, Check, Copy, AlertCircle, Loader2 } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import type { CloudAITask, AIRequest } from '../../ai/types';
import { useAIStream } from './useAIStream';

interface SavedSelection {
  from: number;
  to: number;
  text: string;
}

interface AIAssistantPopoverProps {
  assistantPos: { top?: number; bottom?: number; left: number };
  assistantRef: React.RefObject<HTMLDivElement | null>;
  task: CloudAITask;
  defaultInstruction: string;
  savedSelection: SavedSelection | null;
  editor: Editor | null;
  onClose: () => void;
}

export const AIAssistantPopover: React.FC<AIAssistantPopoverProps> = ({
  assistantPos,
  assistantRef,
  task,
  defaultInstruction,
  savedSelection,
  editor,
  onClose,
}) => {
  const [inputVal, setInputVal] = useState(defaultInstruction);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { isGenerating, generatedText, error, startStream, resetState } = useAIStream();

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSubmit = () => {
    if (isGenerating) return;
    setWarningMsg(null);

    const request: AIRequest = {
      task,
      instruction: inputVal.trim() || undefined,
      selectedText: savedSelection?.text || undefined,
      options: {
        thinking: false,
        temperature: 0.5,
      },
    };

    startStream(request);
  };

  const handleAdopt = () => {
    if (!editor || !savedSelection || !generatedText) return;

    // 安全校验：核对当前选区文本是否与触发时保存的一致
    const { from, to, text: originalText } = savedSelection;
    const currentText = editor.state.doc.textBetween(from, to, ' ');

    if (currentText !== originalText) {
      setWarningMsg('原选区内容已被修改，无法自动替换。');
      return;
    }

    // 单次 Tiptap 事务完成整体替换
    editor.chain().focus().insertContentAt({ from, to }, generatedText).run();
    handleClose();
  };

  const handleCopy = () => {
    if (!generatedText) return;
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showPreview = isGenerating || generatedText.length > 0 || error !== null;

  return (
    <div
      ref={assistantRef}
      className="fixed z-50 animate-modal-scale-in"
      style={{
        top: assistantPos.top,
        bottom: assistantPos.bottom,
        left: assistantPos.left,
      }}
    >
      <div className="bg-white text-zinc-800 rounded-xl p-3 shadow-xl border border-zinc-200/80 w-[560px] flex flex-col gap-2.5">
        {/* 输入行 */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center text-indigo-500 shrink-0">
            {isGenerating ? (
              <Loader2 size={16} className="animate-spin text-indigo-500" />
            ) : (
              <Sparkles size={16} />
            )}
          </div>

          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-zinc-800 placeholder-zinc-400 text-[13px] h-7"
            placeholder="向智能助手提出要求或按 Enter 提交..."
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleClose();
              }
            }}
            autoFocus
          />

          <button
            className="text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 p-1 rounded-md transition-colors"
            onClick={handleClose}
          >
            <X size={14} />
          </button>
        </div>

        {/* 警告消息 */}
        {warningMsg && (
          <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 text-[12px] px-2.5 py-1.5 rounded-lg border border-amber-200">
            <AlertCircle size={13} />
            <span>{warningMsg}</span>
          </div>
        )}

        {/* 错误展示 */}
        {error && (
          <div className="flex items-center gap-1.5 text-rose-600 bg-rose-50 text-[12px] px-2.5 py-1.5 rounded-lg border border-rose-200">
            <AlertCircle size={13} />
            <span>{error.message || '请求服务发生异常'}</span>
          </div>
        )}

        {/* 流式结果预览区 */}
        {showPreview && !error && (
          <div className="flex flex-col gap-2 border-t border-zinc-100 pt-2.5 max-h-[200px] overflow-y-auto">
            <div className="text-[13px] text-zinc-700 leading-relaxed whitespace-pre-wrap select-text">
              {generatedText}
              {isGenerating && (
                <span className="inline-block w-1.5 h-3.5 bg-indigo-500 ml-1 animate-pulse align-middle" />
              )}
            </div>

            {/* 操作按钮区（生成结束或已有文本时展示） */}
            {!isGenerating && generatedText.length > 0 && (
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-50 select-none">
                {task === 'explain' ? (
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[12px] px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-medium rounded-md transition-colors"
                  >
                    {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    {copied ? '已复制' : '复制解释'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1 text-[12px] px-2.5 py-1 text-zinc-500 hover:bg-zinc-100 rounded-md transition-colors"
                    >
                      <Copy size={12} />
                      复制
                    </button>
                    <button
                      onClick={handleAdopt}
                      className="flex items-center gap-1 text-[12px] px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md shadow-sm transition-colors"
                    >
                      <Check size={12} />
                      替换选区
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
