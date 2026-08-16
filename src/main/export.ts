import { promises as fs, existsSync } from 'fs'
import { join, basename } from 'path'
import { deflateRawSync } from 'zlib'
import type { ExportResult } from '@shared/types'
import { getRootDir, IMAGE_DIR, listNotebooks, listNotes, loadSettings } from './storage'

// ---------- 极简 ZIP 写入器（零依赖） ----------
// 结构：本地文件头 + 数据 → 中央目录 → 结束记录；文件名 UTF-8（flag 0x0800），
// 文本用 deflateRaw 压缩，图片等已压缩格式原样存储。

interface ZipEntry {
  /** 包内相对路径（UTF-8） */
  name: string
  data: Buffer
  /** false 表示原样存储（图片等）；默认 deflate 压缩 */
  compress?: boolean
}

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

/** 换算 DOS 格式日期时间（本地时区） */
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
    // 本地文件头
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // flag：文件名 UTF-8
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(now.time, 10)
    local.writeUInt16LE(now.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // extra 长度
    locals.push(local, name, payload)
    // 中央目录项
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(now.time, 12)
    central.writeUInt16LE(now.date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(0, 38) // 外部属性
    central.writeUInt32LE(offset, 42) // 本地头偏移
    centrals.push(central, name)
    offset += local.length + name.length + payload.length
  }
  const cdOffset = offset
  const cdSize = centrals.reduce((sum, b) => sum + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // 本盘号
  eocd.writeUInt16LE(0, 6) // 中央目录所在盘号
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdOffset, 16)
  eocd.writeUInt16LE(0, 20) // 注释长度
  return Buffer.concat([...locals, ...centrals, eocd])
}

// ---------- 导出 ----------

/** 文件名不允许的字符（与笔记本命名清洗保持一致） */
const FS_BAD = /[\\/:*?"<>|\u0000-\u001f]/g

function stamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/**
 * 把笔记本的全部笔记（notebookId 为 null 表示「全部」）连同引用图片打包为 zip，
 * 保存到数据目录根，文件名形如「墨记导出-工作-20250115-103000.zip」。
 * zip 内结构：<笔记本名>/notes/<id>.json 与 <笔记本名>/images/<file>。
 */
export async function exportNotebook(notebookId: string | null): Promise<ExportResult> {
  try {
    const root = await getRootDir()
    if (!root) return { ok: false, error: 'No storage' }
    const notes = (await listNotes()).filter((n) => n.notebookId === notebookId)
    if (notes.length === 0) return { ok: false, error: 'Empty' }
    const [notebooks, settings] = await Promise.all([listNotebooks(), loadSettings()])
    const en = settings.language === 'en-US'
    const display =
      notebookId === null
        ? en
          ? 'All'
          : '全部'
        : (notebooks.find((x) => x.id === notebookId)?.name || (en ? 'Notebook' : '笔记本'))
    const folder = display.replace(FS_BAD, '_').trim() || (en ? 'Notebook' : '笔记本')

    const entries: ZipEntry[] = []
    for (const note of notes) {
      entries.push({
        name: `${folder}/notes/${note.id}.json`,
        data: Buffer.from(JSON.stringify(note, null, 2), 'utf-8'),
        compress: true
      })
    }
    // 笔记引用的图片一并打包（去重），保证导出完整可恢复
    const images = new Set<string>()
    for (const note of notes) for (const img of note.images ?? []) images.add(basename(img))
    for (const img of images) {
      const data = await fs.readFile(join(root, IMAGE_DIR, img)).catch(() => null)
      if (data) entries.push({ name: `${folder}/images/${img}`, data, compress: false })
    }

    const buf = buildZip(entries)
    const prefix = en ? 'InkNote-Export' : '墨记导出'
    const base = `${prefix}-${folder}-${stamp(new Date())}`
    let file = join(root, `${base}.zip`)
    let n = 2
    while (existsSync(file)) {
      file = join(root, `${base}-${n}.zip`)
      n++
    }
    const tmp = file + '.tmp'
    await fs.writeFile(tmp, buf)
    await fs.rename(tmp, file)
    return { ok: true, file, count: notes.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
