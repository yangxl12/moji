import { app, BrowserWindow, protocol, shell, nativeTheme } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { loadMeta, loadSettings, resolveImage, saveMeta } from './storage'
import { createTray, isQuitting, markQuitting, showTrayHintOnce } from './tray'

let mainWindow: BrowserWindow | null = null

const isDev = !app.isPackaged

// 测试环境允许覆盖 userData
if (process.env.INKNOTE_USER_DATA) {
  app.setPath('userData', process.env.INKNOTE_USER_DATA)
}

function sendToWindow(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// ---------- 图片自定义协议 inkimg://image/<filename> ----------
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'inkimg',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function registerImageProtocol(): void {
  protocol.handle('inkimg', async (request) => {
    try {
      const url = new URL(request.url)
      const fileName = url.pathname.replace(/^\/+/, '').split('/').pop() ?? ''
      const img = await resolveImage(fileName)
      if (!img) return new Response('Not found', { status: 404 })
      return new Response(img.data, {
        status: 200,
        headers: { 'Content-Type': img.mime, 'Cache-Control': 'no-cache' }
      })
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })
}

async function createWindow(): Promise<void> {
  const meta = await loadMeta()
  const dark = nativeTheme.shouldUseDarkColors

  const win = new BrowserWindow({
    width: meta.window?.bounds?.width ?? 1240,
    height: meta.window?.bounds?.height ?? 800,
    x: meta.window?.bounds?.x,
    y: meta.window?.bounds?.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: dark ? '#16130F' : '#F4EEE2',
    title: '墨记',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow = win

  if (meta.window?.maximized) win.maximize()

  win.once('ready-to-show', () => {
    win.show()
  })

  win.on('maximize', () => sendToWindow('window:maximized', true))
  win.on('unmaximize', () => sendToWindow('window:maximized', false))

  // 持久化窗口状态
  let saveTimer: NodeJS.Timeout | null = null
  const persistBounds = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!win.isDestroyed()) {
        void (async () => {
          const m = await loadMeta()
          m.window = { bounds: win.getNormalBounds(), maximized: win.isMaximized() }
          await saveMeta()
        })()
      }
    }, 300)
  }
  win.on('resize', persistBounds)
  win.on('move', persistBounds)
  win.on('close', persistBounds)

  // 关闭窗口默认退到托盘（托盘菜单的"退出"会先标记 quitting 再走正常退出）
  win.on('close', (e) => {
    if (!isQuitting()) {
      e.preventDefault()
      win.hide()
      sendToWindow('window:hidden')
      showTrayHintOnce()
    }
  })

  // 外链用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 开发工具与刷新快捷键
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12') {
      win.webContents.toggleDevTools()
    } else if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools()
    } else if (input.control && input.key.toLowerCase() === 'r' && isDev) {
      win.webContents.reload()
    }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(async () => {
    registerImageProtocol()
    registerIpc(() => mainWindow)
    app.setAppUserModelId('com.yxl.inknote')
    // 保持主题源与设置一致
    try {
      const meta = await loadMeta()
      if (meta.rootDir) {
        const settings = await loadSettings()
        nativeTheme.themeSource = settings.themeMode
      }
    } catch {
      /* ignore */
    }
    await createWindow()
    createTray(() => mainWindow)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
      else showMainWindow()
    })
  })

  app.on('before-quit', () => markQuitting())

  app.on('window-all-closed', () => {
    app.quit()
  })
}
