import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, FolderPlus, Copy, Sparkles, FileLineChart } from 'lucide-react';
import { useKnowledgeBaseStore } from '../store/knowledgeBaseStore';
import CreateKnowledgeBaseModal from '../components/modals/CreateKnowledgeBaseModal';
import CreateDocModal from '../components/modals/CreateDocModal';

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

export default function Workbench() {
  const navigate = useNavigate();
  const { documents, knowledgeBases } = useKnowledgeBaseStore();

  const [isKBModalOpen, setIsKBModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);

  // Sort documents by last modified time (updatedAt) descending
  const recentDocs = [...documents].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <main className="flex-1 p-10 overflow-y-auto bg-bg-main relative">
      <h1 className="text-[28px] font-bold text-text-primary mb-8">开始</h1>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-4 mb-10 select-none">
        {/* New Document Card */}
        <div
          onClick={() => setIsDocModalOpen(true)}
          className="bg-white border border-border-color p-5 rounded-xl cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all flex flex-col gap-2 group"
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
            <FileText size={18} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary mt-1">新建文档</div>
          <div className="text-xs text-text-secondary leading-snug">
            在已有知识库中快速添加新文档
          </div>
        </div>

        {/* New Knowledge Base Card */}
        <div
          onClick={() => setIsKBModalOpen(true)}
          className="bg-white border border-border-color p-5 rounded-xl cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all flex flex-col gap-2 group"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
            <FolderPlus size={18} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary mt-1">新建知识库</div>
          <div className="text-xs text-text-secondary leading-snug">创建基础文件夹 (RAG 准备)</div>
        </div>

        {/* Templates Card (Static placeholder / soon tooltip) */}
        <div
          className="bg-white border border-border-color p-5 rounded-xl opacity-60 flex flex-col gap-2 relative group cursor-not-allowed select-none"
          title="模板中心即将上线"
        >
          <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
            <Copy size={18} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary mt-1 flex items-center gap-1.5">
            <span>模板中心</span>
            <span className="text-[9px] bg-orange-50 text-orange-600 border border-orange-200 px-1 py-0.5 rounded font-bold">
              即将上线
            </span>
          </div>
          <div className="text-xs text-text-secondary leading-snug">使用预设基础模板快速起草</div>
        </div>

        {/* AI Writer Card (Static placeholder / soon tooltip) */}
        <div
          className="bg-white border border-border-color p-5 rounded-xl opacity-60 flex flex-col gap-2 relative group cursor-not-allowed select-none"
          title="AI 自动生成文档即将上线"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-text-secondary flex items-center justify-center">
            <Sparkles size={18} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary mt-1 flex items-center gap-1.5">
            <span>AI 帮你写</span>
            <span className="text-[9px] bg-gray-100 text-gray-600 border border-gray-200 px-1 py-0.5 rounded font-bold">
              即将上线
            </span>
          </div>
          <div className="text-xs text-text-secondary leading-snug">
            输入提示词，由 AI 自动生成文档
          </div>
        </div>
      </div>

      {/* Doc List Section */}
      <div className="bg-white rounded-xl p-6 border border-border-color shadow-sm">
        {/* Tabs */}
        <div className="flex gap-6 border-b border-border-color mb-4 pb-2">
          <div className="text-sm font-semibold text-text-primary cursor-pointer relative pb-2 select-none">
            编辑过
            <div className="absolute -bottom-[9px] left-0 w-full h-[2px] bg-accent rounded-full" />
          </div>
          <div className="text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors pb-2 select-none">
            浏览过
          </div>
          <div className="text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors pb-2 select-none">
            邀我协作的
          </div>
          <div className="text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors pb-2 select-none">
            分享中的
          </div>
        </div>

        {/* Table */}
        {recentDocs.length === 0 ? (
          <div className="text-center py-12 text-xs text-text-secondary">
            暂无编辑记录，创建一个知识库并编写文档吧！
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-color">
                <th className="text-xs text-text-secondary font-medium py-3 px-2 w-[45%]">
                  文档标题
                </th>
                <th className="text-xs text-text-secondary font-medium py-3 px-2 w-[35%]">
                  所属知识库 / 所有者
                </th>
                <th className="text-xs text-text-secondary font-medium py-3 px-2 w-[20%]">
                  最后修改时间
                </th>
              </tr>
            </thead>
            <tbody>
              {recentDocs.map((doc) => {
                const kb = knowledgeBases.find((k) => k.id === doc.kbId);
                const kbName = kb ? kb.name : '未知知识库';

                return (
                  <tr
                    key={doc.id}
                    onClick={() => navigate(`/kb/${doc.kbId}/doc/${doc.id}`)}
                    className="hover:bg-gray-50/75 cursor-pointer group border-b border-gray-50 transition-colors"
                  >
                    <td className="py-3.5 px-2">
                      <div className="flex items-center gap-2.5 font-semibold text-[13.5px] text-text-primary group-hover:text-accent transition-colors">
                        <div className="w-[20px] h-[20px] bg-gray-100 rounded flex items-center justify-center text-text-secondary group-hover:bg-indigo-50 group-hover:text-accent transition-colors">
                          <FileLineChart size={12} />
                        </div>
                        <span className="truncate max-w-md">{doc.title}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-2 text-sm text-text-secondary">{kbName} / 管理员</td>
                    <td className="py-3.5 px-2 text-sm text-text-secondary">
                      {formatRelativeTime(doc.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create KB Modal */}
      <CreateKnowledgeBaseModal isOpen={isKBModalOpen} onClose={() => setIsKBModalOpen(false)} />

      {/* Create Doc Modal */}
      {isDocModalOpen && (
        <CreateDocModal
          isOpen={isDocModalOpen}
          onClose={() => setIsDocModalOpen(false)}
          onCreateKBClick={() => setIsKBModalOpen(true)}
        />
      )}
    </main>
  );
}
