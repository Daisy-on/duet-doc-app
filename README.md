# DuetDoc (前端)

DuetDoc 是一个智能协作文档编辑器，采用了创新的 **“端云分治”** AI 架构。端侧（浏览器）利用 WebGPU 加载量化模型实现极速响应的行内幽灵文本补全（Ghost Text）；云端通过 FastAPI 接入云端大模型，处理多轮对话、长文本重写等高复杂度生成任务。

> **注意**: 本仓库为 DuetDoc 的前端部分，构建在 React + Vite + TypeScript 基础之上。后端项目代码位于 `../duet-doc-backend` 目录中。

## 📦 架构概览

- **前端框架**: React 19, Vite, Tailwind CSS, Zustand
- **编辑器**: Tiptap (集成自定义 Ghost Text 扩展)
- **本地持久化**: IndexedDB (基于 Dexie.js 存储文档与多轮 AI 会话)
- **端侧模型驱动**: ONNX Runtime WebGPU (通过 Worker 线程异步推理)
- **云端服务网关**: FastAPI (`http://127.0.0.1:8000`) 接入 DeepSeek 云端大模型，采用 Server-Sent Events (SSE) 实现流式交互

## 🚀 快速开始

### 1. 准备环境
- **Node.js**: v18+ (推荐 v20)
- **浏览器**: 支持 WebGPU 的现代浏览器 (推荐 Chrome 113+ 或 Edge 113+)
- **显卡**: 推荐使用配备独立显卡的设备以保障端侧打字补全体验，若使用集成显卡，生成速度会相对降低。

### 2. 依赖安装
在前端项目根目录下执行：
```bash
npm install
```

### 3. 配置环境变量
复制根目录下的 `.env.example` 为 `.env.local`：
```bash
cp .env.example .env.local
```
确保 `.env.local` 里的 `VITE_API_BASE_URL` 指向您的本地或远程后端地址（默认 `http://127.0.0.1:8000`）。
> **🚨 安全警告**: `VITE_API_BASE_URL` 会暴露在前端代码中。但是 **API Key (如 DeepSeek API Key) 绝对不能写入前端**。所有的云端模型鉴权请在后端仓库进行配置！

### 4. 手动下载端侧模型权重
出于体积考虑，端侧使用的量化模型已被 `.gitignore` 忽略，无法通过 Git 克隆获取。您需要手动下载模型（如 `Qwen2.5-0.5B-Instruct-ONNX`）并放置在项目的 `public` 目录下。

**预期的目录结构**:
```
duet-doc-app/
  ├─ public/
  │  ├─ ai-models/
  │  │  └─ qwen2.5-0.5b-instruct-q4f16/   <-- 在此处放置下载的 ONNX 模型文件夹
  │  │      ├─ model.onnx
  │  │      ├─ tokenizer.json
  │  │      └─ ...
  ...
```

### 5. 启动前后端服务
**启动后端**: (请先参考后端仓库 README 完成依赖安装)
```bash
cd ../duet-doc-backend
uvicorn app.main:app --reload --port 8000
```
*(默认端口: 8000)*

**启动前端**:
```bash
# 在 duet-doc-app 目录下
npm run dev
```
*(默认端口: 5173)*

在浏览器中访问 `http://localhost:5173` 即可体验。

### 6. 生产环境构建
```bash
npm run build
```
执行后会在 `dist` 目录下生成静态文件，可部署至 Nginx、Vercel 或其他静态托管服务。由于打包包含了 ONNX WASM 运行时，产物较大，建议配置服务器的 Gzip 或 Brotli 压缩。

---

## ❓ 常见问题 (FAQ)

**Q: 控制台报错 `Model not found` 或者幽灵文本不生效？**  
A: 请检查是否已经将下载好的模型文件放置到了正确的 `public/ai-models/...` 路径，并确保路径拼写与代码 (如 `aiClient.ts` 中的 `GHOST_TEXT_MODEL_PATH`) 保持一致。

**Q: 浏览器提示 `WebGPU is not available`？**  
A: 当前设备/浏览器不支持 WebGPU，或者被系统拉黑。请使用最新版的 Chrome，并在 `chrome://flags` 中确认 `Unsafe WebGPU` 选项的状态（必要时可强制开启）。

**Q: AI 写作页面一直显示“未连接”？**  
A: 请检查后端服务是否已成功启动并在 `8000` 端口监听，同时确保前端的 `.env.local` 中的 `VITE_API_BASE_URL` 配置正确且无跨域 (CORS) 拦截。
