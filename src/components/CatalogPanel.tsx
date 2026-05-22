import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Search, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import AddContentMenu from './AddContentMenu';

export default function CatalogPanel() {
  const { kbId, docId } = useParams<{ kbId?: string; docId?: string }>();
  const navigate = useNavigate();

  const { 
    getKnowledgeBase, 
    getGroupsByKb, 
    getDocumentsByKb, 
    createDocument, 
    createGroup 
  } = useKnowledgeBaseStore();

  const kb = kbId ? getKnowledgeBase(kbId) : undefined;
  const groups = kbId ? getGroupsByKb(kbId) : [];
  const documents = kbId ? getDocumentsByKb(kbId) : [];

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  
  const menuTriggerRef = useRef<HTMLDivElement>(null);

  // Group creation confirmation handler
  const handleFinishCreateGroup = () => {
    if (!newGroupName.trim() || !kbId) {
      setIsCreatingGroup(false);
      return;
    }
    createGroup(kbId, newGroupName.trim());
    setIsCreatingGroup(false);
  };

  const handleStartCreateGroup = () => {
    if (!kbId) return;
    const count = groups.length + 1;
    const defaultName = `0${count}. 新建分组`;
    setNewGroupName(defaultName);
    setIsCreatingGroup(true);
  };

  const handleCreateDocument = () => {
    if (!kbId) return;
    const newDocId = createDocument(kbId, null, '新建文档');
    navigate(`/kb/${kbId}/doc/${newDocId}`);
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  if (!kb || !kbId) {
    return (
      <aside className="w-[220px] min-w-[220px] bg-bg-panel border-r border-border-color flex flex-col p-5 text-center text-text-secondary text-xs">
        选择一个知识库查看目录
      </aside>
    );
  }

  // Calculate back navigation path
  const backPath = docId ? `/kb/${kbId}` : '/';

  return (
    <aside className="w-[220px] min-w-[220px] bg-bg-panel border-r border-border-color flex flex-col h-full select-none">
      {/* Header */}
      <div className="p-5 pb-3 flex justify-between items-center shrink-0">
        <div 
          onClick={() => navigate(backPath)}
          className="text-[14px] font-semibold text-text-primary flex items-center gap-1.5 cursor-pointer hover:text-accent transition-colors truncate max-w-[150px]"
          title={docId ? `返回 ${kb.name}` : '返回主页'}
        >
          <ChevronLeft size={16} className="shrink-0" />
          <span className="truncate">{kb.name}</span>
        </div>
        <div className="relative" ref={menuTriggerRef}>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="text-text-secondary cursor-pointer hover:text-text-primary transition-colors p-1 hover:bg-hover-bg rounded-md flex"
          >
            <Plus size={16} />
          </button>
          
          <AddContentMenu 
            isOpen={isMenuOpen} 
            onClose={() => setIsMenuOpen(false)}
            onNewDoc={handleCreateDocument}
            onNewGroup={handleStartCreateGroup}
          />
        </div>
      </div>
      
      {/* Search Current KB */}
      <div className="mx-4 mb-3 px-2.5 py-1.5 bg-white border border-border-color rounded-md text-xs text-text-secondary flex items-center gap-1.5 shadow-sm shrink-0 cursor-text hover:border-accent transition-colors">
        <Search size={14} /> 搜索当前知识库...
      </div>

      {/* Catalog Tree Scroll Area */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {/* Render Groups and their Docs */}
        {groups.map((group) => {
          const groupDocs = documents.filter((doc) => doc.groupId === group.id);
          const isExpanded = !collapsedGroups[group.id];

          return (
            <div key={group.id} className="mb-2">
              <div 
                onClick={() => toggleGroup(group.id)}
                className="text-xs font-semibold text-text-primary p-2 mt-1.5 flex items-center justify-between hover:bg-hover-bg rounded-md cursor-pointer group transition-colors"
              >
                <div className="flex items-center gap-1.5 truncate">
                  {isExpanded ? <ChevronDown size={14} className="shrink-0 text-text-secondary" /> : <ChevronRight size={14} className="shrink-0 text-text-secondary" />}
                  <span className="truncate">{group.name}</span>
                </div>
              </div>
              
              {isExpanded && (
                <div className="space-y-0.5 mt-0.5">
                  {groupDocs.map((doc) => {
                    const isDocActive = docId === doc.id;
                    return (
                      <div
                        key={doc.id}
                        onClick={() => navigate(`/kb/${kbId}/doc/${doc.id}`)}
                        className={`text-[13px] py-1.5 px-2 pr-2 pl-6 rounded-md cursor-pointer flex items-center gap-2 transition-all ${
                          isDocActive 
                            ? 'text-accent font-semibold bg-white shadow-sm border-l-2 border-accent rounded-l-none pl-[22px]' 
                            : 'text-text-secondary hover:bg-hover-bg'
                        }`}
                      >
                        <FileText size={14} className={isDocActive ? 'text-accent' : 'text-text-secondary'} />
                        <span className="truncate">{doc.title}</span>
                      </div>
                    );
                  })}
                  {groupDocs.length === 0 && (
                    <div className="text-[11px] text-gray-400 italic py-1 px-2 pr-2 pl-6">
                      (空分组)
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Inline edit container for creating a new group */}
        {isCreatingGroup && (
          <div className="p-2 mt-2 flex items-center gap-1.5 border border-accent/40 bg-indigo-50/20 rounded-md">
            <ChevronDown size={14} className="text-accent shrink-0" />
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onBlur={handleFinishCreateGroup}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishCreateGroup();
                else if (e.key === 'Escape') setIsCreatingGroup(false);
              }}
              className="w-full text-xs font-semibold text-text-primary bg-white px-1.5 py-0.5 border border-border-color rounded outline-none focus:border-accent"
              autoFocus
              onFocus={(e) => e.target.select()}
            />
          </div>
        )}

        {/* Render Root Level Documents */}
        {documents.filter((doc) => doc.groupId === null).length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="text-[11px] font-bold text-text-secondary uppercase tracking-wider px-2 mb-1.5">
              未分组文档
            </div>
            <div className="space-y-0.5">
              {documents
                .filter((doc) => doc.groupId === null)
                .map((doc) => {
                  const isDocActive = docId === doc.id;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => navigate(`/kb/${kbId}/doc/${doc.id}`)}
                      className={`text-[13px] py-1.5 px-2 pr-2 pl-6 rounded-md cursor-pointer flex items-center gap-2 transition-all ${
                        isDocActive 
                          ? 'text-accent font-semibold bg-white shadow-sm border-l-2 border-accent rounded-l-none pl-[22px]' 
                          : 'text-text-secondary hover:bg-hover-bg'
                      }`}
                    >
                      <FileText size={14} className={isDocActive ? 'text-accent' : 'text-text-secondary'} />
                      <span className="truncate">{doc.title}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
