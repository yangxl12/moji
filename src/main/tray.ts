import { app, Menu, nativeImage, Tray, type BrowserWindow } from 'electron'
import { join } from 'path'

/**
 * Windows 托盘：
 * - 点击关闭按钮默认最小化到托盘（close 事件 preventDefault + hide）
 * - 左键单击托盘图标恢复窗口
 * - 右键菜单：显示主窗口 / 新建笔记 / 新建笔记本 / 打开设置 / 退出
 * - 菜单文案由渲染层按当前语言通过 tray:setMenu 下发
 */

export type TrayActionId = 'new-note' | 'new-notebook' | 'settings'

export interface TrayMenuLabels {
  show: string
  newNote: string
  newNotebook: string
  settings: string
  quit: string
  hideHint: string
}

let tray: Tray | null = null
let labels: TrayMenuLabels | null = null
let getWindowRef: (() => BrowserWindow | null) | null = null
let quitting = false
let hintShown = false

function trayIconPath(): string {
  // 打包后经 extraResources 放在 resources/tray.png；开发时用仓库内 resources/tray.png
  return app.isPackaged ? join(process.resourcesPath, 'tray.png') : join(app.getAppPath(), 'resources', 'tray.png')
}

export function isQuitting(): boolean {
  return quitting
}

export function markQuitting(): void {
  quitting = true
}

function showMainWindow(): void {
  const win = getWindowRef?.()
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function sendAction(id: TrayActionId): void {
  showMainWindow()
  const win = getWindowRef?.()
  if (win && !win.isDestroyed()) win.webContents.send('tray:action', id)
}

function rebuildMenu(): void {
  if (!tray) return
  const L = labels
  const menu = Menu.buildFromTemplate([
    {
      id: 'show',
      label: L?.show ?? '显示主窗口',
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      id: 'new-note',
      label: L?.newNote ?? '新建笔记',
      click: () => sendAction('new-note')
    },
    {
      id: 'new-notebook',
      label: L?.newNotebook ?? '新建笔记本',
      click: () => sendAction('new-notebook')
    },
    {
      id: 'settings',
      label: L?.settings ?? '打开设置',
      click: () => sendAction('settings')
    },
    { type: 'separator' },
    {
      id: 'quit',
      label: L?.quit ?? '退出',
      click: () => {
        quitting = true
        // 给渲染层一点时间把未保存内容落盘（updateNote 为异步写）
        const win = getWindowRef?.()
        if (win && !win.isDestroyed()) win.webContents.send('window:hidden')
        setTimeout(() => app.quit(), 150)
      }
    }
  ])
  tray.setContextMenu(menu)
}

export function createTray(getWindow: () => BrowserWindow | null): void {
  if (tray) return
  getWindowRef = getWindow
  const icon = nativeImage.createFromPath(trayIconPath())
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('墨记 InkNote')
  rebuildMenu()
  tray.on('click', () => showMainWindow())
}

export function setTrayMenuLabels(next: TrayMenuLabels): void {
  labels = next
  rebuildMenu()
}

/** 窗口被收起进托盘时的一次性气泡提示（仅 Windows） */
export function showTrayHintOnce(): void {
  if (hintShown || !tray || process.platform !== 'win32') return
  hintShown = true
  try {
    tray.displayBalloon({
      title: '墨记',
      content: labels?.hideHint ?? '已最小化到托盘，双击托盘图标可恢复窗口'
    })
  } catch {
    /* 忽略：部分系统禁用气泡 */
  }
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
