import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/** 应用内 Markdown 渲染器（单例，避免每次输入都重新解析插件配置） */
const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  typographer: false
})

// 外链统一新窗口打开，内部 inkimg 图片链接保持原样
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx]?.attrGet('href') ?? ''
  if (/^(https?:|mailto:)/i.test(href)) {
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener noreferrer')
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}

// 给块级 HTML 注入 data-line，供后续“源码 ↔ 预览”滚动同步使用
md.core.ruler.push('inknote_source_line', (state) => {
  for (const token of state.tokens) {
    if (token.type.endsWith('_open') && token.map) {
      token.attrSet('data-line', String(token.map[0] + 1))
    }
  }
})

const sanitizeConfig = {
  ADD_ATTR: ['target', 'rel', 'data-line'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|inkimg:|data:image\/|#|\/)/i,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button']
}

/** Markdown 源 → 安全的预览 HTML */
export function renderMarkdownSafe(source: string): string {
  if (!source) return ''
  return DOMPurify.sanitize(md.render(source), sanitizeConfig)
}

/** Markdown 源 → 纯文本（用于搜索、摘要、字数统计） */
export function markdownToText(source: string): string {
  if (!source) return ''
  const html = renderMarkdownSafe(source)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const imgText = Array.from(doc.body.querySelectorAll('img'))
    .map((img) => img.getAttribute('alt')?.trim() || ' [图片] ')
    .filter(Boolean)
    .join(' ')
  const text = `${doc.body.textContent ?? ''} ${imgText}`
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface MdNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: MdNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

function escapeMdText(text: string): string {
  const specials = new Set(['\\', '`', '*', '_', '[', ']'])
  let out = ''
  for (const ch of text) out += specials.has(ch) ? `\\${ch}` : ch
  return out
}

function applyMark(text: string, mark: { type: string; attrs?: Record<string, unknown> }): string {
  switch (mark.type) {
    case 'bold':
      return `**${text}**`
    case 'italic':
      return `*${text}*`
    case 'strike':
      return `~~${text}~~`
    case 'underline':
      return `<u>${text}</u>`
    case 'code':
      return `\`${text}\``
    case 'link': {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : ''
      const title = typeof mark.attrs?.title === 'string' ? mark.attrs.title : ''
      return `[${text}](${href}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`
    }
    default:
      return text
  }
}

function inlineToMarkdown(content: MdNode[] | undefined): string {
  if (!content) return ''
  let out = ''
  for (const node of content) {
    if (node.type === 'text') {
      let text = escapeMdText(node.text ?? '')
      for (const mark of node.marks ?? []) text = applyMark(text, mark)
      out += text
    } else if (node.type === 'hardBreak') {
      out += '  \n'
    } else if (node.type === 'image') {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
      const title = typeof node.attrs?.title === 'string' ? node.attrs.title : ''
      out += `![${alt}](${src}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`
    } else if (Array.isArray(node.content)) {
      out += inlineToMarkdown(node.content)
    }
  }
  return out
}

function blockToMarkdown(node: MdNode, indent = ''): string {
  switch (node.type) {
    case 'paragraph':
      return `${indent}${inlineToMarkdown(node.content)}`
    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
      return `${indent}${'#'.repeat(Math.max(1, Math.min(6, level)))} ${inlineToMarkdown(node.content)}`
    }
    case 'blockquote': {
      const inner = (node.content ?? []).map((child) => blockToMarkdown(child)).filter(Boolean).join('\n\n')
      return inner
        .split('\n')
        .map((line) => `${indent}> ${line}`.trimEnd())
        .join('\n')
    }
    case 'codeBlock': {
      const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
      const code = (node.content ?? [])
        .map((child) => child.text ?? '')
        .join('\n')
      return `${indent}\`\`\`${lang}\n${code}\n${indent}\`\`\``
    }
    case 'bulletList':
    case 'orderedList':
      return listToMarkdown(node, indent)
    case 'horizontalRule':
      return `${indent}---`
    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
      return `${indent}![${alt}](${src})`
    }
    default:
      if (Array.isArray(node.content)) {
        return (node.content as MdNode[])
          .map((child) => blockToMarkdown(child, indent))
          .filter(Boolean)
          .join('\n\n')
      }
      return ''
  }
}

function listToMarkdown(node: MdNode, indent = ''): string {
  const ordered = node.type === 'orderedList'
  return (node.content ?? [])
    .map((item, index) => listItemToMarkdown(item, indent, ordered ? `${index + 1}.` : '-'))
    .filter(Boolean)
    .join('\n')
}

function listItemToMarkdown(item: MdNode, indent: string, marker: string): string {
  const content = item.content ?? []
  const continuation = ' '.repeat(marker.length + 1)
  const lines: string[] = []
  let first = true

  for (const child of content) {
    if (child.type === 'paragraph') {
      const prefix = first ? `${indent}${marker} ` : `${indent}${continuation}`
      lines.push(`${prefix}${inlineToMarkdown(child.content)}`)
    } else if (child.type === 'bulletList' || child.type === 'orderedList') {
      lines.push(listToMarkdown(child, `${indent}${continuation}`))
    } else {
      const block = blockToMarkdown(child, `${indent}${continuation}`)
      if (block) lines.push(block)
    }
    first = false
  }

  return lines.join('\n')
}

/** TipTap JSON → Markdown（覆盖当前富文本支持的标题/粗斜体/下划线/删除线/列表/引用/代码/图片/分割线） */
export function richTextDocToMarkdown(doc: unknown): string {
  const root = doc as MdNode | null
  if (!root || !Array.isArray(root.content)) return ''
  return root.content
    .map((block) => blockToMarkdown(block))
    .filter(Boolean)
    .join('\n\n')
    .trim()
}
