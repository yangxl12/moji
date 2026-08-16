<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
  rectangularSelection
} from '@codemirror/view'
import { Compartment, EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab, selectAll as selectAllCmd } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { renderMarkdownSafe } from '@/utils/markdown'
import type { MdViewMode } from '@shared/types'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    /** 由编辑器页统一控制：编辑 / 预览 / 分屏 */
    viewMode?: MdViewMode
  }>(),
  {
    placeholder: '',
    viewMode: 'preview'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'image-files': [files: File[]]
  'insert-image': []
  /** 源码面板 / 预览面板上的右键：交由编辑器页统一弹出「复制 / 全选」菜单 */
  contextmenu: [payload: { x: number; y: number; hasSelection: boolean; origin: 'source' | 'preview' }]
  /** 复制结果（Ctrl+C / 预览面板复制）：true 弹出「复制成功」弱提示，false 提示失败 */
  'copy-result': [success: boolean]
}>()

const host = ref<HTMLElement | null>(null)
const previewEl = ref<HTMLElement | null>(null)
const previewHtml = ref('')

let view: EditorView | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null
let renderFrame = 0
const placeholderCompartment = new Compartment()

const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--ink)',
    backgroundColor: 'transparent',
    fontSize: '0.94rem'
  },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.9',
    caretColor: 'var(--accent)',
    padding: '0.4rem 0'
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--ink-3)',
    border: 'none',
    paddingRight: '0.4rem'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-selectionBackground::selection': {
    backgroundColor: 'var(--accent-soft)'
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)',
    color: 'var(--ink-2)'
  }
})

function renderNow(source: string): void {
  if (renderTimer) {
    clearTimeout(renderTimer)
    renderTimer = null
  }
  cancelAnimationFrame(renderFrame)
  previewHtml.value = renderMarkdownSafe(source)
}

function schedulePreview(source: string): void {
  if (renderTimer) clearTimeout(renderTimer)
  cancelAnimationFrame(renderFrame)
  const delay = source.length > 80000 ? 220 : 90
  renderTimer = setTimeout(() => {
    renderFrame = requestAnimationFrame(() => {
      previewHtml.value = renderMarkdownSafe(source)
    })
  }, delay)
}

function focus(): void {
  view?.focus()
}

function getText(): string {
  return view?.state.doc.toString() ?? props.modelValue
}

function setText(source: string): void {
  if (!view) {
    previewHtml.value = renderMarkdownSafe(source)
    return
  }
  const current = view.state.doc.toString()
  if (source === current) return
  view.dispatch({ changes: { from: 0, to: current.length, insert: source } })
  renderNow(source)
}

function insertImage(src: string, alt = ''): void {
  if (!view) return
  const { from, to } = view.state.selection.main
  const insert = `![${alt}](${src})`
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } })
  view.focus()
}

// ---------- 右键菜单 / 复制（与富文本编辑器行为对齐） ----------
/** 源码面板当前选中的文本（直接取 CodeMirror 状态，比 DOM 选区更可靠） */
function getSelectedText(): string {
  if (!view) return ''
  const sel = view.state.selection.main
  return sel.empty ? '' : view.state.sliceDoc(sel.from, sel.to)
}

function sourceHasSelection(): boolean {
  return getSelectedText().length > 0
}

/** 全选源码并聚焦，便于随后复制 */
function selectAll(): void {
  if (!view) return
  selectAllCmd(view)
  view.focus()
}

/** 全选预览面板的渲染内容（预览模式下右键菜单「全选」） */
function selectAllPreview(): void {
  const el = previewEl.value
  if (!el) return
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  sel.addRange(range)
}

/** 预览面板右键：替换原生菜单，选区仅在预览面板内才算「有选中」 */
function onPreviewContextMenu(e: MouseEvent): void {
  e.preventDefault()
  const el = previewEl.value
  const sel = window.getSelection()
  let hasSelection = false
  if (el && sel && !sel.isCollapsed && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0)
    hasSelection = el.contains(range.commonAncestorContainer) && sel.toString().length > 0
  }
  emit('contextmenu', { x: e.clientX, y: e.clientY, hasSelection, origin: 'preview' })
}

/** 预览面板内 Ctrl+C 复制成功（copy 事件只在有内容被复制时触发） */
function onPreviewCopy(): void {
  emit('copy-result', true)
}

function onPreviewClick(e: MouseEvent): void {
  const target = e.target as Element | null
  const link = target?.closest('a')
  if (!link) return
  const href = link.getAttribute('href') ?? ''
  if (!href || href.startsWith('#')) return
  e.preventDefault()
  if (/^(https?:|mailto:)/i.test(href)) void window.api.openExternal(href).catch(() => undefined)
}

function filesFromEvent(event: Event): File[] {
  const clipboard = (event as ClipboardEvent).clipboardData
  const drag = (event as DragEvent).dataTransfer
  const list = clipboard?.files ?? drag?.files ?? []
  return Array.from(list).filter((f) => f.type.startsWith('image/'))
}

onMounted(() => {
  if (!host.value) return

  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        /* selection match highlighting is optional */
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        bracketMatching(),
        indentOnInput(),
        history(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        /* placeholder is configured through the compartment below */
        placeholderCompartment.of(cmPlaceholder(props.placeholder ?? '')),
        markdown(),
        EditorView.lineWrapping,
        editorTheme,
        EditorView.contentAttributes.of({ spellcheck: 'false', 'aria-label': props.placeholder ?? 'Markdown' }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          const source = update.state.doc.toString()
          emit('update:modelValue', source)
          schedulePreview(source)
        }),
        EditorView.domEventHandlers({
          paste: (event) => {
            const files = filesFromEvent(event)
            if (files.length) {
              event.preventDefault()
              emit('image-files', files)
              return true
            }
            return false
          },
          drop: (event) => {
            const files = filesFromEvent(event)
            if (files.length) {
              event.preventDefault()
              emit('image-files', files)
              return true
            }
            return false
          },
          // 源码面板右键：替换原生菜单为自定义「复制 / 全选」菜单（与富文本一致）
          contextmenu: (event) => {
            event.preventDefault()
            emit('contextmenu', {
              x: event.clientX,
              y: event.clientY,
              hasSelection: sourceHasSelection(),
              origin: 'source'
            })
            return true
          },
          // Ctrl/Cmd+C：有选中交给浏览器原生复制，随后弱提示；无选中拦截并提示失败
          keydown: (event) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c') return false
            if (!sourceHasSelection()) {
              event.preventDefault()
              emit('copy-result', false)
              return true
            }
            setTimeout(() => emit('copy-result', true), 0)
            return false
          }
        })
      ]
    })
  })

  renderNow(props.modelValue)
})

watch(
  () => props.modelValue,
  (value) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
      renderNow(value)
    }
  }
)

watch(
  () => props.placeholder,
  (value) => {
    if (view) view.dispatch({ effects: placeholderCompartment.reconfigure(cmPlaceholder(value ?? '')) })
  }
)

watch(
  () => props.viewMode,
  async (mode) => {
    if (mode === 'preview') return
    // 分屏 / 编辑的列宽变化后让 CodeMirror 重新测量
    await nextTick()
    view?.requestMeasure()
  }
)

onBeforeUnmount(() => {
  if (renderTimer) clearTimeout(renderTimer)
  cancelAnimationFrame(renderFrame)
  view?.destroy()
  view = null
})

defineExpose({
  focus,
  getText,
  setText,
  insertImage,
  getSelectedText,
  selectAll,
  selectAllPreview
})
</script>

<template>
  <div class="md-editor" :class="`md-view-${viewMode}`">
    <div class="md-body">
      <div ref="host" class="md-source" />
      <div
        ref="previewEl"
        class="md-preview tiptap"
        v-html="previewHtml"
        @click="onPreviewClick"
        @contextmenu="onPreviewContextMenu"
        @copy="onPreviewCopy"
      />
    </div>
  </div>
</template>


<style scoped>
.md-editor {
  min-width: 0;
  min-height: 0;
  container-type: inline-size;
}

/* ---------- 编辑 / 预览面板：常驻 DOM，用透明度与网格动画切换 ---------- */
.md-body {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(38vh, auto);
  align-items: start;
  gap: 0;
  transition:
    grid-template-columns 0.32s var(--ease-out),
    gap 0.32s var(--ease-out);
}
.md-source,
.md-preview {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  min-height: 38vh;
  transform-origin: 50% 0;
  transition:
    opacity 0.24s var(--ease),
    transform 0.28s var(--ease-out),
    filter 0.24s var(--ease);
}
.md-source {
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  padding: 0.55rem 0.75rem;
  overflow: hidden;
}
.md-source :deep(.cm-editor) {
  /* 编辑面板与预览面板严格同高（38vh）：抵消源码框自身的 padding + 边框 */
  min-height: calc(38vh - 1.1rem - 2px);
}
.md-source :deep(.cm-scroller) {
  overflow: visible;
}
.md-preview {
  min-width: 0;
  min-height: 38vh;
  user-select: text;
  cursor: default;
}
.md-preview :deep(table) {
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 0.92em;
}
.md-preview :deep(th),
.md-preview :deep(td) {
  border: 1px solid var(--line);
  padding: 0.4rem 0.7rem;
}
.md-preview :deep(th) {
  background: var(--accent-soft);
  font-weight: 700;
}
.md-preview :deep(a) {
  cursor: pointer;
}

/* 分屏：双列平滑展开 */
.md-view-split .md-body {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1.6rem;
}
.md-view-split .md-source {
  grid-column: 1;
  grid-row: 1;
}
.md-view-split .md-preview {
  grid-column: 2;
  grid-row: 1;
}

/* 仅预览：源码面板退场（绝对定位淡出，避免撑高页面） */
.md-view-preview .md-source {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 2;
  opacity: 0;
  transform: translateX(-16px) scale(0.99);
  filter: blur(2px);
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.24s var(--ease),
    transform 0.28s var(--ease-out),
    filter 0.24s var(--ease),
    visibility 0s linear 0.28s;
}

/* 仅编辑：预览面板退场 */
.md-view-edit .md-preview {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 2;
  opacity: 0;
  transform: translateX(16px) scale(0.99);
  filter: blur(2px);
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.24s var(--ease),
    transform 0.28s var(--ease-out),
    filter 0.24s var(--ease),
    visibility 0s linear 0.28s;
}

/* 窄容器内分屏改为上下堆叠 */
@container (max-width: 760px) {
  .md-view-split .md-body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
  }
  .md-view-split .md-source {
    grid-column: 1;
    grid-row: 1;
  }
  .md-view-split .md-preview {
    grid-column: 1;
    grid-row: 2;
  }
}
</style>
