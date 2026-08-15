// 生成托盘图标 resources/tray.png（32×32 朱砂印章风格，纯 Node 实现，无外部依赖）
import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 32

// ---------- CRC32 ----------
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ---------- PNG 编码 ----------
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ---------- 印章图形 ----------
// 圆角矩形 SDF：返回点到圆角矩形边缘的有符号距离
function roundedRectSdf(x, y, cx, cy, half, r) {
  const px = Math.abs(x - cx) - (half - r)
  const py = Math.abs(y - cy) - (half - r)
  const qx = Math.max(px, 0)
  const qy = Math.max(py, 0)
  const inside = Math.min(Math.max(px, py), 0)
  return Math.hypot(qx, qy) + inside - r
}

const VERMILION = [181, 69, 43] // --accent #b5452b
const RING = [253, 246, 236] // --on-accent #fdf6ec

const rgba = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4
    const px = x + 0.5
    const py = y + 0.5
    // 外框圆角矩形：半径 7
    const dOuter = roundedRectSdf(px, py, 16, 16, 15, 7)
    // 内环：外框向内 2.5px 的环带
    const dInner = roundedRectSdf(px, py, 16, 16, 12.5, 5)
    // 中心圆点：印章“字心”
    const dDot = Math.hypot(px - 16, py - 16) - 3.4

    let color = null
    if (dOuter <= 0.5 && dInner >= 1.2) {
      // 边缘 1px 抗锯齿：落在环带
      color = RING
    } else if (dInner <= 0.5 && dDot >= 0.6) {
      color = VERMILION
    } else if (dDot <= 0.5) {
      color = RING
    }

    if (!color) {
      // 抗锯齿：按到最近图形边缘的距离混合
      const candidates = [
        [dOuter, VERMILION],
        [dInner, VERMILION],
        [dDot, RING]
      ]
      let best = 1e9
      let bestColor = null
      for (const [d, c] of candidates) {
        if (d < best) {
          best = d
          bestColor = c
        }
      }
      if (best < 0.8) {
        const a = Math.max(0, Math.min(1, 0.8 - best))
        color = [bestColor[0], bestColor[1], bestColor[2], Math.round(a * 255)]
      }
    }

    if (color) {
      rgba[i] = color[0]
      rgba[i + 1] = color[1]
      rgba[i + 2] = color[2]
      rgba[i + 3] = color.length > 3 ? color[3] : 255
    }
  }
}

const out = join(ROOT, 'resources')
mkdirSync(out, { recursive: true })
const file = join(out, 'tray.png')
writeFileSync(file, encodePng(rgba, SIZE))
console.log('written', file)
