# AGENTS.md — AI 开发指南

> 给 AI 编码助手的项目速览：读完即可安全、符合惯例地修改本仓库。
> 面向人类的完整介绍见 `README.md`。

## 项目是什么

**墨记 InkNote**：本地优先的 Electron 桌面笔记应用（Windows）。
无账号、无云端——所有数据以明文 JSON 文件存在用户自选目录。
UI 风格「宣纸 · 朱砂 · 夜墨」，中英双语。

## 技术栈

- Electron 34 + electron-vite 3 + Vite 6 + TypeScript 5（strict 全开）
- Vue 3（`<script setup>` 组合式 API）+ Pinia + vue-router（hash 模式）+ vue-i18n
- TipTap 2 富文本（starter-kit + image/link/placeholder/text-align/underline）
- Playwright `_electron` 做冒烟/视觉测试；electron-builder 打 NSIS 安装包

## 常用命令

```bash
npm install          # 依赖（.npmrc 已指向 npmmirror）
npm run dev          # 开发模式（HMR）
npm run typecheck    # node + web 两侧类型检查，改完代码必跑
npm run test:smoke   # build + 全流程冒烟测试（Playwright 驱动 Electron）
npm run test:visual  # build + 视觉/几何检查
npm run build:win    # 打包 Windows 安装包 → release/
```

## 目录结构（核心文件）

```
electron.vite.config.ts    # 三进程构建 + 路径别名（唯一构建配置）
src/
  main/                    # 主进程（Node 环境）
    index.ts               # 入口：窗口、单实例锁、inkimg:// 图片协议、窗口状态持久化
    ipc.ts                 # 全部 IPC handler 注册处（唯一入口）
    storage.ts             # 全部文件读写：设置/笔记本/笔记/图片；原子写 + 串行锁
    ai.ts                  # AI 润色：OpenAI 兼容 API，fetch + SSE 流式解析
  preload/index.ts         # contextBridge 暴露 window.api（渲染层↔主进程唯一通道）
  shared/types.ts          # 三端共享类型 + InkApi 接口定义
  renderer/                # 渲染进程（浏览器环境）
    index.html             # 入口 HTML，含 CSP
    src/
      main.ts / App.vue / router/index.ts   # 启动、根组件、路由（onboarding 守卫）
      stores/              # Pinia：app / notes / notebooks / settings / ui
      views/               # OnboardingView / HomeView / EditorView / SettingsView / AiConfigView
      components/          # TitleBar / Sidebar / NotesPane（笔记二级侧栏，可折叠）/ PreviewPane（右侧预览面板，支持全屏）/ NoteCard / SearchOverlay / EditorToolbar / AiPolishPanel + ui/*
      utils/               # text（TipTap JSON↔纯文本）/ preview（TipTap JSON→预览 HTML）/ compress（图片压缩）/ ipc / format / directives
      i18n/                # zh-CN.ts + en-US.ts（新文案必须两边同步）
      styles/              # main.css（设计令牌 + 全局样式）/ editor.css
scripts/                   # smoke.mjs / visual-check.mjs / check-packaged.mjs / icon-gen/
```

## 架构与数据流

严格三层，渲染进程接触不到 Node：

```
渲染进程 (Vue + Pinia)
   └─ window.api.xxx()          ← preload 用 contextBridge 暴露，见 shared/types.ts 的 InkApi
        └─ ipcRenderer.invoke('领域:动作')
             └─ main/ipc.ts handler → storage.ts / ai.ts（文件 IO、fetch）→ 返回结果
```

- 窗口：无边框（`frame: false`），标题栏是自绘的 `TitleBar.vue`；外链一律 `shell.openExternal`。
- AI 流式：`ai.ts` 解析 SSE 后 `webContents.send('ai:stream')`，渲染层经 `window.api.onAiStream(cb)` 订阅（返回取消订阅函数）。

## 数据存储

存储目录由用户首启选择（路径记在 `userData/meta.json` 的 `rootDir`）：

```
<rootDir>/
  settings.json      # 设置；AI 密钥经 DPAPI(safeStorage) 加密为 apiKeyEnc，不可用时 base64 兜底
  notebooks.json     # [{id, name, createdAt}]，"全部" 即 notebookId === null，不落库
  notes/<uuid>.json  # 每篇一个文件：标题 + TipTap JSON 正文 + images 文件名列表
  images/            # 图片文件；删除笔记时按 note.images 清理
```

写入铁律：
- 一律 `atomicWrite`（写临时文件再 rename），`withLock(key, fn)` 按 key 串行化防并发覆盖（如 `note:<id>`、`settings`）。
- 笔记 id 必须匹配 UUID 正则（`notePath` 校验，防路径穿越）。
- `INKNOTE_USER_DATA` 环境变量可覆盖 userData（所有测试脚本都这么用）。

## 改代码必守的约定

1. **路径别名**：`@/` → `src/renderer/src`，`@shared/` → `src/shared`（三端通用）。只用别名，不写深层相对路径。
2. **新增 IPC 能力 = 改三个文件**：`shared/types.ts`（InkApi 加签名）→ `preload/index.ts`（invoke/send 包装）→ `main/ipc.ts`（注册 handler，channel 命名 `领域:动作`）。渲染层只准调 `window.api`，禁止 `import` 任何 Node/Electron 模块。
3. **类型检查**：`strict` + `noUnusedLocals/Parameters`；web 侧用 `vue-tsc`（`npm run typecheck` 全查）。新增文件会被对应 tsconfig 自动纳入。
4. **国际化**：UI 文案一律 `t('key')`，禁止硬编码中文；新 key 同时加进 `zh-CN.ts` 与 `en-US.ts`，键按 `视图.语义` 分层。
5. **样式**：不新造色值——使用 `main.css` 的 CSS 变量（`--bg --surface --ink --accent --line --danger` 等）；主题切换靠 `<html data-theme="light|dark">`，由 `stores/settings.ts` 的 `apply()` 统一驱动（含字体、字号缩放、i18n locale、nativeTheme）。
6. **编辑器**：TipTap 扩展只在 `EditorView.vue` 的 `useEditor` 里配置；正文即 `editor.getJSON()`。自动保存：输入 900ms 防抖 → `notes:update`；返回/卸载/Ctrl+S 强制 `flushSave`。图片管线：`utils/compress.ts`（>2M 压到 2M 内，>10M 拒绝）→ `images:save` → src 为 `inkimg://image/<file>`（自定义协议，主进程注册）。
7. **AI**：兼容 OpenAI `/chat/completions`（DeepSeek/Kimi/通义/智谱/Ollama…）；连接测试 20s 超时、润色 180s 超时；`AbortController` 取消，同一时刻只允许一个润色任务。三档强度提示词与温度在 `ai.ts` 顶部常量。
8. **CSP**：`renderer/index.html` 已声明 CSP，connect-src 放行 http/https/ws（AI 调用依赖它），改网络请求别忘核对。

## 测试

- `scripts/smoke.mjs`：mock `dialog.showOpenDialog` 选目录，走查 引导→笔记本→笔记编辑→加粗→搜索→批量移动/删除→设置（暗黑、英文）全流程，截图存 `.test-tmp/shots/`。
- `scripts/visual-check.mjs`：验证设计令牌真实生效（背景色、印章尺寸、布局几何）。
- `scripts/check-packaged.mjs`：验证 `release/win-unpacked/inknote.exe` 能启动。
- ⚠️ 三个脚本里 `ROOT` 都硬编码为 `D:\myProject\yxl-todo`——移动仓库后要同步改；测试会清空 `.test-tmp/`。
- 测试内不含真实 AI 调用；新增用例沿用现有 `step/check` 风格和选择器命名（`.sb-*` 侧栏、`.np-*` 笔记二级侧栏、`.pv-*` 预览面板、`.ed-*` 编辑器、`.batch-*` 批量操作等），这些 class 是测试契约，改 UI 时不要随意改。

## 其他注意

- 主进程 `externalizeDepsPlugin`：`dependencies` 里的包不打进 bundle；新增主进程运行时依赖需放 `dependencies`（非 dev）。
- 无 ESLint/Prettier 配置，风格以现有代码为准：分号、单引号、2 空格缩进、中文注释。
- 打包配置在 `electron-builder.yml`（appId `com.yxl.inknote`，只出 Windows NSIS）。
