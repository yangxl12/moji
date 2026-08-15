export interface CompressedImage {
  /** base64 数据（不含前缀） */
  data: string
  fileName: string
  originalSize: number
  finalSize: number
  width: number
  height: number
}

const MAX_SIZE = 10 * 1024 * 1024 // 10M
const TARGET = 1.9 * 1024 * 1024 // 2M 以内

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode failed'))
    }
    img.src = url
  })
}

async function toCanvas(img: HTMLImageElement, w: number, h: number, whiteBg: boolean): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  if (whiteBg) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return canvas
}

function canvasToBase64(canvas: HTMLCanvasElement, mime: string, quality: number): string {
  return canvas.toDataURL(mime, quality).split(',')[1] ?? ''
}

function base64ByteLength(b64: string): number {
  return Math.floor((b64.length * 3) / 4)
}

/**
 * 图片处理：>10M 拒绝；>2M 自动压缩到 2M 以内。
 * GIF 与 PNG（含透明通道）优先保留原格式，无法达标时转为 JPEG。
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (!ACCEPTED.includes(file.type)) throw new Error('unsupported')
  const originalSize = file.size
  if (originalSize > MAX_SIZE) throw new Error('too-big')

  const isPng = file.type === 'image/png'
  const isGif = file.type === 'image/gif'
  const needCompress = originalSize > 2 * 1024 * 1024

  if (!needCompress) {
    // 无需压缩：直接使用原文件
    const data = await fileToBase64(file)
    const img = await loadImage(file)
    return {
      data,
      fileName: keepExt(file.name),
      originalSize,
      finalSize: file.size,
      width: img.naturalWidth,
      height: img.naturalHeight
    }
  }

  const img = await loadImage(file)
  const srcW = img.naturalWidth
  const srcH = img.naturalHeight

  // GIF：只压缩静态第一帧为 JPEG（动图超过 2M 的场景极少，保底处理）
  if (isGif) {
    let scale = 1
    let b64 = ''
    for (let attempt = 0; attempt < 6; attempt++) {
      const w = Math.max(1, Math.round(srcW * scale))
      const h = Math.max(1, Math.round(srcH * scale))
      const canvas = await toCanvas(img, w, h, false)
      b64 = canvasToBase64(canvas, 'image/jpeg', Math.max(0.5, 0.85 - attempt * 0.07))
      if (base64ByteLength(b64) < TARGET) break
      scale *= 0.75
    }
    return {
      data: b64,
      fileName: file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg',
      originalSize,
      finalSize: base64ByteLength(b64),
      width: img.naturalWidth,
      height: img.naturalHeight
    }
  }

  // PNG / WebP / JPEG
  if (isPng) {
    // PNG 先尝试保留格式（含透明），逐步缩小
    let scale = 1
    for (let attempt = 0; attempt < 6; attempt++) {
      const w = Math.max(1, Math.round(srcW * scale))
      const h = Math.max(1, Math.round(srcH * scale))
      const canvas = await toCanvas(img, w, h, false)
      const b64 = canvasToBase64(canvas, 'image/png', 1)
      if (base64ByteLength(b64) < TARGET || attempt === 5) {
        return {
          data: b64,
          fileName: keepExt(file.name),
          originalSize,
          finalSize: base64ByteLength(b64),
          width: w,
          height: h
        }
      }
      scale *= 0.72
    }
  }

  // 通用：JPEG 质量迭代
  let quality = 0.9
  let scale = 1
  for (let attempt = 0; attempt < 8; attempt++) {
    const w = Math.max(1, Math.round(srcW * scale))
    const h = Math.max(1, Math.round(srcH * scale))
    const canvas = await toCanvas(img, w, h, !isPng)
    const b64 = canvasToBase64(canvas, 'image/jpeg', quality)
    const size = base64ByteLength(b64)
    if (size < TARGET || attempt === 7) {
      const keepPng = isPng && quality === 0.9 && scale === 1
      return {
        data: b64,
        fileName: keepPng ? keepExt(file.name) : file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg',
        originalSize,
        finalSize: size,
        width: w,
        height: h
      }
    }
    quality = Math.max(0.5, quality - 0.08)
    if (attempt >= 3) scale *= 0.75
  }

  // 理论上到不了这里
  const data = await fileToBase64(file)
  return {
    data,
    fileName: keepExt(file.name),
    originalSize,
    finalSize: file.size,
    width: srcW,
    height: srcH
  }
}

function keepExt(name: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  return ext ? name.replace(/\.[a-z0-9]+$/i, `.${ext}`) : `${name}.png`
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/** 字节数友好格式 */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}M`
  if (n >= 1024) return `${(n / 1024).toFixed(0)}K`
  return `${n}B`
}

/** 读取本地图片文件并压缩（含粘贴/拖拽入口） */
export async function processImageFile(file: File): Promise<CompressedImage> {
  return compressImage(file)
}
