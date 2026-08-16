<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import { renderMarkdownSafe } from '@/utils/markdown'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'image-files': [files: File[]]
  'insert-image': []
}>()

const { t } = useI18n()

type MdViewMode = 'split' | 'edit' | 'preview'

// setViewMode 在 viewMode 声明之后定义

const host = ref<HTMLElement | null>(null)
const previewHtml = ref('')
const viewMode = ref<MdViewMode>('split')

function setViewMode(value: string): void {
  viewMode.value = value === 'edit' || value === 'preview' ? value : 'split'
}

let view: EditorView | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null
let renderFrame = 0
const placeholderCompartment = new Compartment()

const viewModeOptions = computed(() => [
  { value: 'split', label: t('markdown.split') },
  { value: 'edit', label: t('markdown.edit') },
  { value: 'preview', label: t('markdown.preview') }
])

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

function wrapSelection(open: string, close: string, sample: string): void {
  if (!view) return
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to) || sample
  const insert = `${open}${selected}${close}`
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true
  })
  view.focus()
}

function prefixLines(prefix: string, matcher: RegExp): void {
  if (!view) return
  const state = view.state
  const start = state.doc.lineAt(state.selection.main.from)
  const end = state.doc.lineAt(state.selection.main.to)
  const lines: number[] = []
  for (let i = start.number; i <= end.number; i++) lines.push(i)

  const allMatch = lines.every((n) => matcher.test(state.doc.line(n).text))
  const changes: Array<{ from: number; to?: number; insert?: string }> = []

  for (const n of lines) {
    const line = state.doc.line(n)
    if (allMatch) {
      const matched = matcher.exec(line.text)?.[0] ?? ''
      if (matched) changes.push({ from: line.from, to: line.from + matched.length })
    } else {
      const matched = matcher.exec(line.text)?.[0] ?? ''
        changes.push({ from: line.from, to: line.from + matched.length, insert: prefix })
    }
  }

  view.dispatch({ changes, selection: { anchor: start.from }, scrollIntoView: true })
  view.focus()
}

function setHeading(level: number): void {
  if (!view) return
  const state = view.state
  const marker = `${'#'.repeat(level)} `
  const start = state.doc.lineAt(state.selection.main.from)
  const end = state.doc.lineAt(state.selection.main.to)
  const lines: number[] = []
  for (let i = start.number; i <= end.number; i++) lines.push(i)

  const allMatch = lines.every((n) => state.doc.line(n).text.startsWith(marker))
  const changes: Array<{ from: number; to?: number; insert?: string }> = []
  for (const n of lines) {
    const line = state.doc.line(n)
    if (allMatch) {
      changes.push({ from: line.from, to: line.from + marker.length })
    } else {
      const text = line.text.replace(/^#{1,6}\s+/, '')
      changes.push({ from: line.from, to: line.to, insert: `${marker}${text}` })
    }
  }

  view.dispatch({ changes, selection: { anchor: start.from }, scrollIntoView: true })
  view.focus()
}

function runAction(action: string): void {
  switch (action) {
    case 'undo':
      if (view) undo(view)
      view?.focus()
      break
    case 'redo':
      if (view) redo(view)
      view?.focus()
      break
    case 'h1':
      setHeading(1)
      break
    case 'h2':
      setHeading(2)
      break
    case 'h3':
      setHeading(3)
      break
    case 'bold':
      wrapSelection('**', '**', t('markdown.bold'))
      break
    case 'italic':
      wrapSelection('*', '*', t('markdown.italic'))
      break
    case 'strike':
      wrapSelection('~~', '~~', t('markdown.strike'))
      break
    case 'code':
      wrapSelection('`', '`', 'code')
      break
    case 'quote':
      prefixLines('> ', /^> ?/)
      break
    case 'bullet':
      prefixLines('- ', /^[-+*] /)
      break
    case 'ordered':
      prefixLines('1. ', /^\d+[.)] /)
      break
    case 'link':
      wrapSelection('[', '](https://)', t('markdown.link'))
      break
    case 'divider':
      wrapSelection('\n\n---\n\n', '', '')
      break
    case 'image':
      emit('insert-image')
      view?.focus()
      break
  }
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

watch(viewMode, async (mode) => {
  if (mode === 'preview') return
  await nextTick()
  view?.requestMeasure()
})

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
  insertImage
})
</script>

<template>
  <div class="md-editor" :class="`md-view-${viewMode}`">
    <div class="md-toolbar">
      <div class="md-tb-group">
        <button class="md-tb-btn" :data-tip="t('toolbar.undo')" @mousedown.prevent @click="runAction('undo')">
          <Icon name="undo" :size="15" />
        </button>
        <button class="md-tb-btn" :data-tip="t('toolbar.redo')" @mousedown.prevent @click="runAction('redo')">
          <Icon name="redo" :size="15" />
        </button>
      </div>
      <span class="md-tb-sep" />
      <div class="md-tb-group">
        <button class="md-tb-btn" :data-tip="t('toolbar.h1')" @mousedown.prevent @click="runAction('h1')">
          <Icon name="h1" :size="15" />
        </button>
        <button class="md-tb-btn" :data-tip="t('toolbar.h2')" @mousedown.prevent @click="runAction('h2')">
          <Icon name="h2" :size="15" />
        </button>
        <button class="md-tb-btn" :data-tip="t('toolbar.h3')" @mousedown.prevent @click="runAction('h3')">
          <Icon name="h3" :size="15" />
        </button>
      </div>
      <span class="md-tb-sep" />
      <div class="md-tb-group">
        <button class="md-tb-btn" :data-tip="t('toolbar.bold')" @mousedown.prevent @click="runAction('bold')">
          <Icon name="bold" :size="15" />
        </button>
        <button class="md-tb-btn" :data-tip="t('toolbar.italic')" @mousedown.prevent @click="runAction('italic')">
          <Icon name="italic" :size="15" />
        </button>
        <button class="md-tb-btn" :data-tip="t('toolbar.strike')" @mousedown.prevent @click="runAction('strike')">
          <Icon name="strike" :size="15" />
        </button>
        <button class="md-tb-btn" :data-tip="t('toolbar.code')" @mousedown.prevent @click="runAction('code')">
          <Icon name="code" :size="15" />
        </button>
      </div>
      <span class="md-tb-sep" />
      <div class="md-tb-group">
        <button class="md-tb-btn" :data-tip="t('toolbar.quote')" @mousedown.prevent @click="runAction('quote')">
          <Icon name="quote" :size="15" />
        </button>
        <button class="md-tb-btn" :data-tip="t('toolbar.bullet')" @mousedown.prevent @click="runAction('bullet')">
          <Icon name="bullet" :size="15" />
        </button>
        <button class="md-tb-btn" :data-tip="t('toolbar.ordered')" @mousedown.prevent @click="runAction('ordered')">
          <Icon name="ordered" :size="15" />
        </button>
      </div>
      <span class="md-tb-sep" />
      <div class="md-tb-group">
        <button class="md-tb-btn" :data-tip="t('markdown.link')" @mousedown.prevent @click="runAction('link')">
          <Icon name="external" :size="15" />
        </button>
        <button class="md-tb-btn" :data-tip="t('toolbar.image')" @mousedown.prevent @click="runAction('image')">
          <Icon name="image" :size="15" />
        </button>
        <button class="md-tb-btn" :data-tip="t('toolbar.divider')" @mousedown.prevent @click="runAction('divider')">
          <Icon name="divider" :size="15" />
        </button>
      </div>
      <span class="md-tb-sep" />
      <div class="seg md-view-seg">
        <button
          v-for="opt in viewModeOptions"
          :key="opt.value"
          type="button"
          class="seg-item"
          :class="{ active: viewMode === opt.value }"
          @click="setViewMode(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div class="md-body">
      <div v-show="viewMode !== 'preview'" ref="host" class="md-source" />
      <div
        v-show="viewMode !== 'edit'"
        class="md-preview tiptap"
        v-html="previewHtml"
        @click="onPreviewClick"
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

/* ---------- Markdown 工具栏：与富文本工具栏保持同一视觉语言 ---------- */
.md-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.22rem;
  padding: 0.38rem 0.7rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-1);
  margin-bottom: 1rem;
}
.md-tb-group {
  display: flex;
  gap: 2px;
}
.md-tb-sep {
  width: 1px;
  height: 1.05rem;
  background: var(--line);
  margin: 0 0.2rem;
  flex: none;
}
.md-tb-btn {
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-2);
  transition: all 0.14s var(--ease);
}
.md-tb-btn:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.md-tb-btn:active {
  transform: scale(0.9);
}
.md-view-seg {
  flex: none;
}

/* ---------- 编辑/预览面板 ---------- */
.md-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 1.6rem;
}
.md-view-split .md-body {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
.md-source {
  min-width: 0;
  min-height: 38vh;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  padding: 0.55rem 0.75rem;
  overflow: hidden;
}
.md-source :deep(.cm-editor) {
  min-height: 36vh;
}
.md-source :deep(.cm-scroller) {
  overflow: visible;
}
.md-preview {
  min-width: 0;
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
  min-height: 38vh;
  user-select: text;
  cursor: default;
}
.md-preview :deep(a) {
  cursor: pointer;
}

@container (max-width: 760px) {
  .md-view-split .md-body {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
