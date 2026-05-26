import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, MessageSquare, Sparkles } from 'lucide-react';
import { useAIWritingStore } from '../store/aiWritingStore';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';

export default function AIChatListPanel() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const { sessions, createSession, deleteSession, activeSessionId, setActiveSessionId } = useAIWritingStore();
  const { catalogWidth, isCatalogCollapsed, setCatalogWidth, setIsCatalogCollapsed } = useKnowledgeBaseStore();

  const handleCreateSession = () => {
    const newId = createSession();
    navigate(`/ai-writing/${newId}`);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession(id);
    // If the active session is deleted, navigate to the new active one or default page
    if (sessionId === id) {
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length > 0) {
        navigate(`/ai-writing/${remaining[0].id}`);
      } else {
        navigate('/ai-writing');
      }
    }
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
                const isActive = session.id === sessionId || (session.id === activeSessionId && !sessionId);
                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      setActiveSessionId(session.id);
                      navigate(`/ai-writing/${session.id}`);
                    }}
                    className={`text-[13px] py-2 px-3 rounded-md cursor-pointer flex items-center justify-between group/row hover:bg-hover-bg transition-all ${
                      isActive
                        ? 'text-accent font-semibold bg-white shadow-sm border-l-2 border-accent rounded-l-none pl-[14px]'
                        : 'text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <MessageSquare size={14} className={isActive ? 'text-accent shrink-0' : 'text-text-secondary shrink-0'} />
                      <span className="truncate">{session.title}</span>
                    </div>

                    <button
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className="text-text-secondary hover:text-red-500 opacity-0 group-hover/row:opacity-100 p-0.5 rounded transition-all shrink-0 ml-1.5 flex"
                      title="删除对话"
                    >
                      <Trash2 size={12} />
                    </button>
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
