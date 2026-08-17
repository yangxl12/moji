import { BrowserWindow } from 'electron'
import { promises as fs, existsSync } from 'fs'
import { basename, join } from 'path'
import { deflateRawSync } from 'zlib'
import MarkdownIt from 'markdown-it'
import type { ExportFormat, ExportResult, NoteMeta } from '@shared/types'
import { getRootDir, IMAGE_DIR, listNotebooks, listNotes, loadSettings } from './storage'

interface ZipEntry {
  name: string
  data: Buffer
  compress?: boolean
}

interface RichNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: RichNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

const FS_BAD = /[\\/:*?"<>|\u0000-\u001f]/g
const IMAGE_URL = /inkimg:\/\/image\/([^\s'"()<>]+)/gi

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: false })
markdown.validateLink = (url) => /^(?:(?:https?|mailto):|inkimg:|data:image\/|#|\/)/i.test(url)

// ---------- ZIP ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff
  return { time, date }
}

function buildZip(entries: ZipEntry[]): Buffer {
  const now = dosDateTime(new Date())
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf-8')
    const crc = crc32(entry.data)
    let method = 0
    let payload = entry.data
    if (entry.compress !== false) {
      const deflated = deflateRawSync(entry.data)
      if (deflated.length < entry.data.length) {
        method = 8
        payload = deflated
      }
    }
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(now.time, 10)
    local.writeUInt16LE(now.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, payload)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(now.time, 12)
    central.writeUInt16LE(now.date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += local.length + name.length + payload.length
  }
  const cdOffset = offset
  const cdSize = centrals.reduce((sum, item) => sum + item.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdOffset, 16)
  return Buffer.concat([...locals, ...centrals, eocd])
}

// ---------- Rich text conversion ----------
function textAttr(attrs: Record<string, unknown> | undefined, key: string): string {
  return typeof attrs?.[key] === 'string' ? attrs[key] : ''
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_[\]]/g, '\\$&')
}

function safeUrl(value: string): string {
  return /^(?:(?:https?|mailto):|inkimg:|data:image\/|#|\/)/i.test(value) ? value : ''
}

function inlineMarkdown(nodes: RichNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'text') {
        let output = escapeMarkdown(node.text ?? '')
        for (const mark of node.marks ?? []) {
          if (mark.type === 'bold') output = `**${output}**`
          else if (mark.type === 'italic') output = `*${output}*`
          else if (mark.type === 'strike') output = `~~${output}~~`
          else if (mark.type === 'code') output = `\`${output}\``
          else if (mark.type === 'underline') output = `<u>${output}</u>`
          else if (mark.type === 'link') {
            const href = safeUrl(textAttr(mark.attrs, 'href'))
            if (href) output = `[${output}](${href})`
          }
        }
        return output
      }
      if (node.type === 'hardBreak') return '  \n'
      if (node.type === 'image') {
        const src = safeUrl(textAttr(node.attrs, 'src'))
        return src ? `![${escapeMarkdown(textAttr(node.attrs, 'alt'))}](${src})` : ''
      }
      return inlineMarkdown(node.content)
    })
    .join('')
}

function listMarkdown(node: RichNode, indent = ''): string {
  const ordered = node.type === 'orderedList'
  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : '-'
      const children = item.content ?? []
      const first = children[0]
      const firstLine = first?.type === 'paragraph' ? inlineMarkdown(first.content) : blockMarkdown(first ?? {})
      const rest = children.slice(1).map((child) => blockMarkdown(child, `${indent}${' '.repeat(marker.length + 1)}`)).filter(Boolean)
      return [`${indent}${marker} ${firstLine}`, ...rest].join('\n')
    })
    .join('\n')
}

function blockMarkdown(node: RichNode, indent = ''): string {
  switch (node.type) {
    case 'paragraph':
      return `${indent}${inlineMarkdown(node.content)}`
    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
      return `${indent}${'#'.repeat(Math.max(1, Math.min(6, level)))} ${inlineMarkdown(node.content)}`
    }
    case 'blockquote':
      return (node.content ?? [])
        .map((child) => blockMarkdown(child))
        .filter(Boolean)
        .join('\n\n')
        .split('\n')
        .map((line) => `${indent}> ${line}`.trimEnd())
        .join('\n')
    case 'codeBlock': {
      const language = textAttr(node.attrs, 'language')
      const text = (node.content ?? []).map((child) => child.text ?? '').join('')
      return `${indent}\`\`\`${language}\n${text}\n${indent}\`\`\``
    }
    case 'bulletList':
    case 'orderedList':
      return listMarkdown(node, indent)
    case 'horizontalRule':
      return `${indent}---`
    case 'image':
      return `${indent}${inlineMarkdown([node])}`
    default:
      return (node.content ?? []).map((child) => blockMarkdown(child, indent)).filter(Boolean).join('\n\n')
  }
}

function richTextToMarkdown(content: unknown): string {
  const doc = content as RichNode | null
  if (!doc || !Array.isArray(doc.content)) return ''
  return doc.content.map((node) => blockMarkdown(node)).filter(Boolean).join('\n\n').trim()
}

function inlineHtml(nodes: RichNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'text') {
        let output = escapeHtml(node.text ?? '')
        for (const mark of node.marks ?? []) {
          if (mark.type === 'bold') output = `<strong>${output}</strong>`
          else if (mark.type === 'italic') output = `<em>${output}</em>`
          else if (mark.type === 'strike') output = `<s>${output}</s>`
          else if (mark.type === 'code') output = `<code>${output}</code>`
          else if (mark.type === 'underline') output = `<u>${output}</u>`
          else if (mark.type === 'link') {
            const href = safeUrl(textAttr(mark.attrs, 'href'))
            if (href) output = `<a href="${escapeHtml(href)}">${output}</a>`
          }
        }
        return output
      }
      if (node.type === 'hardBreak') return '<br>'
      if (node.type === 'image') {
        const src = safeUrl(textAttr(node.attrs, 'src'))
        return src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(textAttr(node.attrs, 'alt'))}">` : ''
      }
      return inlineHtml(node.content)
    })
    .join('')
}

function blockHtml(node: RichNode): string {
  switch (node.type) {
    case 'paragraph':
      return `<p>${inlineHtml(node.content)}</p>`
    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
      const safeLevel = Math.max(1, Math.min(6, level))
      return `<h${safeLevel}>${inlineHtml(node.content)}</h${safeLevel}>`
    }
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map(blockHtml).join('')}</blockquote>`
    case 'codeBlock':
      return `<pre><code>${escapeHtml((node.content ?? []).map((child) => child.text ?? '').join(''))}</code></pre>`
    case 'bulletList':
      return `<ul>${(node.content ?? []).map(blockHtml).join('')}</ul>`
    case 'orderedList':
      return `<ol>${(node.content ?? []).map(blockHtml).join('')}</ol>`
    case 'listItem':
      return `<li>${(node.content ?? []).map(blockHtml).join('')}</li>`
    case 'horizontalRule':
      return '<hr>'
    case 'image':
      return `<p>${inlineHtml([node])}</p>`
    default:
      return (node.content ?? []).map(blockHtml).join('')
  }
}

function richTextToHtml(content: unknown): string {
  const doc = content as RichNode | null
  return doc?.content ? doc.content.map(blockHtml).join('') : ''
}

// ---------- Export rendering ----------
function dateStamp(date: Date): string {
  const part = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}`
}

function displayDate(value: number): string {
  const date = new Date(value)
  const part = (number: number): string => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`
}

function safeFileName(value: string, fallback: string): string {
  return value.replace(FS_BAD, '_').replace(/[.\s]+$/g, '').trim() || fallback
}

function noteTitle(note: NoteMeta, fallback: string): string {
  return note.title.trim() || fallback
}

function noteMarkdown(note: NoteMeta, fallback: string): string {
  const content = note.format === 'markdown' && typeof note.content === 'string' ? note.content.trim() : richTextToMarkdown(note.content)
  const title = escapeMarkdown(noteTitle(note, fallback))
  return `# ${title}\n\n> ${displayDate(note.updatedAt)}\n\n---\n\n${content}\n`
}

function noteHtml(note: NoteMeta, fallback: string): string {
  const body = note.format === 'markdown' && typeof note.content === 'string' ? markdown.render(note.content) : richTextToHtml(note.content)
  const title = escapeHtml(noteTitle(note, fallback))
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 17mm 15mm 19mm; }
* { box-sizing: border-box; }
body { color: #211d18; font-family: "Source Han Serif SC", "Noto Serif SC", "Songti SC", Georgia, serif; font-size: 11.5pt; line-height: 1.85; }
article { max-width: 100%; }
h1, h2, h3 { font-family: "Source Han Serif SC", "Noto Serif SC", "Songti SC", Georgia, serif; line-height: 1.35; margin: 1.2em 0 0.55em; page-break-after: avoid; }
h1 { font-size: 25pt; margin: 0; padding-bottom: 0.38em; border-bottom: 1px solid #b5452b; }
h2 { font-size: 18pt; } h3 { font-size: 14pt; }
.meta { margin: 0.7em 0 1.9em; color: #746d63; font: 9.5pt "Segoe UI", sans-serif; letter-spacing: .04em; }
p { margin: 0 0 0.8em; } blockquote { margin: 1.1em 0; padding: 0.6em 1em; border-left: 3px solid #b5452b; background: #fbf2e9; color: #514940; }
ul, ol { padding-left: 1.55em; margin: 0.6em 0 1em; } li { margin: 0.24em 0; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 0.8em 1em; border: 1px solid #ded5c8; background: #f7f2ea; font: 9.5pt Consolas, monospace; line-height: 1.65; }
code { padding: .08em .32em; border-radius: 3px; background: #f5eee5; font-family: Consolas, monospace; font-size: .88em; }
pre code { padding: 0; background: none; } hr { margin: 1.8em 0; border: 0; border-top: 1px solid #ded5c8; }
img { display: block; max-width: 100%; max-height: 220mm; margin: 1.1em auto; border-radius: 4px; } a { color: #9a321f; word-break: break-word; }
table { width: 100%; border-collapse: collapse; margin: 1em 0; } th, td { border: 1px solid #ded5c8; padding: .45em .6em; text-align: left; } th { background: #fbf2e9; }
</style></head><body><article><h1>${title}</h1><p class="meta">${displayDate(note.updatedAt)}</p>${body || '<p></p>'}</article></body></html>`
}

function imageMime(name: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

async function inlineMarkdownImages(source: string, note: NoteMeta, root: string): Promise<string> {
  const allowed = new Set((note.images ?? []).map((image) => basename(image)))
  const replacements = new Map<string, string>()
  for (const image of allowed) {
    const data = await fs.readFile(join(root, IMAGE_DIR, image)).catch(() => null)
    if (data) replacements.set(image, `data:${imageMime(image)};base64,${data.toString('base64')}`)
  }
  return source.replace(IMAGE_URL, (original, rawName: string) => replacements.get(basename(rawName)) ?? original)
}

function relativeMarkdownImages(source: string): string {
  return source.replace(IMAGE_URL, (_original, rawName: string) => `images/${basename(rawName)}`)
}

async function renderPdf(note: NoteMeta, fallback: string): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(noteHtml(note, fallback))}`)
    await win.webContents.executeJavaScript(
      'Promise.all(Array.from(document.images).map((image) => image.complete ? undefined : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve })))'
    )
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

async function writeUnique(root: string, stem: string, extension: string, data: Buffer): Promise<string> {
  let path = join(root, `${stem}.${extension}`)
  let suffix = 2
  while (existsSync(path)) path = join(root, `${stem}-${suffix++}.${extension}`)
  const temp = `${path}.tmp`
  await fs.writeFile(temp, data)
  await fs.rename(temp, path)
  return path
}

async function addImages(entries: ZipEntry[], notes: NoteMeta[], root: string, folder: string): Promise<void> {
  const images = new Set(notes.flatMap((note) => (note.images ?? []).map((image) => basename(image))))
  for (const image of images) {
    const data = await fs.readFile(join(root, IMAGE_DIR, image)).catch(() => null)
    if (data) entries.push({ name: `${folder}/images/${image}`, data, compress: false })
  }
}

async function exportArchive(notes: NoteMeta[], format: ExportFormat, archiveName: string, fallback: string): Promise<ExportResult> {
  try {
    const root = await getRootDir()
    if (!root) return { ok: false, error: 'No storage' }
    if (!notes.length) return { ok: false, error: 'Empty' }
    const folder = safeFileName(archiveName, fallback)
    const extension = format === 'md' ? 'md' : 'pdf'
    const usedNames = new Set<string>()
    const entries: ZipEntry[] = []
    for (const note of notes) {
      const base = safeFileName(noteTitle(note, fallback), fallback)
      let name = base
      let index = 2
      while (usedNames.has(name)) name = `${base} ${index++}`
      usedNames.add(name)
      const data =
        format === 'md'
          ? Buffer.from(relativeMarkdownImages(noteMarkdown(note, fallback)), 'utf-8')
          : await renderPdf(note, fallback)
      entries.push({ name: `${folder}/${name}.${extension}`, data, compress: format === 'md' })
    }
    if (format === 'md') await addImages(entries, notes, root, folder)
    const file = await writeUnique(root, `${folder}-${dateStamp(new Date())}`, 'zip', buildZip(entries))
    return { ok: true, file, count: notes.length }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 导出单条笔记为独立文件；MD 内联图片，保证脱离应用后仍可阅读。 */
export async function exportNote(id: string, format: ExportFormat): Promise<ExportResult> {
  try {
    const root = await getRootDir()
    if (!root) return { ok: false, error: 'No storage' }
    const note = (await listNotes()).find((item) => item.id === id)
    if (!note) return { ok: false, error: 'Not found' }
    const settings = await loadSettings()
    const fallback = settings.language === 'en-US' ? 'Untitled' : '无标题'
    const stem = `${safeFileName(noteTitle(note, fallback), fallback)}-${dateStamp(new Date())}`
    const data =
      format === 'md'
        ? Buffer.from(await inlineMarkdownImages(noteMarkdown(note, fallback), note, root), 'utf-8')
        : await renderPdf(note, fallback)
    const file = await writeUnique(root, stem, format, data)
    return { ok: true, file, count: 1 }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 导出多选笔记为 ZIP，ZIP 内每条笔记都是独立的 MD / PDF 文件。 */
export async function exportNotes(ids: string[], format: ExportFormat, archiveName: string): Promise<ExportResult> {
  const selected = new Set(ids)
  const notes = (await listNotes()).filter((note) => selected.has(note.id))
  const settings = await loadSettings()
  return exportArchive(notes, format, archiveName, settings.language === 'en-US' ? 'Notes' : '笔记')
}

/** 导出笔记本为 ZIP，ZIP 内以笔记本文件夹归类，每条笔记独立成文件。 */
export async function exportNotebook(notebookId: string | null, format: ExportFormat): Promise<ExportResult> {
  const [notes, notebooks, settings] = await Promise.all([listNotes(), listNotebooks(), loadSettings()])
  const en = settings.language === 'en-US'
  const name =
    notebookId === null
      ? en
        ? 'All'
        : '全部'
      : notebooks.find((notebook) => notebook.id === notebookId)?.name || (en ? 'Notebook' : '笔记本')
  return exportArchive(notes.filter((note) => note.notebookId === notebookId), format, name, en ? 'Notes' : '笔记')
}
