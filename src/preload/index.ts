import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiConfig,
  AiPolishInput,
  AiStreamEvent,
  InkApi,
  SaveImagePayload,
  Settings,
  ThemeMode,
  TrayAction,
  TrayMenuLabels
} from '@shared/types'

const api: InkApi = {
  getState: () => ipcRenderer.invoke('app:getState'),
  chooseDirectory: () => ipcRenderer.invoke('app:chooseDirectory'),
  initStorage: (dir) => ipcRenderer.invoke('app:initStorage', dir),
  migrateStorage: (dir) => ipcRenderer.invoke('app:migrateStorage', dir),
  openStorageDir: () => ipcRenderer.invoke('app:openStorageDir'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: Partial<Settings>) => ipcRenderer.invoke('settings:save', patch),

  listNotebooks: () => ipcRenderer.invoke('notebooks:list'),
  createNotebook: (name) => ipcRenderer.invoke('notebooks:create', name),
  renameNotebook: (id, name) => ipcRenderer.invoke('notebooks:rename', id, name),
  deleteNotebook: (id) => ipcRenderer.invoke('notebooks:delete', id),

  listNotes: () => ipcRenderer.invoke('notes:list'),
  getNote: (id) => ipcRenderer.invoke('notes:get', id),
  createNote: (input) => ipcRenderer.invoke('notes:create', input),
  updateNote: (id, patch) => ipcRenderer.invoke('notes:update', id, patch),
  deleteNotes: (ids) => ipcRenderer.invoke('notes:delete', ids),
  moveNotes: (ids, notebookId) => ipcRenderer.invoke('notes:move', ids, notebookId),

  saveImage: (payload: SaveImagePayload) => ipcRenderer.invoke('images:save', payload),

  testAi: (config: AiConfig) => ipcRenderer.invoke('ai:test', config),
  startAiPolish: (input: AiPolishInput) => ipcRenderer.invoke('ai:polish', input),
  cancelAiPolish: () => ipcRenderer.invoke('ai:cancel'),
  onAiStream: (cb: (event: AiStreamEvent) => void) => {
    const listener = (_e: unknown, event: AiStreamEvent): void => cb(event)
    ipcRenderer.on('ai:stream', listener)
    return () => ipcRenderer.removeListener('ai:stream', listener)
  },

  setThemeSource: (mode: ThemeMode) => ipcRenderer.send('app:setThemeSource', mode),

  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  onWindowMaximized: (cb) => {
    const listener = (_e: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('window:maximized', listener)
    return () => ipcRenderer.removeListener('window:maximized', listener)
  },
  onWindowHidden: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('window:hidden', listener)
    return () => ipcRenderer.removeListener('window:hidden', listener)
  },

  setTrayMenu: (labels: TrayMenuLabels) => ipcRenderer.invoke('tray:setMenu', labels),
  onTrayAction: (cb: (action: TrayAction) => void) => {
    const listener = (_e: unknown, action: TrayAction): void => cb(action)
    ipcRenderer.on('tray:action', listener)
    return () => ipcRenderer.removeListener('tray:action', listener)
  },

  platform: process.platform,
  appVersion: process.env.npm_package_version ?? '1.0.0'
}

contextBridge.exposeInMainWorld('api', api)
