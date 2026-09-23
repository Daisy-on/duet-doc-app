# DuetDoc 前端

DuetDoc 是一个本地优先的 AI 文档编辑器。正文编辑、本地历史版本、图片 Blob、端侧检索索引和待同步队列保存在浏览器 IndexedDB；登录后可将知识库、分组、文档、聊天记录及正文引用的图片同步到云端。

前端采用“端云协作”的 AI 架构：

- 浏览器通过 WebGPU 运行 Qwen3.5 0.8B，提供行内幽灵文本。
- 浏览器通过 BGE Large Zh v1.5 FP16 生成 1024 维向量，完成本地语义检索。
- FastAPI 代理云端大模型请求，通过 SSE 返回聊天与写作结果。
- 端侧模型不随前端构建产物发布，登录用户可在个人菜单中按需下载到 Cache Storage。

项目后端另见 `../duet-doc-backend`。

## 当前能力

- Tiptap 富文本编辑、知识库与多级分组、收藏、小记和历史版本。
- 用户名密码登录，短期 Access Token 与 HttpOnly Refresh Cookie。
- 按用户隔离的 IndexedDB：`DuetDocDB:<user_id>`。
- 离线优先编辑与手动双向同步，支持断网重试、修订冲突和云端更新提示。
- 文档及 Duet 助手聊天记录跨客户端同步。
- 图片先保存在 IndexedDB；手动同步时只上传当前正文实际引用的图片，新客户端可从私有 OSS 恢复。
- 浏览器端模型下载、进度显示、缓存文件齐全检查和跨账号缓存复用。
- 本地 RAG：文档切分、向量索引和语义检索。

## 技术栈

- React 19、TypeScript、Vite 8、Tailwind CSS 4
- Tiptap 3、Zustand、Dexie.js
- Transformers.js、ONNX Runtime Web、WebGPU、Web Worker
- Cache Storage、Service Worker、IndexedDB

## 本地开发

### 环境要求

- Node.js 22（或满足 Vite 8 要求的较新版本）
- npm
- Chrome 或 Edge 最新版；端侧 AI 需要浏览器和设备支持 WebGPU
- 已启动的 DuetDoc 后端，默认地址为 `http://127.0.0.1:8000`

### 安装与启动

```powershell
cd duet-doc-app
npm install
Copy-Item .env.example .env.local
npm run dev
```

访问 `http://localhost:5173`。首次使用需要注册或登录；新用户只创建一个默认知识库和一篇默认文档。

开发环境建议让 `VITE_API_BASE_URL` 保持为空。Vite 会把 `/api` 代理到 `http://127.0.0.1:8000`，这样 Refresh Cookie 与前端保持同源：

```dotenv
VITE_API_BASE_URL=
```

只有在后端已经正确配置 CORS、Cookie 和 HTTPS 时，才将它设置为完整的远程 API 地址。任何 DeepSeek Key、OSS 凭证或 JWT 密钥都不能写入前端环境变量。

## 端侧模型

模型权重不再放入 `public/ai-models`，也不会进入 Git 或前端构建产物。登录后从个人菜单打开“端侧模型”，按需安装：

| 用途         | 模型              | 精度  | 约占空间 |
| ------------ | ----------------- | ----- | -------- |
| 本地语义检索 | BGE Large Zh v1.5 | FP16  | 620 MiB  |
| 幽灵文本     | Qwen3.5 0.8B      | Q4F16 | 634 MiB  |

检索测试页和正式索引共用 FP16 模型与 IndexedDB 索引。建立索引后，手动云同步会上传当前版本的文档向量。

后端为私有 OSS 文件签发短期 URL，前端下载后写入当前站点 Origin 的 Cache Storage。同一 Origin 下切换 DuetDoc 账号会复用模型缓存；不同协议、域名或端口的缓存彼此隔离。

自行部署时建议从以下 Hugging Face 仓库准备与 Transformers.js 兼容的 ONNX 文件：

- 语义检索：[Xenova/bge-large-zh-v1.5](https://huggingface.co/Xenova/bge-large-zh-v1.5)，使用 `onnx/model_fp16.onnx`，输出 1024 维向量。
- 幽灵文本：[onnx-community/Qwen3.5-0.8B-ONNX](https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX)，使用名称带 `_q4f16` 的 decoder、embed tokens 和 vision encoder 文件组。Q4F16 在下载体积、浏览器显存占用和 WebGPU 推理质量之间更适合当前演示项目。

不要把 FP16、Q4、Q4F16 或 quantized 文件混合到同一模型目录。上游仓库可能更新文件；下载时建议固定 Hugging Face revision，并确认文件名和大小与后端 `app/services/model_delivery.py` 的 `MODEL_CATALOG` 一致。迁移到 BGE 时，旧 E5 索引会清空，需要手动重新建立。

若要清理模型，请使用浏览器开发者工具的“应用/存储空间”页面。模型管理弹窗不提供删除按钮，以减少误删后的重复大文件下载。

仓库不提供模型权重，也不内置项目维护者的 OSS 地址或访问凭证。克隆或 Fork 后自行部署时，需要自行取得符合相应许可证的模型文件，保持后端模型清单约定的目录结构，将其上传到自己的私有对象存储，并配置自己的后端 OSS/RAM 权限。只有访问项目维护者实际部署的演示站点时，才会使用该演示环境配置的模型存储。

## 数据与同步边界

- 本地编辑不依赖网络，业务数据先写 IndexedDB 和同步 Outbox。
- 云同步由用户手动触发；可见页面会低频检查云端是否有新版本，但不会静默覆盖本地修改。
- 知识库、分组、文档、聊天会同步到 PostgreSQL；图片原文件存入私有 OSS。
- 历史版本、收藏仍以浏览器本地数据为准；手动同步时可上传 BGE 文本索引供其他设备复用。
- 图片正文只保存稳定的 `assetId`，不保存会过期的 OSS 签名 URL。
- 登出后会关闭当前用户数据库；模型缓存是设备级资源，不随账号切换清除。

## 质量检查与构建

```powershell
npm run check
npm run build
```

常用单项命令：

```powershell
npm run format:check
npm run lint
npm run typecheck
```

生产构建输出到 `dist/`。部署时应由 Nginx/OpenResty 托管静态文件，并将 `/api/` 反向代理到 FastAPI；前端路由需要回退到 `index.html`。模型由 OSS 按需交付，因此重新发布前端不会重复携带约 1.2 GiB 的模型权重。

## 常见问题

### 刷新接口返回 403

确认前端请求经过同源 Vite/Nginx 代理，浏览器允许 Cookie，并且后端 `FRONTEND_ORIGINS` 包含当前前端 Origin。直接跨域访问 FastAPI 时还需要正确的凭据请求和 Cookie 配置。

### 模型显示未安装或端侧 AI 不工作

先在“端侧模型”中完成下载，再检查浏览器是否支持 WebGPU，以及 Cache Storage 中是否存在 `duet-model:*` 缓存。模型清单接口需要有效登录状态。

### 新客户端看不到最新内容

点击左下角同步入口执行拉取。如果提示冲突，先处理冲突，不要直接删除 IndexedDB 中的 Outbox 或实体状态记录。

### 图片在新客户端无法显示

先确认原客户端已经同步过包含该图片的正文，再检查后端媒体 Bucket、RAM Role 与 OSS CORS。图片只在正文同步前上传完成后，文档变更才会推送。
