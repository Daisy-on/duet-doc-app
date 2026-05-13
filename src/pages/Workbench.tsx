import { FileText, FolderPlus, Copy, Sparkles, FileLineChart } from 'lucide-react';

export default function Workbench() {
  return (
    <main className="flex-1 p-10 overflow-y-auto bg-bg-main relative">
      <h1 className="text-[28px] font-bold text-text-primary mb-8">开始</h1>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <div className="bg-white border border-border-color p-5 rounded-xl cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all flex flex-col gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <FileText size={18} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary mt-1">新建文档</div>
          <div className="text-xs text-text-secondary leading-snug">从空白 Tiptap 页面开始协作</div>
        </div>
        <div className="bg-white border border-border-color p-5 rounded-xl cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all flex flex-col gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <FolderPlus size={18} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary mt-1">新建知识库</div>
          <div className="text-xs text-text-secondary leading-snug">创建基础文件夹 (RAG 准备)</div>
        </div>
        <div className="bg-white border border-border-color p-5 rounded-xl cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all flex flex-col gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
            <Copy size={18} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary mt-1">模板中心</div>
          <div className="text-xs text-text-secondary leading-snug">使用预设基础模板快速起草</div>
        </div>
        <div className="bg-slate-50 border border-indigo-200 p-5 rounded-xl cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all flex flex-col gap-2 relative overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-50 to-purple-100 text-accent flex items-center justify-center z-10">
            <Sparkles size={18} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary mt-1 z-10">AI 帮你写</div>
          <div className="text-xs text-text-secondary leading-snug z-10">输入提示词，由 AI 自动生成文档</div>
        </div>
      </div>

      {/* Doc List Section */}
      <div className="bg-white rounded-xl p-6 border border-border-color">
        {/* Tabs */}
        <div className="flex gap-6 border-b border-border-color mb-4 pb-2">
          <div className="text-sm font-semibold text-text-primary cursor-pointer relative pb-2">
            编辑过
            <div className="absolute -bottom-[9px] left-0 w-full h-[2px] bg-accent rounded-full" />
          </div>
          <div className="text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors pb-2">浏览过</div>
          <div className="text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors pb-2">邀我协作的</div>
          <div className="text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors pb-2">分享中的</div>
        </div>
        
        {/* Table */}
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="text-xs text-text-secondary font-medium py-3 px-2 border-b border-border-color w-[45%]">文档标题</th>
              <th className="text-xs text-text-secondary font-medium py-3 px-2 border-b border-border-color w-[35%]">所属知识库 / 所有者</th>
              <th className="text-xs text-text-secondary font-medium py-3 px-2 border-b border-border-color w-[20%]">最后修改时间</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-gray-50 cursor-pointer group transition-colors">
              <td className="py-3.5 px-2 border-b border-hover-bg">
                <div className="flex items-center gap-2.5 font-medium text-sm text-text-primary">
                  <div className="w-[18px] h-[18px] bg-gray-100 rounded flex items-center justify-center text-gray-400"><FileLineChart size={12}/></div> 共振酒吧 (Resonance Bar) - 视觉素材与海报排版
                </div>
              </td>
              <td className="py-3.5 px-2 border-b border-hover-bg text-sm text-text-primary">个人灵感收集 / 管理员</td>
              <td className="py-3.5 px-2 border-b border-hover-bg text-sm text-text-primary">今天 10:42</td>
            </tr>
            <tr className="hover:bg-gray-50 cursor-pointer transition-colors">
              <td className="py-3.5 px-2 border-b border-hover-bg">
                <div className="flex items-center gap-2.5 font-medium text-sm text-text-primary">
                  <div className="w-[18px] h-[18px] bg-gray-100 rounded flex items-center justify-center text-gray-400"><FileLineChart size={12}/></div> 智能批改模块 - PRD需求文档与 AI Prompt 联调记录
                </div>
              </td>
              <td className="py-3.5 px-2 border-b border-hover-bg text-sm text-text-primary">核心产品规划 / 管理员</td>
              <td className="py-3.5 px-2 border-b border-hover-bg text-sm text-text-primary">今天 09:18</td>
            </tr>
            <tr className="hover:bg-gray-50 cursor-pointer transition-colors">
              <td className="py-3.5 px-2 border-b border-hover-bg">
                <div className="flex items-center gap-2.5 font-medium text-sm text-text-primary">
                  <div className="w-[18px] h-[18px] bg-gray-100 rounded flex items-center justify-center text-gray-400"><FileLineChart size={12}/></div> 学生实验模块 - 前后端交互与数据流转架构设计
                </div>
              </td>
              <td className="py-3.5 px-2 border-b border-hover-bg text-sm text-text-primary">研发架构库 / 管理员</td>
              <td className="py-3.5 px-2 border-b border-hover-bg text-sm text-text-primary">昨天 18:56</td>
            </tr>
            <tr className="hover:bg-gray-50 cursor-pointer transition-colors">
              <td className="py-3.5 px-2 border-b border-hover-bg">
                <div className="flex items-center gap-2.5 font-medium text-sm text-text-primary">
                  <div className="w-[18px] h-[18px] bg-gray-100 rounded flex items-center justify-center text-gray-400"><FileLineChart size={12}/></div> 课程知识库模块 - 数据表结构定义 (V1.2)
                </div>
              </td>
              <td className="py-3.5 px-2 border-b border-hover-bg text-sm text-text-primary">研发架构库 / 管理员</td>
              <td className="py-3.5 px-2 border-b border-hover-bg text-sm text-text-primary">昨天 15:32</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
