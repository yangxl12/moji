import { BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron'
import * as storage from './storage'
import * as ai from './ai'
import { setTrayMenuLabels, type TrayMenuLabels } from './tray'
import type { AiConfig, AiPolishInput, Settings } from '@shared/types'

const ok = { ok: true }

export function registerIpc(getWindow: () => BrowserWindow | null): void {
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

  // ---------- 设置 ----------
  ipcMain.handle('settings:get', () => storage.loadSettings())
  ipcMain.handle('settings:save', (_e, patch: Partial<Settings>) => storage.saveSettings(patch))
  ipcMain.on('app:setThemeSource', (_e, mode: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = mode
  })

  // ---------- 笔记本 ----------
  ipcMain.handle('notebooks:list', () => storage.listNotebooks())
  ipcMain.handle('notebooks:create', (_e, name: string) => storage.createNotebook(name))
  ipcMain.handle('notebooks:rename', (_e, id: string, name: string) => storage.renameNotebook(id, name))
  ipcMain.handle('notebooks:delete', (_e, id: string) => storage.deleteNotebook(id))

  // ---------- 笔记 ----------
  ipcMain.handle('notes:list', () => storage.listNotes())
  ipcMain.handle('notes:get', (_e, id: string) => storage.getNote(id))
  ipcMain.handle('notes:create', (_e, input: { title?: string; notebookId: string | null }) =>
    storage.createNote(input)
  )
  ipcMain.handle(
    'notes:update',
    (_e, id: string, patch: Partial<Pick<import('@shared/types').NoteMeta, 'title' | 'content' | 'notebookId'>>) =>
      storage.updateNote(id, patch)
  )
  ipcMain.handle('notes:delete', (_e, ids: string[]) => storage.deleteNotes(ids))
  ipcMain.handle('notes:move', (_e, ids: string[], notebookId: string | null) => storage.moveNotes(ids, notebookId))

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
