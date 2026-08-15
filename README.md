# 墨记 InkNote

本地优先的个人记录软件。所有数据保存在你自己的文件夹里——无需注册，不依赖云端。

「宣纸 · 朱砂 · 夜墨」：暖纸色界面、衬线排版、朱砂印章点缀，以及丝滑的动效与反馈。

## 功能

- **首次启动强制选择本地存储目录**，笔记 / 图片 / 设置以明文文件保存在该目录，随时可迁移与备份
- **笔记本管理**：默认「全部」+ 自定义笔记本的增删改查；删除笔记本时笔记自动移入「全部」
- **笔记管理**：卡片式列表、批量删除、批量移动到其他笔记本、全局全文搜索（Ctrl+K）
- **富文本编辑**：TipTap 编辑器，支持加粗 / 斜体 / 下划线 / 删除线、标题、引用、列表、代码块、对齐、分割线、撤销重做
- **图片**：支持粘贴 / 拖拽 / 按钮插入；超过 2M 自动压缩到 2M 以内，超过 10M 拒绝插入
- **AI 润色**：流式输出，轻度 / 标准 / 深度三档强度，一键替换全文
- **AI 配置**：兼容 OpenAI 格式的任意大模型服务（DeepSeek / Kimi / 通义千问 / 智谱 / Ollama…），密钥使用系统 DPAPI 加密存储（不落明文、存储目录自动写入 .gitignore 防止密钥文件被提交），支持测试连接；模型名称列表保存在本地，可增删改查、切换当前使用模型
- **设置**：字体大小、自定义字体、主题色、明亮 / 暗黑 / 跟随系统、中英文双语、大模型设置、数据目录迁移

## 开发

```bash
npm install        # 依赖安装（含 Electron）
npm run dev        # 开发模式（HMR）
npm run typecheck  # 类型检查
npm run test:smoke # 构建 + 全流程冒烟测试（Playwright 驱动 Electron）
npm run test:visual# 构建 + 视觉/几何检查
```

## 打包

```bash
npm run icon       # 重新生成应用图标（可选）
npm run build:win  # 打包 Windows 安装包 → release/
```

## 数据目录结构

```
<你选择的目录>/
  .gitignore          # 自动生成：忽略 settings.json，防止密钥文件进版本库
  settings.json      # 应用设置（AI 密钥经 DPAPI 加密）
  notebooks.json     # 笔记本列表
  notes/<id>.json    # 每篇笔记一个文件（TipTap JSON）
  images/            # 插入的图片
```

## 技术栈

Electron 34 · Vue 3 · TypeScript · Vite (electron-vite) · Pinia · vue-i18n · TipTap 2
