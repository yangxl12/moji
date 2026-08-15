import { generateHTML } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { docToText } from './text'

/**
 * 预览渲染：把 TipTap JSON 转成与编辑器排版一致的 HTML。
 * 扩展配置与 EditorView 的 useEditor 保持一致，保证预览所见即编辑所得。
 */
const previewExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] }
  }),
  Underline,
  Image.configure({ inline: false, HTMLAttributes: { draggable: 'false' } }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Link.configure({ openOnClick: false })
]

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 兜底渲染：遇到无法解析的文档时退回纯文本段落 */
function fallbackHtml(content: unknown): string {
  const text = docToText(content)
  if (!text) return ''
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.replace(/\n/g, '<br />'))}</p>`)
    .join('')
}

export function renderNoteHtml(content: unknown): string {
  if (!content || typeof content !== 'object') return ''
  try {
    return generateHTML(content as never, previewExtensions)
  } catch {
    return fallbackHtml(content)
  }
}
