import { BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import * as storage from './storage'
import * as ai from './ai'
import { exportNote, exportNotebook, exportNotes } from './export'
import { setTrayMenuLabels, type TrayMenuLabels } from './tray'
import type { AiConfig, AiPolishInput, Settings } from '@shared/types'

const ok = { ok: true }

export function registerIpc(getWindow: () => BrowserWindow | null, setToggleShortcut: (shortcut: string) => void): void {
  // ---------- 状态 / 目录 ----------
  ipcMain.handle('app:getState', async () => ({
    storageDir: await storage.getRootDir(),
    settings: await storage.loadSettings()
  }))

  ipcMain.handle('app:chooseDirectory', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: '选择本地存储目录',
      buttonLabel: '使用此目录',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('app:initStorage', (_e, dir: string) => storage.initStorage(dir))
  ipcMain.handle('app:migrateStorage', (_e, dir: string) => storage.migrateStorage(dir))
  ipcMain.handle('app:openStorageDir', () => storage.openStorageDir())
  ipcMain.handle('app:openExternal', async (_e, url: string) => {
    if (!/^(https?:|mailto:)/i.test(url || '')) return
    await shell.openExternal(url)
  })

  // ---------- 设置 ----------
  ipcMain.handle('settings:get', () => storage.loadSettings())
  ipcMain.handle('settings:save', async (_e, patch: Partial<Settings>) => {
    const previous = typeof patch.toggleShortcut === 'string' ? await storage.loadSettings() : null
    if (typeof patch.toggleShortcut === 'string') setToggleShortcut(patch.toggleShortcut)
    try {
      return await storage.saveSettings(patch)
    } catch (error) {
      if (previous) setToggleShortcut(previous.toggleShortcut)
      throw error
    }
  })
  ipcMain.on('app:setThemeSource', (_e, mode: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = mode
  })

  // ---------- 笔记本 ----------
  ipcMain.handle('notebooks:list', () => storage.listNotebooks())
  ipcMain.handle('notebooks:create', (_e, name: string) => storage.createNotebook(name))
  ipcMain.handle('notebooks:rename', (_e, id: string, name: string) => storage.renameNotebook(id, name))
  ipcMain.handle('notebooks:delete', (_e, id: string) => storage.deleteNotebook(id))
  ipcMain.handle('notebooks:export', (_e, notebookId: string | null, format: import('@shared/types').ExportFormat) =>
    exportNotebook(notebookId, format)
  )

  // ---------- 笔记 ----------
  ipcMain.handle('notes:list', () => storage.listNotes())
  ipcMain.handle('notes:get', (_e, id: string) => storage.getNote(id))
  ipcMain.handle('notes:create', (_e, input: { title?: string; notebookId: string | null; format?: import('@shared/types').NoteFormat }) =>
    storage.createNote(input)
  )
  ipcMain.handle(
    'notes:update',
    (_e, id: string, patch: Partial<Pick<import('@shared/types').NoteMeta, 'title' | 'content' | 'notebookId' | 'format'>>) =>
      storage.updateNote(id, patch)
  )
  ipcMain.handle('notes:delete', (_e, ids: string[]) => storage.deleteNotes(ids))
  ipcMain.handle('notes:move', (_e, ids: string[], notebookId: string | null) => storage.moveNotes(ids, notebookId))
  ipcMain.handle('notes:copy', (_e, ids: string[], notebookId: string | null) => storage.copyNotes(ids, notebookId))
  ipcMain.handle('notes:export', (_e, id: string, format: import('@shared/types').ExportFormat) => exportNote(id, format))
  ipcMain.handle('notes:exportMany', (_e, ids: string[], format: import('@shared/types').ExportFormat, archiveName: string) =>
    exportNotes(ids, format, archiveName)
  )

  // ---------- 图片 ----------
  ipcMain.handle('images:save', (_e, payload: { noteId: string; name: string; data: string }) =>
    storage.saveImage(payload)
  )

  // ---------- AI ----------
  ipcMain.handle('ai:test', (_e, config: AiConfig) => ai.testAi(config))
  ipcMain.handle('ai:polish', (_e, input: AiPolishInput) => ai.startAiPolish(getWindow(), input))
  ipcMain.handle('ai:cancel', () => {
    ai.cancelAiPolish()
    return ok
  })

  // ---------- 窗口 ----------
  ipcMain.on('window:minimize', () => getWindow()?.minimize())
  ipcMain.handle('window:toggleMaximize', () => {
    const win = getWindow()
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.on('window:close', () => getWindow()?.close())

  // ---------- 托盘 ----------
  ipcMain.handle('tray:setMenu', (_e, labels: TrayMenuLabels) => {
    setTrayMenuLabels(labels)
    return ok
  })
}
