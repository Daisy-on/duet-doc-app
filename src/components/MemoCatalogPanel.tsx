import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Plus, Search, FileText, MoreHorizontal } from 'lucide-react';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import type { Document } from '../store/knowledgeBaseStore';
import MemoActionMenu from './menus/MemoActionMenu';
import ConfirmDeleteModal from './modals/ConfirmDeleteModal';
import MoveToKBModal from './modals/MoveToKBModal';

export default function MemoCatalogPanel() {
  const navigate = useNavigate();
  const { memoId } = useParams<{ memoId?: string }>();
  
  const { 
    getMemos, createMemo, updateDocument, 
    deleteDocument, moveDocument, catalogWidth, isCatalogCollapsed, 
    setCatalogWidth, setIsCatalogCollapsed 
  } = useKnowledgeBaseStore();

  const memos = getMemos();

  // Selection states
  const [searchQuery, setSearchQuery] = useState('');
  
  // Renaming state
  const [renamingMemoId, setRenamingMemoId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState('');

  // Menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);

  // Modals state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [selectedMemo, setSelectedMemo] = useState<Document | null>(null);

  const handleCreateMemo = () => {
    const newId = createMemo('未命名小记');
    navigate(`/memo/${newId}`);
  };

  const handleFinishRename = () => {
    if (renamingMemoId && renamingTitle.trim()) {
      updateDocument(renamingMemoId, { title: renamingTitle.trim() });
    }
    setRenamingMemoId(null);
  };

  const handleCancelRename = () => {
    setRenamingMemoId(null);
  };

  const handleConfirmDelete = () => {
    if (selectedMemo) {
      deleteDocument(selectedMemo.id);
      setIsDeleteModalOpen(false);
      if (memoId === selectedMemo.id) {
        navigate('/memo');
      }
      setSelectedMemo(null);
    }
  };

  const handleConfirmMove = (targetKbId: string, targetGroupId: string | null) => {
    if (selectedMemo) {
      // 1. Execute move
      moveDocument(selectedMemo.id, targetKbId, targetGroupId);
      
      // 2. Clear state
      setIsMoveModalOpen(false);
      
      // 3. Navigate user to the document's new location in KB
      navigate(`/kb/${targetKbId}/doc/${selectedMemo.id}`);
      setSelectedMemo(null);
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

  const filteredMemos = searchQuery.trim()
    ? memos.filter((m) => m.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : memos;

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
              <div
                onClick={() => navigate('/')}
                className="text-[14px] font-semibold text-text-primary flex items-center gap-1.5 cursor-pointer hover:text-accent transition-colors truncate max-w-[150px]"
                title="返回主页"
              >
                <ChevronLeft size={16} className="shrink-0" />
                <span>小记列表</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsCatalogCollapsed(true)}
                  className="text-text-secondary cursor-pointer hover:text-text-primary transition-colors p-1 hover:bg-hover-bg rounded-md flex"
                  title="收起小记树"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={handleCreateMemo}
                  className="text-text-secondary cursor-pointer hover:text-text-primary transition-colors p-1 hover:bg-hover-bg rounded-md flex"
                  title="新建小记"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

          {/* Search Box */}
          <div className="mx-4 mb-3 px-2.5 py-1.5 bg-white border border-border-color focus-within:border-accent rounded-md text-xs text-text-secondary flex items-center gap-1.5 shadow-sm shrink-0">
            <Search size={14} className="shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索小记标题..."
              className="w-full bg-transparent outline-none text-xs text-text-primary border-none p-0"
            />
          </div>

          {/* Scroll List */}
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
            {filteredMemos.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-secondary">
                {searchQuery.trim() ? '没有找到相关小记' : '暂无小记，点击上方 + 新建'}
              </div>
            ) : (
              filteredMemos.map((memo) => {
                const isActive = memo.id === memoId;
                const isRenaming = renamingMemoId === memo.id;

                return (
                  <div
                    key={memo.id}
                    onClick={() => {
                      if (!isRenaming) {
                        navigate(`/memo/${memo.id}`);
                      }
                    }}
                    className={`text-[13px] py-1.5 px-3 rounded-md cursor-pointer flex items-center justify-between group/row hover:bg-hover-bg transition-all ${
                      isActive
                        ? 'text-accent font-semibold bg-white shadow-sm border-l-2 border-accent rounded-l-none pl-[10px]'
                        : 'text-text-secondary'
                    } ${activeMenuId === memo.id ? 'bg-hover-bg' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText size={14} className={isActive ? 'text-accent shrink-0' : 'text-text-secondary shrink-0'} />
                      {isRenaming ? (
                        <input
                          type="text"
                          value={renamingTitle}
                          onChange={(e) => setRenamingTitle(e.target.value)}
                          onBlur={handleFinishRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleFinishRename();
                            else if (e.key === 'Escape') handleCancelRename();
                          }}
                          className="w-full text-xs font-semibold text-text-primary bg-white px-1.5 py-0.5 border border-border-color rounded outline-none focus:border-accent"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onFocus={(e) => e.target.select()}
                        />
                      ) : (
                        <span className="truncate">{memo.title}</span>
                      )}
                    </div>

                    {/* Dot menu on hover */}
                    {!isRenaming && (
                      <div className="flex items-center opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 ml-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            setSelectedMemo(memo);
                            setActiveMenuId(activeMenuId === memo.id ? null : memo.id);
                            setMenuAnchorEl(activeMenuId === memo.id ? null : e.currentTarget);
                          }}
                          className="text-text-secondary hover:text-text-primary hover:bg-black/5 p-1 rounded transition-colors flex"
                          title="更多操作"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      </div>
                    )}
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

      {/* Floating Action Menu */}
      <MemoActionMenu
        isOpen={activeMenuId !== null}
        onClose={() => {
          setActiveMenuId(null);
          setMenuAnchorEl(null);
        }}
        onRename={() => {
          if (selectedMemo) {
            setRenamingMemoId(selectedMemo.id);
            setRenamingTitle(selectedMemo.title);
          }
        }}
        onDelete={() => {
          setIsDeleteModalOpen(true);
        }}
        onMove={() => {
          setIsMoveModalOpen(true);
        }}
        anchorEl={menuAnchorEl}
      />

      {/* Delete confirmation modal */}
      <ConfirmDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedMemo(null);
        }}
        onConfirm={handleConfirmDelete}
        title="确认删除小记"
        description={
          selectedMemo ? (
            <span>
              此操作将永久删除小记
              <strong className="text-text-primary mx-1">“{selectedMemo.title}”</strong>
              。该操作不可撤销，是否确认删除？
            </span>
          ) : (
            ''
          )
        }
      />

      {/* Move Document Modal */}
      {selectedMemo && (
        <MoveToKBModal
          isOpen={isMoveModalOpen}
          onClose={() => {
            setIsMoveModalOpen(false);
            setSelectedMemo(null);
          }}
          documentId={selectedMemo.id}
          documentTitle={selectedMemo.title}
          onConfirm={handleConfirmMove}
        />
      )}
    </>
  );
}
