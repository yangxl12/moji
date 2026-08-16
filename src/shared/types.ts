// ============ 主进程 / 预加载 / 渲染进程共享类型 ============

export type ThemeMode = 'light' | 'dark' | 'system'
export type FontSize = 'small' | 'medium' | 'large'
export type Language = 'zh-CN' | 'en-US'
export type AiStrength = 'gentle' | 'standard' | 'deep'
/** 笔记正文格式：富文本 TipTap JSON / Markdown 源码字符串 */
export type NoteFormat = 'richtext' | 'markdown'
/** Markdown 预览页面展示模式 */
export type MdViewMode = 'preview' | 'edit' | 'split'

export interface AiConfig {
  /** OpenAI 兼容接口地址，例如 https://api.deepseek.com/v1 */
  baseUrl: string
  /** API 密钥（仅渲染层编辑时可见；存储时由主进程加密） */
  apiKey: string
  /** 当前使用的模型（必为 models 之一） */
  model: string
  /** 模型名称列表，本地持久化，可增删改查与切换 */
  models: string[]
  strength: AiStrength
  /** 可选自定义指令 */
  customPrompt: string
  /** 每种强度的温度（由界面选择强度时自动套用） */
  temperatures?: Partial<Record<AiStrength, number>>
}

export interface Settings {
  themeMode: ThemeMode
  accentColor: string
  fontSize: FontSize
  contentFont: string
  uiFont?: string
  language: Language
  /** 新建笔记时默认使用的正文格式 */
  defaultFormat: NoteFormat
  ai: AiConfig | null
}

export interface Notebook {
  id: string
  name: string
  createdAt: number
}

export interface NoteFile {
  id: string
  title: string
  notebookId: string | null
  content: unknown | null // richtext: TipTap JSON；markdown: 源码字符串
  /** 正文格式；老数据可能缺省，读取方需按 richtext 兼容 */
  format?: NoteFormat
  createdAt: number
  updatedAt: number
  images: string[] // 关联的图片文件名，删除笔记时清理
}

export interface NoteMeta {
  id: string
  title: string
  /** 正文格式；老数据可能缺省，读取方需按 richtext 兼容 */
  format?: NoteFormat
  notebookId: string | null
  content: unknown | null
  createdAt: number
  updatedAt: number
  images: string[]
}

export interface AppState {
  storageDir: string | null
  settings: Settings | null
}

export interface InitResult {
  ok: boolean
  error?: string
  dir?: string
}

export interface SaveImagePayload {
  noteId: string
  name: string
  /** base64（不含 data: 前缀） */
  data: string
}

export interface SaveImageResult {
  src: string
  width: number
  height: number
  /** 原图字节数与压缩后字节数（用于界面提示） */
  originalSize: number
  finalSize: number
}

export interface AiTestResult {
  ok: boolean
  latencyMs?: number
  reply?: string
  error?: string
}

export interface AiStartResult {
  ok: boolean
  error?: string
}

export interface AiStreamEvent {
  type: 'chunk' | 'done' | 'error'
  text?: string
  error?: string
}

export interface AiPolishInput {
  config: AiConfig
  text: string
  strength: AiStrength
  /** 当前笔记格式；markdown 时要求模型以 Markdown 结构输出 */
  format?: NoteFormat
}

export interface WindowState {
  bounds?: { x: number; y: number; width: number; height: number }
  maximized?: boolean
}

export interface MigrateResult {
  ok: boolean
  error?: string
}

/** 笔记本导出为 ZIP 的结果 */
export interface ExportResult {
  ok: boolean
  /** 生成的 zip 文件绝对路径（保存在数据目录根） */
  file?: string
  /** 导出的笔记篇数 */
  count?: number
  /** 失败原因；'Empty' 表示该笔记本（或「全部」）没有可导出的笔记 */
  error?: string
}

/** 托盘右键菜单动作（主进程 → 渲染层） */
export type TrayAction = 'new-note' | 'new-notebook' | 'settings'

/** 托盘右键菜单文案（渲染层按当前语言下发） */
export interface TrayMenuLabels {
  show: string
  newNote: string
  newNotebook: string
  settings: string
  quit: string
  hideHint: string
}

// ============ 暴露到 window.api 的接口 ============

export interface InkApi {
  getState(): Promise<AppState>
  chooseDirectory(): Promise<string | null>
  initStorage(dir: string): Promise<InitResult>
  migrateStorage(dir: string): Promise<MigrateResult>
  openStorageDir(): Promise<void>

  getSettings(): Promise<Settings>
  saveSettings(patch: Partial<Settings>): Promise<Settings>

  listNotebooks(): Promise<Notebook[]>
  createNotebook(name: string): Promise<Notebook>
  renameNotebook(id: string, name: string): Promise<Notebook>
  deleteNotebook(id: string): Promise<void>
  /** 导出笔记本全部笔记（notebookId 为 null 表示「全部」）为 zip，保存到数据目录根 */
  exportNotebook(notebookId: string | null): Promise<ExportResult>

  listNotes(): Promise<NoteMeta[]>
  getNote(id: string): Promise<NoteMeta | null>
  createNote(input: { title?: string; notebookId: string | null; format?: NoteFormat }): Promise<NoteMeta>
  updateNote(id: string, patch: { title?: string; content?: unknown; notebookId?: string | null; format?: NoteFormat }): Promise<NoteMeta>
  deleteNotes(ids: string[]): Promise<void>
  moveNotes(ids: string[], notebookId: string | null): Promise<void>

    openExternal(url: string): Promise<void>

  saveImage(payload: SaveImagePayload): Promise<SaveImageResult>

  testAi(config: AiConfig): Promise<AiTestResult>
  startAiPolish(input: AiPolishInput): Promise<AiStartResult>
  cancelAiPolish(): Promise<void>
  onAiStream(cb: (event: AiStreamEvent) => void): () => void

  setThemeSource(mode: ThemeMode): void

  windowMinimize(): void
  windowToggleMaximize(): Promise<boolean>
  windowClose(): void
  onWindowMaximized(cb: (maximized: boolean) => void): () => void
  /** 窗口被收起进托盘时触发（渲染层借此落盘未保存内容） */
  onWindowHidden(cb: () => void): () => void

  setTrayMenu(labels: TrayMenuLabels): Promise<void>
  onTrayAction(cb: (action: TrayAction) => void): () => void

  platform: NodeJS.Platform
  appVersion: string
}
