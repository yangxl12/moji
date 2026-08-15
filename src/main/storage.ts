import { app, safeStorage, shell } from 'electron'
import { promises as fs, existsSync } from 'fs'
import { join, resolve, basename } from 'path'
import { randomUUID } from 'crypto'
import type { AiConfig, Notebook, NoteMeta, Settings, WindowState } from '@shared/types'

// ---------- 默认设置 ----------
export const DEFAULT_SETTINGS: Settings = {
  themeMode: 'system',
  accentColor: '#B5452B',
  fontSize: 'medium',
  contentFont: '"Source Han Serif SC","Noto Serif SC","Songti SC",Georgia,"Times New Roman",serif',
  uiFont: '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei UI","Segoe UI",system-ui,sans-serif',
  language: 'zh-CN',
  ai: null
}

const NOTE_DIR = 'notes'
const IMAGE_DIR = 'images'
const SETTINGS_FILE = 'settings.json'
const NOTEBOOKS_FILE = 'notebooks.json'

interface MetaFile {
  rootDir: string | null
  window?: WindowState
}

// ---------- 元数据（存储于 userData，记录用户选择的数据目录） ----------
let metaCache: MetaFile | null = null

function metaPath(): string {
  return join(app.getPath('userData'), 'meta.json')
}

export async function loadMeta(): Promise<MetaFile> {
  if (metaCache) return metaCache
  try {
    const raw = await fs.readFile(metaPath(), 'utf-8')
    metaCache = JSON.parse(raw) as MetaFile
  } catch {
    metaCache = { rootDir: null }
  }
  return metaCache
}

export async function saveMeta(): Promise<void> {
  const file = metaPath()
  await fs.mkdir(join(file, '..'), { recursive: true })
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(metaCache, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

export async function getRootDir(): Promise<string | null> {
  const meta = await loadMeta()
  if (!meta.rootDir) return null
  return existsSync(meta.rootDir) ? meta.rootDir : null
}

export async function setRootDir(dir: string): Promise<void> {
  const meta = await loadMeta()
  meta.rootDir = resolve(dir)
  await saveMeta()
}

// ---------- 写入串行化（防止自动保存并发覆盖） ----------
const queues = new Map<string, Promise<unknown>>()
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  queues.set(key, next.catch(() => undefined))
  return next
}

async function atomicWrite(file: string, data: string): Promise<void> {
  await fs.mkdir(join(file, '..'), { recursive: true })
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, data, 'utf-8')
  await fs.rename(tmp, file)
}

// ---------- 初始化 ----------
export async function initStorage(dir: string): Promise<{ ok: boolean; error?: string; dir?: string }> {
  try {
    const abs = resolve(dir)
    if (!abs || abs.length < 2) return { ok: false, error: 'Invalid directory' }
    const stat = await fs.stat(abs).catch(() => null)
    if (!stat || !stat.isDirectory()) return { ok: false, error: 'Directory does not exist' }
    // 可写性测试
    const probe = join(abs, '.inknote-write-test')
    await fs.writeFile(probe, 'ok', 'utf-8')
    await fs.unlink(probe)
    // 建立目录结构
    await fs.mkdir(join(abs, NOTE_DIR), { recursive: true })
    await fs.mkdir(join(abs, IMAGE_DIR), { recursive: true })
    if (!existsSync(join(abs, SETTINGS_FILE))) await atomicWrite(join(abs, SETTINGS_FILE), JSON.stringify(DEFAULT_SETTINGS, null, 2))
    if (!existsSync(join(abs, NOTEBOOKS_FILE))) await atomicWrite(join(abs, NOTEBOOKS_FILE), JSON.stringify([], null, 2))
    await setRootDir(abs)
    return { ok: true, dir: abs }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function migrateStorage(dir: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const oldRoot = await getRootDir()
    const abs = resolve(dir)
    if (!oldRoot) return { ok: false, error: 'No storage' }
    if (abs === oldRoot) return { ok: true }
    const stat = await fs.stat(abs).catch(() => null)
    if (!stat || !stat.isDirectory()) return { ok: false, error: 'Directory does not exist' }
    // 先把新目录初始化好，再复制数据文件
    await fs.mkdir(join(abs, NOTE_DIR), { recursive: true })
    await fs.mkdir(join(abs, IMAGE_DIR), { recursive: true })
    await fs.cp(join(oldRoot, NOTE_DIR), join(abs, NOTE_DIR), { recursive: true })
    await fs.cp(join(oldRoot, IMAGE_DIR), join(abs, IMAGE_DIR), { recursive: true })
    if (existsSync(join(oldRoot, SETTINGS_FILE))) await fs.copyFile(join(oldRoot, SETTINGS_FILE), join(abs, SETTINGS_FILE))
    if (existsSync(join(oldRoot, NOTEBOOKS_FILE))) await fs.copyFile(join(oldRoot, NOTEBOOKS_FILE), join(abs, NOTEBOOKS_FILE))
    await setRootDir(abs)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function openStorageDir(): Promise<void> {
  const root = await getRootDir()
  if (root) await shell.openPath(root)
}

// ---------- API Key 加密 ----------
function encryptKey(key: string): { enc?: string; plain?: string } {
  if (!key) return {}
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return { enc: safeStorage.encryptString(key).toString('base64') }
    }
  } catch {
    /* fall through */
  }
  return { plain: Buffer.from(key, 'utf-8').toString('base64') }
}

function decryptKey(ai: { apiKeyEnc?: string; apiKeyPlain?: string; apiKey?: string } | null): string {
  if (!ai) return ''
  try {
    if (ai.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(ai.apiKeyEnc, 'base64'))
    }
  } catch {
    /* fall through */
  }
  if (ai.apiKeyPlain) {
    try {
      return Buffer.from(ai.apiKeyPlain, 'base64').toString('utf-8')
    } catch {
      return ''
    }
  }
  return ai.apiKey ?? ''
}

type StoredAi = Omit<AiConfig, 'apiKey'> & { apiKeyEnc?: string; apiKeyPlain?: string }

function serializeAi(ai: AiConfig, existing: AiConfig | null): StoredAi {
  const key = ai.apiKey !== '' ? ai.apiKey : (existing?.apiKey ?? '')
  return {
    baseUrl: ai.baseUrl,
    model: ai.model,
    strength: ai.strength,
    customPrompt: ai.customPrompt,
    temperatures: ai.temperatures,
    ...encryptKey(key)
  }
}

function hydrateAi(stored: StoredAi | null | undefined): AiConfig | null {
  if (!stored) return null
  return {
    baseUrl: stored.baseUrl,
    apiKey: decryptKey(stored as never),
    model: stored.model,
    strength: stored.strength,
    customPrompt: stored.customPrompt,
    temperatures: stored.temperatures
  }
}

// ---------- 设置 ----------
export async function loadSettings(): Promise<Settings> {
  const root = await getRootDir()
  const defaults = { ...DEFAULT_SETTINGS }
  if (!root) return defaults
  try {
    const raw = JSON.parse(await fs.readFile(join(root, SETTINGS_FILE), 'utf-8'))
    const merged: Settings = { ...defaults, ...raw }
    merged.ai = hydrateAi(raw.ai)
    return merged
  } catch {
    return defaults
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const root = await getRootDir()
  if (!root) throw new Error('No storage')
  return withLock('settings', async () => {
    const current = await loadSettings()
    const merged: Settings = { ...current, ...patch }
    if (patch.ai) {
      const keyKept = patch.ai.apiKey === '' && (current.ai?.apiKey ?? '') !== ''
      const effective: AiConfig = { ...patch.ai, apiKey: keyKept ? current.ai!.apiKey : patch.ai.apiKey }
      merged.ai = effective
    }
    const stored: Record<string, unknown> = { ...merged }
    stored.ai = merged.ai ? serializeAi(merged.ai, current.ai) : null
    await atomicWrite(join(root, SETTINGS_FILE), JSON.stringify(stored, null, 2))
    return merged
  })
}

// ---------- 笔记本 ----------
export async function listNotebooks(): Promise<Notebook[]> {
  const root = await getRootDir()
  if (!root) return []
  try {
    return JSON.parse(await fs.readFile(join(root, NOTEBOOKS_FILE), 'utf-8'))
  } catch {
    return []
  }
}

function cleanName(name: string): string {
  const n = name.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '').trim()
  if (!n) throw new Error('Name is empty')
  if (n.length > 40) throw new Error('Name too long')
  return n
}

async function saveNotebooks(list: Notebook[]): Promise<void> {
  const root = await getRootDir()
  if (!root) throw new Error('No storage')
  await withLock('notebooks', () => atomicWrite(join(root, NOTEBOOKS_FILE), JSON.stringify(list, null, 2)))
}

export async function createNotebook(name: string): Promise<Notebook> {
  const nb: Notebook = { id: randomUUID(), name: cleanName(name), createdAt: Date.now() }
  const list = await listNotebooks()
  if (list.some((x) => x.name === nb.name)) throw new Error('Notebook exists')
  list.push(nb)
  await saveNotebooks(list)
  return nb
}

export async function renameNotebook(id: string, name: string): Promise<Notebook> {
  const list = await listNotebooks()
  const nb = list.find((x) => x.id === id)
  if (!nb) throw new Error('Notebook not found')
  nb.name = cleanName(name)
  await saveNotebooks(list)
  return nb
}

export async function deleteNotebook(id: string): Promise<void> {
  const list = await listNotebooks()
  const idx = list.findIndex((x) => x.id === id)
  if (idx < 0) return
  list.splice(idx, 1)
  await saveNotebooks(list)
  // 该笔记本下的笔记移入"全部"（notebookId = null）
  const notes = await listNotes()
  await Promise.all(notes.filter((n) => n.notebookId === id).map((n) => updateNoteFile(n.id, { notebookId: null })))
}

// ---------- 笔记 ----------
function notePath(root: string, id: string): string {
  // 防御路径穿越
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Bad note id')
  return join(root, NOTE_DIR, `${id}.json`)
}

export async function listNotes(): Promise<NoteMeta[]> {
  const root = await getRootDir()
  if (!root) return []
  try {
    const files = await fs.readdir(join(root, NOTE_DIR))
    const list: NoteMeta[] = []
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      try {
        const raw = JSON.parse(await fs.readFile(join(root, NOTE_DIR, f), 'utf-8'))
        list.push(raw as NoteMeta)
      } catch {
        /* 跳过损坏文件 */
      }
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export async function getNote(id: string): Promise<NoteMeta | null> {
  const root = await getRootDir()
  if (!root) return null
  try {
    return JSON.parse(await fs.readFile(notePath(root, id), 'utf-8')) as NoteMeta
  } catch {
    return null
  }
}

async function updateNoteFile(
  id: string,
  patch: Partial<Pick<NoteMeta, 'title' | 'content' | 'notebookId'>>
): Promise<NoteMeta> {
  const root = await getRootDir()
  if (!root) throw new Error('No storage')
  const file = notePath(root, id)
  return withLock(`note:${id}`, async () => {
    let parsed: NoteMeta
    try {
      parsed = JSON.parse(await fs.readFile(file, 'utf-8')) as NoteMeta
    } catch {
      throw new Error('Note not found')
    }
    const merged: NoteMeta = {
      ...parsed,
      ...patch,
      title: patch.title !== undefined ? (patch.title.trim() || '') : parsed.title,
      updatedAt: Date.now()
    }
    await atomicWrite(file, JSON.stringify(merged, null, 2))
    return merged
  })
}

export async function createNote(input: { title?: string; notebookId: string | null }): Promise<NoteMeta> {
  const root = await getRootDir()
  if (!root) throw new Error('No storage')
  const now = Date.now()
  const note: NoteMeta = {
    id: randomUUID(),
    title: input.title?.trim() || '',
    notebookId: input.notebookId,
    content: null,
    createdAt: now,
    updatedAt: now,
    images: []
  }
  await withLock(`note:${note.id}`, () => atomicWrite(notePath(root, note.id), JSON.stringify(note, null, 2)))
  return note
}

export const updateNote = (id: string, patch: Partial<Pick<NoteMeta, 'title' | 'content' | 'notebookId'>>) =>
  updateNoteFile(id, patch)

export async function deleteNotes(ids: string[]): Promise<void> {
  const root = await getRootDir()
  if (!root) return
  for (const id of ids) {
    const note = await getNote(id)
    if (note) {
      for (const img of note.images) {
        const f = join(root, IMAGE_DIR, basename(img))
        await fs.unlink(f).catch(() => undefined)
      }
    }
    await fs.unlink(notePath(root, id)).catch(() => undefined)
  }
}

export async function moveNotes(ids: string[], notebookId: string | null): Promise<void> {
  for (const id of ids) await updateNoteFile(id, { notebookId })
}

// ---------- 图片 ----------
const IMG_EXT = /^[0-9a-z-]{4,64}\.(png|jpe?g|webp|gif)$/i
const IMG_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
}

async function addImageToNote(noteId: string, fileName: string): Promise<void> {
  const root = await getRootDir()
  if (!root) return
  const file = notePath(root, noteId)
  await withLock(`note:${noteId}`, async () => {
    let parsed: NoteMeta
    try {
      parsed = JSON.parse(await fs.readFile(file, 'utf-8')) as NoteMeta
    } catch {
      return
    }
    parsed.images = [...new Set([...(parsed.images ?? []), fileName])]
    await atomicWrite(file, JSON.stringify(parsed, null, 2))
  })
}

export async function saveImage(payload: { noteId: string; name: string; data: string }): Promise<{
  src: string
  width: number
  height: number
  originalSize: number
  finalSize: number
}> {
  const root = await getRootDir()
  if (!root) throw new Error('No storage')
  const buf = Buffer.from(payload.data, 'base64')
  const m = /\.(png|jpe?g|webp|gif)$/i.exec(payload.name)
  if (!m) throw new Error('Unsupported image type')
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
  const fileName = `${randomUUID().slice(0, 8)}-${payload.noteId.slice(0, 8)}.${ext}`
  await fs.writeFile(join(root, IMAGE_DIR, fileName), buf)
  await addImageToNote(payload.noteId, fileName)
  const { width, height } = await imageSize(buf)
  return {
    src: `inkimg://image/${fileName}`,
    width,
    height,
    originalSize: payload.data.length,
    finalSize: buf.length
  }
}

async function imageSize(buf: Buffer): Promise<{ width: number; height: number }> {
  try {
    const { nativeImage } = await import('electron')
    const img = nativeImage.createFromBuffer(buf)
    const s = img.getSize()
    if (s.width && s.height) return { width: s.width, height: s.height }
  } catch {
    /* ignore */
  }
  return { width: 0, height: 0 }
}

export async function resolveImage(fileName: string): Promise<{ data: Buffer; mime: string } | null> {
  const root = await getRootDir()
  if (!root || !IMG_EXT.test(fileName)) return null
  try {
    const data = await fs.readFile(join(root, IMAGE_DIR, fileName))
    const ext = /\.([a-z]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? 'png'
    return { data, mime: IMG_MIME[ext] ?? 'image/png' }
  } catch {
    return null
  }
}
