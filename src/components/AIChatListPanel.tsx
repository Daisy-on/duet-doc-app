import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, MessageSquare, Sparkles, MoreHorizontal, Pin, Pen } from 'lucide-react';
import { useAIWritingStore, type ChatSession } from '../store/aiWritingStore';
import { useLayoutStore } from '../store';

export default function AIChatListPanel() {
  const navigate = useNavigate();
  const params = useParams<{ '*': string }>();
  const sessionId = params['*'] || undefined;
  const { sessions, createSession, updateSession, deleteSession, setActiveSessionId } = useAIWritingStore();
  const { catalogWidth, isCatalogCollapsed, setCatalogWidth, setIsCatalogCollapsed } = useLayoutStore();

  const [popoverOpenId, setPopoverOpenId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateSession = async () => {
    // 空白对话页面点击 + 图标无效
    if (!sessionId) return;

    const newId = await createSession();
    navigate(`/ai-writing/${newId}`);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession(id);
    if (sessionId === id) {
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length > 0) {
        navigate(`/ai-writing/${remaining[0].id}`);
      } else {
        navigate('/ai-writing');
      }
    }
  };

  const handleTogglePin = (id: string, currentPinned?: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateSession(id, { isPinned: !currentPinned });
    setPopoverOpenId(null);
  };

  const handleStartRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingSessionId(session.id);
    setRenameText(session.title);
    setPopoverOpenId(null);
  };

  const handleSaveRename = (id: string) => {
    if (renameText.trim()) {
      updateSession(id, { title: renameText.trim() });
    }
    setRenamingSessionId(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = catalogWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = startWidth + deltaX;
      const minWidth = 220;
      const maxWidth = Math.floor(window.innerWidth / 3);

      if (newWidth < minWidth) {
        const overflow = minWidth - newWidth;
        if (overflow > minWidth / 2) {
          setIsCatalogCollapsed(true);
        } else {
          setIsCatalogCollapsed(false);
          setCatalogWidth(minWidth);
        }
      } else if (newWidth > maxWidth) {
        setCatalogWidth(maxWidth);
        setIsCatalogCollapsed(false);
      } else {
        setCatalogWidth(newWidth);
        setIsCatalogCollapsed(false);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <>
      <aside
        style={{ width: isCatalogCollapsed ? 0 : `${catalogWidth}px` }}
        className={`relative bg-bg-panel border-r border-border-color flex flex-col h-full select-none transition-all duration-150 ease-out ${
          isCatalogCollapsed ? 'overflow-visible' : 'overflow-hidden'
        }`}
      >
        {!isCatalogCollapsed && (
          <div className="flex flex-col h-full w-full min-w-[220px]">
            {/* Header */}
            <div className="p-5 pb-3 flex justify-between items-center shrink-0">
              <div className="text-[14px] font-semibold text-text-primary flex items-center gap-1.5">
                <Sparkles size={16} className="text-accent" />
                <span>AI 写作对话</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCreateSession}
                  className="text-text-secondary cursor-pointer hover:text-text-primary transition-colors p-1 hover:bg-hover-bg rounded-md flex"
                  title="开启新对话"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Title / Label */}
            <div className="text-[11px] font-bold text-text-secondary uppercase tracking-wider px-5 mt-4 mb-2 shrink-0">
              历史记录
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-xs text-text-secondary">
                  暂无对话历史
                </div>
              ) : (
                sessions.map((session) => {
                  const isActive = session.id === sessionId;
                  const isRenaming = renamingSessionId === session.id;

                  return (
                    <div
                      key={session.id}
                      onClick={() => {
                        if (isRenaming) return;
                        setActiveSessionId(session.id);
                        navigate(`/ai-writing/${session.id}`);
                      }}
                      className={`text-[13px] py-2 px-3 rounded-md cursor-pointer flex items-center justify-between group/row hover:bg-hover-bg transition-all relative ${
                        isActive
                          ? 'text-accent font-semibold bg-white shadow-sm border-l-2 border-accent rounded-l-none pl-[14px]'
                          : 'text-text-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <MessageSquare size={14} className={isActive ? 'text-accent shrink-0' : 'text-text-secondary shrink-0'} />
                        
                        {isRenaming ? (
                          <input
                            autoFocus
                            value={renameText}
                            onChange={(e) => setRenameText(e.target.value)}
                            onBlur={() => handleSaveRename(session.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(session.id);
                              if (e.key === 'Escape') setRenamingSessionId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 bg-transparent text-text-primary text-[13px] border-b border-accent outline-none px-0.5 py-0 min-w-0"
                          />
                        ) : (
                          <span className="truncate flex-1">{session.title}</span>
                        )}

                        {session.isPinned && !isRenaming && (
                          <span title="已置顶" className="flex items-center shrink-0">
                            <Pin size={12} className="text-accent opacity-80" />
                          </span>
                        )}
                      </div>

                      {/* Popover Menu trigger */}
                      <div className="relative shrink-0 ml-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPopoverOpenId(popoverOpenId === session.id ? null : session.id);
                          }}
                          className={`text-text-secondary hover:text-text-primary p-1 rounded hover:bg-hover-bg transition-all flex ${
                            popoverOpenId === session.id ? 'opacity-100 bg-hover-bg text-text-primary' : 'opacity-0 group-hover/row:opacity-100'
                          }`}
                          title="更多选项"
                        >
                          <MoreHorizontal size={14} />
                        </button>

                        {popoverOpenId === session.id && (
                          <div
                            ref={popoverRef}
                            className="absolute right-0 top-7 z-50 w-32 bg-white shadow-lg rounded-lg border border-border-color py-1 text-text-primary text-[12px] overflow-hidden"
                          >
                            <button
                              onClick={(e) => handleTogglePin(session.id, session.isPinned, e)}
                              className="w-full text-left px-3 py-1.5 hover:bg-hover-bg flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <Pin size={13} className={session.isPinned ? 'text-accent' : ''} />
                              <span>{session.isPinned ? '取消置顶' : '置顶'}</span>
                            </button>
                            <button
                              onClick={(e) => handleStartRename(session, e)}
                              className="w-full text-left px-3 py-1.5 hover:bg-hover-bg flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <Pen size={13} />
                              <span>重命名</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPopoverOpenId(null);
                                handleDeleteSession(session.id, e);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-hover-bg text-red-500 flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                              <span>删除</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Drag handle resize line */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 -right-[2px] w-[4px] h-full cursor-col-resize hover:bg-accent/40 active:bg-accent/80 transition-colors z-30"
        />
      </aside>
    </>
  );
}
