import { defineStore } from 'pinia'

export interface ToastItem {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

export interface ConfirmOptions {
  title: string
  desc?: string
  okText?: string
  danger?: boolean
}

let toastSeq = 0

const SIDEBAR_KEY = 'inknote:sidebar-collapsed'
const NOTES_PANE_KEY = 'inknote:notes-pane-collapsed'

export const useUiStore = defineStore('ui', {
  state: () => ({
    toasts: [] as ToastItem[],
    confirmOpen: false,
    confirmOptions: null as ConfirmOptions | null,
    confirmResolve: null as ((v: boolean) => void) | null,
    searchOpen: false,
    sidebarCollapsed: localStorage.getItem(SIDEBAR_KEY) === '1',
    /** 笔记二级侧栏是否折叠（折叠后预览区变大） */
    notesCollapsed: localStorage.getItem(NOTES_PANE_KEY) === '1',
    /** 当前选中的笔记 id（列表点选 / 搜索命中后，主区直接显示可编辑的笔记页） */
    selectedNoteId: null as string | null,
    /** 编辑器是否全屏 */
    fullscreenEditor: false,
    /** 全局快捷键 / 托盘触发的"新建笔记本"请求计数，Sidebar 监听后弹出输入框 */
    notebookCreateReq: 0
  }),
  actions: {
    toggleSidebar(): void {
      this.sidebarCollapsed = !this.sidebarCollapsed
      localStorage.setItem(SIDEBAR_KEY, this.sidebarCollapsed ? '1' : '0')
    },
    toggleNotesPane(): void {
      this.notesCollapsed = !this.notesCollapsed
      localStorage.setItem(NOTES_PANE_KEY, this.notesCollapsed ? '1' : '0')
    },
    /** 切换笔记页目标（编辑即预览，切走时 EditorView 以 key 重挂载并自动落盘） */
    selectNote(id: string | null): void {
      this.selectedNoteId = id
      this.fullscreenEditor = false
    },
    requestNewNotebook(): void {
      this.notebookCreateReq++
    },
    toast(type: ToastItem['type'], message: string, duration = 2600): number {
      const id = ++toastSeq
      this.toasts.push({ id, type, message })
      setTimeout(() => this.dismissToast(id), duration)
      return id
    },
    dismissToast(id: number): void {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
    confirm(options: ConfirmOptions): Promise<boolean> {
      this.confirmOptions = options
      this.confirmOpen = true
      return new Promise((resolve) => {
        this.confirmResolve = resolve
      })
    },
    resolveConfirm(v: boolean): void {
      this.confirmOpen = false
      this.confirmResolve?.(v)
      this.confirmResolve = null
    }
  }
})
