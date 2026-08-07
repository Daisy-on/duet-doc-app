import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  FolderPlus,
  Folder,
  Calendar,
  BookOpen,
  User,
  ChevronRight,
  Plus,
  PanelLeft,
} from 'lucide-react';
import CatalogPanel from '../components/CatalogPanel';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import { useLayoutStore } from '../store';

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
  return <KnowledgeBaseHomeContent key={kbId || 'empty'} kbId={kbId} />;
}

function KnowledgeBaseHomeContent({ kbId }: { kbId?: string }) {
  const navigate = useNavigate();

  const groups = useKnowledgeBaseStore((state) => state.groups);
  const documents = useKnowledgeBaseStore((state) => state.documents);
  const { getKnowledgeBase, createDocument, getChildGroups, getGroupAncestors } =
    useKnowledgeBaseStore();

  const { isCatalogCollapsed, setIsCatalogCollapsed } = useLayoutStore();

  const kb = kbId ? getKnowledgeBase(kbId) : undefined;

  // Track currently selected sub-group for this KB instance
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);

  // Validate currentGroupId in case the group was deleted via CatalogPanel
  const activeGroupId =
    currentGroupId && groups.some((g) => g.id === currentGroupId) ? currentGroupId : null;

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

  const allDocs = documents.filter((d) => d.kbId === kbId);
  const allGroups = groups.filter((g) => g.kbId === kbId).sort((a, b) => a.order - b.order);

  // Filter groups and docs for current layer
  const currentSubGroups = getChildGroups(activeGroupId, kbId);
  const currentDocs = allDocs.filter((doc) => doc.groupId === activeGroupId);
  const currentGroup = activeGroupId ? allGroups.find((g) => g.id === activeGroupId) : null;
  const ancestors = activeGroupId ? getGroupAncestors(activeGroupId) : [];

  const handleCreateDocument = () => {
    // Create new document in this KB inside current group layer
    const newDocId = createDocument(kbId, activeGroupId, '新建文档');
    navigate(`/kb/${kbId}/doc/${newDocId}`);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sidebar catalog panel specific to this KB */}
      <CatalogPanel />

      {/* Main content view */}
      <main
        className="flex-1 flex flex-col min-w-0 bg-bg-main overflow-y-auto"
        style={{ scrollbarGutter: 'stable' }}
      >
        {/* Top Header Bar */}
        <header className="h-[60px] border-b border-border-color flex justify-between items-center px-8 shrink-0 bg-white">
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              onClick={() => setIsCatalogCollapsed(!isCatalogCollapsed)}
              className="text-text-secondary hover:text-text-primary hover:bg-hover-bg p-1.5 rounded-lg border border-border-color/60 bg-white shadow-sm flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title={isCatalogCollapsed ? '展开' : '折叠'}
            >
              <PanelLeft size={16} />
            </button>
            <div className="flex items-center gap-3 ml-1 min-w-0">
              <div
                className="w-4 h-4 rounded-md shadow-sm shrink-0"
                style={{ backgroundColor: kb.icon }}
              />
              <div className="text-[15px] font-semibold text-text-primary truncate">{kb.name}</div>
              <div className="text-[11px] text-text-secondary bg-gray-50 border border-border-color px-2 py-0.5 rounded-full font-medium shrink-0">
                共 {allDocs.length} 篇文档
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateDocument}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-[13px] font-semibold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <FileText size={14} />
              <span>新建文档</span>
            </button>
          </div>
        </header>

        {/* Details Banner */}
        <div className="px-10 py-10 border-b border-border-color bg-white shrink-0">
          <div className="max-w-4xl mx-auto flex items-start gap-6">
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center text-white shadow-md shrink-0 transition-transform duration-300 hover:scale-105"
              style={{ backgroundColor: kb.icon }}
            >
              <Folder size={32} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[26px] font-bold text-text-primary mb-2 flex items-center gap-3">
                {currentGroup ? currentGroup.name : kb.name}
              </h1>
              <p className="text-[14px] text-text-secondary leading-relaxed mb-4">
                {currentGroup
                  ? `当前在 “${currentGroup.name}” 分组下，可查看其子级分组及归属文档。`
                  : kb.description || '暂无简介。你可以点击编辑知识库来添加描述。'}
              </p>
              <div className="flex flex-wrap gap-5 text-xs text-text-secondary font-medium">
                <span className="flex items-center gap-1.5">
                  <BookOpen size={14} /> {currentGroup ? currentDocs.length : allDocs.length} 篇文档
                </span>
                <span className="flex items-center gap-1.5">
                  <FolderPlus size={14} />{' '}
                  {currentGroup ? currentSubGroups.length : getChildGroups(null, kbId).length}{' '}
                  个子分组
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />{' '}
                  {currentGroup
                    ? '创建于 ' + new Date(currentGroup.createdAt).toLocaleDateString()
                    : '创建于 ' + new Date(kb.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Catalog Main Content List Area */}
        <div className="p-6 flex-1 bg-bg-main">
          <div className="max-w-4xl mx-auto">
            {/* Integrated Breadcrumb Header */}
            <div className="flex items-center justify-between mb-4 pb-5 border-b border-border-color/60">
              <div className="flex items-center gap-1 text-[13px] font-medium text-text-secondary select-none overflow-x-auto">
                <div
                  onClick={() => setCurrentGroupId(null)}
                  className={`flex items-center gap-1.5 transition-all px-2.5 py-1.5 rounded-lg ${
                    !activeGroupId
                      ? 'text-accent bg-indigo-50 border border-indigo-100/50 shadow-sm'
                      : 'hover:text-accent cursor-pointer hover:bg-gray-200/50'
                  }`}
                >
                  <Folder size={14} className={!activeGroupId ? 'text-accent' : ''} />
                  <span className={!activeGroupId ? 'font-bold' : ''}>{kb.name}</span>
                </div>

                {ancestors.map((ancestor, index) => {
                  const isLast = index === ancestors.length - 1;
                  return (
                    <React.Fragment key={ancestor.id}>
                      <ChevronRight size={14} className="text-gray-300 mx-0.5 shrink-0" />
                      <div
                        onClick={!isLast ? () => setCurrentGroupId(ancestor.id) : undefined}
                        className={`flex items-center gap-1.5 transition-all px-2.5 py-1.5 rounded-lg ${
                          isLast
                            ? 'text-accent bg-indigo-50 border border-indigo-100/50 shadow-sm'
                            : 'hover:text-accent cursor-pointer hover:bg-gray-200/50'
                        }`}
                      >
                        <span className={`truncate max-w-[150px] ${isLast ? 'font-bold' : ''}`}>
                          {ancestor.name}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
              <div className="text-[11px] font-semibold text-text-secondary/70 uppercase tracking-wider bg-white border border-border-color/60 px-2 py-1 rounded-md shadow-sm shrink-0">
                当前路径
              </div>
            </div>

            {/* Sub-groups Grid */}
            {currentSubGroups.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 pl-1">
                  子分组 ({currentSubGroups.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {currentSubGroups.map((group) => {
                    const directDocsCount = allDocs.filter((d) => d.groupId === group.id).length;
                    const directSubGroupsCount = allGroups.filter(
                      (g) => g.parentGroupId === group.id,
                    ).length;

                    return (
                      <div
                        key={group.id}
                        onClick={() => setCurrentGroupId(group.id)}
                        className="bg-white border border-border-color rounded-xl p-4 cursor-pointer hover:shadow-md hover:border-accent hover:-translate-y-0.5 transition-all duration-200 group flex items-start gap-3.5"
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform"
                          style={{ backgroundColor: `${kb.icon}20`, color: kb.icon }}
                        >
                          <Folder size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-[13px] font-bold text-text-primary group-hover:text-accent transition-colors truncate mb-1"
                            title={group.name}
                          >
                            {group.name}
                          </div>
                          <div className="text-[11px] text-text-secondary font-medium">
                            {directSubGroupsCount > 0 ? `${directSubGroupsCount} 个分组 · ` : ''}
                            {directDocsCount} 篇文档
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Documents Section */}
            {currentSubGroups.length === 0 && currentDocs.length === 0 ? (
              /* Empty State */
              <div className="bg-white border border-border-color rounded-2xl p-16 text-center shadow-sm flex flex-col items-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4 text-white opacity-90 shadow-inner"
                  style={{ backgroundColor: kb.icon }}
                >
                  <FolderOpen size={28} />
                </div>
                <h3 className="text-base font-bold text-text-primary mb-2">当前目录空空如也</h3>
                <p className="text-xs text-text-secondary mb-6 max-w-sm leading-relaxed">
                  此目录下暂无任何子分组或文档。立即创建第一篇文档，开始记录吧！
                </p>
                <button
                  onClick={handleCreateDocument}
                  className="px-5 py-2.5 bg-accent hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-2"
                >
                  <FileText size={16} />
                  <span>新建文档</span>
                </button>
              </div>
            ) : currentDocs.length > 0 ? (
              /* Table list of documents */
              <div className="bg-white rounded-xl border border-border-color shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border-color bg-gray-50/50 flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-text-primary">文档列表</h3>
                  {currentGroupId && (
                    <button
                      onClick={handleCreateDocument}
                      className="text-xs font-semibold text-accent hover:text-indigo-700 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus size={14} /> 在此目录下新建文档
                    </button>
                  )}
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-color">
                      <th className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider py-3 px-6 w-[45%]">
                        文档标题
                      </th>
                      <th className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider py-3 px-6 w-[30%]">
                        所属分组
                      </th>
                      <th className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider py-3 px-6 w-[25%]">
                        更新时间
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentDocs.map((doc) => {
                      const group = allGroups.find((g) => g.id === doc.groupId);
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
            ) : (
              /* No direct docs, but there are sub-groups */
              <div className="bg-white rounded-xl border border-border-color border-dashed p-8 text-center text-text-secondary text-xs">
                当前目录下暂无直属文档。你可以点击
                <span
                  onClick={handleCreateDocument}
                  className="text-accent font-semibold cursor-pointer hover:underline mx-1"
                >
                  新建文档
                </span>
                在此分组中创建新文章。
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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-folder-open"
    >
      <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
