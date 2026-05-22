import { useParams, useNavigate } from 'react-router-dom';
import { FileText, FolderPlus, Folder, Calendar, BookOpen, User } from 'lucide-react';
import CatalogPanel from '../components/CatalogPanel';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';

// Helper to format date relative to today/yesterday or absolute
function formatRelativeTime(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  
  const isToday = now.toDateString() === date.toDateString();
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = yesterday.toDateString() === date.toDateString();
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  if (isToday) {
    return `今天 ${hours}:${minutes}`;
  } else if (isYesterday) {
    return `昨天 ${hours}:${minutes}`;
  } else {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hours}:${minutes}`;
  }
}

export default function KnowledgeBaseHome() {
  const { kbId } = useParams<{ kbId: string }>();
  const navigate = useNavigate();
  const { getKnowledgeBase, getDocumentsByKb, getGroupsByKb, createDocument } = useKnowledgeBaseStore();

  const kb = kbId ? getKnowledgeBase(kbId) : undefined;
  
  if (!kb || !kbId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main">
        <div className="text-center">
          <h2 className="text-lg font-bold text-text-primary mb-2">知识库不存在</h2>
          <button 
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-accent hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            返回开始页
          </button>
        </div>
      </div>
    );
  }

  const docs = getDocumentsByKb(kbId);
  const groups = getGroupsByKb(kbId);

  const handleCreateDocument = () => {
    // Create new document in this KB (at root level by default)
    const newDocId = createDocument(kbId, null, '新建文档');
    navigate(`/kb/${kbId}/doc/${newDocId}`);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sidebar catalog panel specific to this KB */}
      <CatalogPanel />

      {/* Main content view */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-main overflow-y-auto">
        {/* Top Header Bar */}
        <header className="h-[60px] border-b border-border-color flex justify-between items-center px-8 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div 
              className="w-4 h-4 rounded-md shadow-sm"
              style={{ backgroundColor: kb.icon }}
            />
            <div className="text-[15px] font-semibold text-text-primary">{kb.name}</div>
            <div className="text-[11px] text-text-secondary bg-gray-50 border border-border-color px-2 py-0.5 rounded-full">
              共 {docs.length} 篇文档
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateDocument}
              className="px-4 py-1.5 bg-accent hover:bg-indigo-700 text-white rounded-lg text-[13px] font-semibold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <FileText size={14} />
              <span>新建文档</span>
            </button>
          </div>
        </header>

        {/* KB Details Banner */}
        <div className="px-10 py-8 border-b border-border-color bg-white">
          <div className="max-w-4xl mx-auto flex items-start gap-6">
            <div 
              className="w-16 h-16 rounded-xl flex items-center justify-center text-white shadow-md shrink-0"
              style={{ backgroundColor: kb.icon }}
            >
              <Folder size={32} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[26px] font-bold text-text-primary mb-2 flex items-center gap-3">
                {kb.name}
              </h1>
              <p className="text-[14px] text-text-secondary leading-relaxed mb-4">
                {kb.description || '暂无简介。你可以点击编辑知识库来添加描述。'}
              </p>
              <div className="flex flex-wrap gap-5 text-xs text-text-secondary font-medium">
                <span className="flex items-center gap-1.5">
                  <BookOpen size={14} /> {docs.length} 篇文档
                </span>
                <span className="flex items-center gap-1.5">
                  <FolderPlus size={14} /> {groups.length} 个分组
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} /> 创建于 {new Date(kb.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Documents Section */}
        <div className="p-10 flex-1 bg-bg-main">
          <div className="max-w-4xl mx-auto">
            {docs.length === 0 ? (
              /* Empty State */
              <div className="bg-white border border-border-color rounded-2xl p-16 text-center shadow-sm flex flex-col items-center">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4 text-white opacity-90 shadow-inner"
                  style={{ backgroundColor: kb.icon }}
                >
                  <FolderOpen size={28} />
                </div>
                <h3 className="text-base font-bold text-text-primary mb-2">知识库空空如也</h3>
                <p className="text-xs text-text-secondary mb-6 max-w-sm leading-relaxed">
                  该知识库下暂无任何文档。立即创建第一篇文档，开始记录你的想法、架构和规划吧！
                </p>
                <button
                  onClick={handleCreateDocument}
                  className="px-5 py-2.5 bg-accent hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-2"
                >
                  <FileText size={16} />
                  <span>新建文档</span>
                </button>
              </div>
            ) : (
              /* Table list of documents */
              <div className="bg-white rounded-xl border border-border-color shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border-color bg-gray-50/50">
                  <h3 className="text-sm font-semibold text-text-primary">文档列表</h3>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-color">
                      <th className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider py-3 px-6 w-[45%]">文档标题</th>
                      <th className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider py-3 px-6 w-[30%]">所属分组</th>
                      <th className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider py-3 px-6 w-[25%]">更新时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc) => {
                      const group = groups.find((g) => g.id === doc.groupId);
                      return (
                        <tr 
                          key={doc.id}
                          onClick={() => navigate(`/kb/${kbId}/doc/${doc.id}`)}
                          className="hover:bg-gray-50/70 border-b border-border-color last:border-0 cursor-pointer transition-colors"
                        >
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3 font-semibold text-[14px] text-text-primary">
                              <div className="w-[22px] h-[22px] bg-gray-100 rounded-md flex items-center justify-center text-text-secondary">
                                <FileText size={13} />
                              </div>
                              <span className="hover:text-accent transition-colors truncate max-w-sm">
                                {doc.title}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-[13px] text-text-secondary">
                            {group ? (
                              <span className="bg-indigo-50/80 text-accent border border-indigo-100 px-2 py-0.5 rounded-md font-medium">
                                {group.name.replace(/^\d+\.\s*/, '')}
                              </span>
                            ) : (
                              <span className="text-gray-400">无分组</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-[13px] text-text-secondary flex items-center gap-1.5 mt-0.5">
                            <User size={13} className="text-gray-300" />
                            <span>管理员 · {formatRelativeTime(doc.updatedAt)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// Simple placeholder icon wrapper for empty state
function FolderOpen({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-folder-open">
      <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
