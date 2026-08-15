/** 从 TipTap JSON 中提取纯文本 */
export function docToText(doc: unknown): string {
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const n = node as { type?: string; text?: string; content?: unknown[] }
    if (typeof n.text === 'string') {
      parts.push(n.text)
      return
    }
    if (n.type === 'hardBreak') {
      parts.push('\n')
      return
    }
    if (n.type === 'image') {
      parts.push(' [图片] ')
      return
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child)
        // 块级节点之间换行
        if (child && typeof child === 'object') {
          const c = child as { type?: string }
          if (c.type === 'paragraph' || c.type === 'heading' || c.type === 'blockquote' || c.type === 'codeBlock') {
            parts.push('\n')
          } else if (c.type === 'listItem') {
            parts.push('\n')
          }
        }
      }
    }
  }
  walk(doc)
  let text = parts.join('')
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return text
}

/** 纯文本 → TipTap 文档 JSON（按空行分段，段内换行转为 hardBreak） */
export function textToDoc(text: string): unknown {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const content = paragraphs.map((p) => {
    const lines = p.split('\n')
    const inner: unknown[] = []
    lines.forEach((line, i) => {
      if (i > 0) inner.push({ type: 'hardBreak' })
      if (line) inner.push({ type: 'text', text: line })
    })
    return { type: 'paragraph', content: inner }
  })

  return { type: 'doc', content }
}

/** 提取卡片摘要（纯文本，截断） */
export function docExcerpt(doc: unknown, max = 110): string {
  const text = docToText(doc)
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

/** 计算字数（中英混合按字符计） */
export function countWords(doc: unknown): number {
  const text = docToText(doc)
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length
  const latin = (text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length
  return cjk + latin
}
