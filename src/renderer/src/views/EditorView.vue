<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Editor, EditorContent, useEditor } from '@tiptap/vue-3'
import type { EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Icon from '@/components/ui/Icon.vue'
import EditorToolbar from '@/components/EditorToolbar.vue'
import AiPolishPanel from '@/components/AiPolishPanel.vue'
import { useNotesStore } from '@/stores/notes'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import type { NoteFormat } from '@shared/types'
import { markdownToText, renderMarkdownSafe, richTextDocToMarkdown } from '@/utils/markdown'
import { useNotebooksStore } from '@/stores/notebooks'
import { useUiStore } from '@/stores/ui'
import { countWords, docToText, textToDoc } from '@/utils/text'
import { processImageFile, formatBytes } from '@/utils/compress'
import { timeAgo, formatDate } from '@/utils/format'
import { cleanIpcError } from '@/utils/ipc'
import '@/styles/editor.css'

const props = defineProps<{
  /** 要显示的笔记 id（编辑即预览：由 HomeView 传入，以笔记页形式嵌入主页） */
  noteId: string
}>()

const router = useRouter()
const { t, locale } = useI18n()
const notes = useNotesStore()
const notebooks = useNotebooksStore()
const ui = useUiStore()

// 挂载时固化笔记 id（不能从 props 动态取：卸载落盘时组件即将销毁，props 仍可用，保持不变）
const noteId = props.noteId

const title = ref('')
const loading = ref(true)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const savedAt = ref<number | null>(null)
const createdAt = ref(0)
const wordCount = ref(0)
const aiOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const format = ref<NoteFormat>('richtext')
const mdContent = ref('')
const mdEditor = ref<InstanceType<typeof MarkdownEditor> | null>(null)
const formatSwitching = ref(false)

const isMarkdown = computed(() => format.value === 'markdown')
const formatOptions = computed(() => [
  { value: 'richtext', label: t('editor.richText') },
  { value: 'markdown', label: t('editor.markdown') }
])
const formatModel = computed({
  get: () => format.value,
  set: (value: string) => {
    if (value === 'richtext' || value === 'markdown') void switchFormat(value)
  }
})

function getAiContent(): string {
  return isMarkdown.value ? mdContent.value : (editor.value ? docToText(editor.value.getJSON()) : '')
}

function replaceAiContent(text: string): void {
  if (isMarkdown.value) {
    mdContent.value = text
    mdEditor.value?.setText(text)
  } else {
    editor.value?.commands.setContent(textToDoc(text) as never)
  }
  scheduleSave()
}

// ---------- 正文右键菜单 ----------
// 选中内容右键：复制 + 全选；未选中右键：仅全选
const ctxMenu = ref<{ x: number; y: number; hasSelection: boolean } | null>(null)
const ctxMenuEl = ref<HTMLElement | null>(null)

// ---------- 返回顶部 ----------
const scrollEl = ref<HTMLElement | null>(null)
const showTopBtn = ref(false)

/** 仅当内容可滚动、且已下滑一段距离后才显示返回顶部按钮 */
function onScroll(): void {
  const el = scrollEl.value
  if (!el) return
  const scrollable = el.scrollHeight - el.clientHeight > 24
  showTopBtn.value = scrollable && el.scrollTop > 320
}

function backToTop(): void {
  scrollEl.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

// ---------- 正文右键菜单 ----------
function closeCtxMenu(): void {
  ctxMenu.value = null
}

/** 打开自定义右键菜单：定位到光标处并钳制在视口内 */
async function openEditorCtxMenu(view: EditorView, event: MouseEvent): Promise<void> {
  event.preventDefault()
  const { from, to } = view.state.selection
  const hasSelection = from < to && view.state.doc.textBetween(from, to, ' ', ' ').length > 0
  ctxMenu.value = { x: event.clientX, y: event.clientY, hasSelection }
  await nextTick()
  const el = ctxMenuEl.value
  if (!el || !ctxMenu.value) return
  const r = el.getBoundingClientRect()
  const margin = 8
  ctxMenu.value = {
    x: Math.max(margin, Math.min(event.clientX, window.innerWidth - r.width - margin)),
    y: Math.max(margin, Math.min(event.clientY, window.innerHeight - r.height - margin)),
    hasSelection
  }
}

/** 复制编辑器内选中的文本：优先 execCommand（保留富文本），失败回退剪贴板 API */
async function copySelectedText(): Promise<boolean> {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return false
  const text = sel.toString()
  if (!text) return false
  try {
    if (document.execCommand('copy')) return true
  } catch {
    // execCommand 不可用时回退剪贴板 API
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 剪贴板 API 被拒绝时视为失败
  }
  return false
}

async function copyFromCtxMenu(): Promise<void> {
  const ok = await copySelectedText()
  closeCtxMenu()
  ui.toast(ok ? 'success' : 'error', t(ok ? 'editor.copySuccess' : 'editor.copyFailed'))
}

function selectAllContent(): void {
  closeCtxMenu()
  editor.value?.chain().focus().selectAll().run()
}

function onDocMousedown(e: MouseEvent): void {
  if (!ctxMenu.value) return
  const target = e.target as Node | null
  if (target && ctxMenuEl.value?.contains(target)) return
  closeCtxMenu()
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

const editor = useEditor({
  content: { type: 'doc', content: [] },
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] }
    }),
    Underline,
    Link.configure({ openOnClick: false }),
    Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { draggable: 'false' } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder: t('editor.placeholder') })
  ],
  editorProps: {
    handlePaste: (_view, event) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length) {
        event.preventDefault()
        files.forEach((f) => void handleImageFile(f))
        return true
      }
      return false
    },
    handleDrop: (_view, event) => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length) {
        event.preventDefault()
        files.forEach((f) => void handleImageFile(f))
        return true
      }
      return false
    },
    // 正文右键：替换原生菜单为自定义「复制 / 全选」菜单
    handleDOMEvents: {
      contextmenu: (view, event) => {
        void openEditorCtxMenu(view, event)
        return true
      }
    },
    handleKeyDown: (view, event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c') return false
      // 有选中文字：交给浏览器原生复制，随后弱提示；无选中：拦截并提示复制失败
      const { from, to } = view.state.selection
      const hasText = from < to && view.state.doc.textBetween(from, to, ' ', ' ').length > 0
      if (!hasText) {
        event.preventDefault()
        ui.toast('error', t('editor.copyFailed'))
        return true
      }
      setTimeout(() => ui.toast('success', t('editor.copySuccess')), 0)
      return false
    }
  }
})

/** 当前编辑器正文内容：富文本取 TipTap JSON，Markdown 取源码字符串 */
function currentContent(): unknown {
  return isMarkdown.value ? mdContent.value : (editor.value?.getJSON() ?? null)
}

  // 上方重复声明已移除

async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (loading.value || (!isMarkdown.value && !editor.value)) return
  // 笔记已被删除（本页删除 / 批量删除后组件卸载落盘），无需再保存
  if (!notes.get(noteId)) return
  try {
    saveState.value = 'saving'
    await window.api.updateNote(noteId, {
      title: title.value,
      content: currentContent(),
        format: format.value
    })
    notes.syncLocal(noteId, { title: title.value, content: currentContent(), format: format.value })
    saveState.value = 'saved'
    savedAt.value = Date.now()
  } catch {
    saveState.value = 'error'
  }
}

function currentContentIsEmpty(): boolean {
  if (isMarkdown.value) return mdContent.value.trim().length === 0
  return editor.value?.isEmpty ?? true
}

async function switchFormat(target: NoteFormat): Promise<void> {
  if (formatSwitching.value || loading.value || target === format.value) return
  formatSwitching.value = true
  try {
    await flushSave()
      if (saveState.value === 'error') throw new Error('save failed')
    if (!notes.get(noteId)) return
    if (!currentContentIsEmpty()) {
      const ok = await ui.confirm({
        title: t('editor.formatSwitchTitle'),
        desc: t('editor.formatSwitchDesc'),
        okText: t('common.confirm')
      })
      if (!ok) return
    }

    if (target === 'markdown') {
      if (!notes.get(noteId)) return
      const doc = editor.value?.getJSON() ?? { type: 'doc', content: [] }
      mdContent.value = richTextDocToMarkdown(doc)
    } else {
      const html = renderMarkdownSafe(mdContent.value)
      editor.value?.commands.setContent(html)
    }

    format.value = target
    await flushSave()
      if (saveState.value === 'error') throw new Error('save failed')
    ui.toast('success', t('editor.formatSwitched'))
  } catch (e) {
      ui.toast('error', `${t('editor.formatSwitchFailed')} · ${cleanIpcError(e)}`)
    } finally {
    formatSwitching.value = false
  }
}

function scheduleSave(): void {
  saveState.value = 'saving'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushSave(), 900)
}

function onMarkdownInput(text: string): void {
  mdContent.value = text
  wordCount.value = countWords(markdownToText(text))
  onScroll()
  scheduleSave()
}

function onMarkdownImageFiles(files: File[]): void {
  for (const file of files) void handleImageFile(file)
}

async function handleImageFile(file: File): Promise<void> {
  const tid = ui.toast('info', t('editor.imageProcessing'), 10000)
  try {
    const img = await processImageFile(file)
    const saved = await window.api.saveImage({
      noteId: noteId,
      name: img.fileName,
      data: img.data
    })
    if (isMarkdown.value) {
        mdEditor.value?.insertImage(saved.src, img.fileName)
      } else {
        editor.value?.chain().focus().setImage({ src: saved.src, alt: img.fileName }).run()
      }
    ui.dismissToast(tid)
    if (img.finalSize < img.originalSize) {
      ui.toast('success', t('editor.imageCompressed', { from: formatBytes(img.originalSize), to: formatBytes(img.finalSize) }))
    } else {
      ui.toast('success', t('editor.imageAdded'))
    }
    scheduleSave()
  } catch (e) {
    ui.dismissToast(tid)
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'too-big') ui.toast('error', t('editor.imageTooBig'))
    else if (msg === 'unsupported') ui.toast('error', t('editor.imageUnsupported'))
    else ui.toast('error', `${t('editor.imageFailed')} · ${cleanIpcError(e)}`)
  }
}

function pickImage(): void {
  fileInput.value?.click()
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void handleImageFile(file)
}

// ---------- 移动笔记 ----------
/** 「移动到全部」的哨兵值（笔记本 id 都是 UUID，不会冲突） */
const ALL_TARGET = 'null'
const moveOpen = ref(false)
const moveTarget = ref('')

const currentNotebookId = computed(() => notes.get(noteId)?.notebookId ?? null)

/** 可选目标：全部（当前不在全部时）+ 其余笔记本 */
const moveTargets = computed(() => {
  const id = currentNotebookId.value
  if (id === null) return notebooks.list
  return notebooks.list.filter((n) => n.id !== id)
})

function openMove(): void {
  moveTarget.value = ''
  moveOpen.value = true
}

async function confirmMove(): Promise<void> {
  const note = notes.get(noteId)
  if (!note || !moveTarget.value) return
  const target = moveTarget.value === ALL_TARGET ? null : moveTarget.value
  moveOpen.value = false
  await notes.move([note.id], target)
  const name = target ? notebooks.list.find((n) => n.id === target)?.name : t('common.all')
  ui.toast('success', t('home.movedToast', { name: name ?? t('common.all') }))
}

async function removeNote(): Promise<void> {
  const note = notes.get(noteId)
  if (!note) return
  const ok = await ui.confirm({
    title: t('home.deleteTitle'),
    desc: t('home.deleteDesc', { n: 1 }),
    okText: t('common.delete'),
    danger: true
  })
  if (!ok) return
  await notes.remove([note.id])
  if (ui.selectedNoteId === note.id) ui.selectedNoteId = null
  ui.toast('success', t('home.deletedToast', { n: 1 }))
}

// ---------- 全局事件 ----------
function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void flushSave()
  }
}

function onWindowHidden(): void {
  // 点击关闭按钮退到托盘前，把未保存内容落盘
  void flushSave()
}

/** 列表内按 Enter：聚焦正文开始书写（编辑即预览） */
function onFocusEditor(): void {
  if (isMarkdown.value) mdEditor.value?.focus()
  else editor.value?.chain().focus().run()
}

function onEsc(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  if (ctxMenu.value) closeCtxMenu()
  if (moveOpen.value) moveOpen.value = false
}

let unsubWindowHidden: (() => void) | null = null

onMounted(async () => {
  const note = notes.get(noteId) ?? (await window.api.getNote(noteId))
  if (!note) {
    ui.toast('error', 'Note not found')
    ui.selectedNoteId = null
    return
  }
  // 主页主区直接展示这篇笔记
  ui.selectedNoteId = note.id
  ui.fullscreenEditor = false
  title.value = note.title
  createdAt.value = note.createdAt
  format.value = note.format === 'markdown' ? 'markdown' : 'richtext'
    if (format.value === 'markdown') {
      mdContent.value = typeof note.content === 'string' ? note.content : ''
    } else {
      editor.value?.commands.setContent((note.content as never) ?? { type: 'doc', content: [] })
    }
    // Markdown 字数在下方统一切换后计算
  wordCount.value = countWords(editor.value?.getJSON() ?? null)
    if (format.value === 'markdown') wordCount.value = countWords(markdownToText(mdContent.value))
  loading.value = false
  saveState.value = 'saved'
  savedAt.value = note.updatedAt
  await nextTick()
  onScroll()

  editor.value?.on('update', () => {
    wordCount.value = countWords(editor.value?.getJSON() ?? null)
    onScroll()
    scheduleSave()
  })

  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keydown', onEsc)
  window.addEventListener('resize', onScroll)
  window.addEventListener('inknote:focus-editor', onFocusEditor as EventListener)
  window.addEventListener('inknote:goto-ai-config', gotoAiConfig as EventListener)
  document.addEventListener('mousedown', onDocMousedown)
  window.addEventListener('scroll', closeCtxMenu, true)
  window.addEventListener('blur', closeCtxMenu)
  unsubWindowHidden = window.api.onWindowHidden(onWindowHidden)
})

function gotoAiConfig(): void {
  void router.push('/settings/ai')
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keydown', onEsc)
  window.removeEventListener('resize', onScroll)
  window.removeEventListener('inknote:focus-editor', onFocusEditor as EventListener)
  window.removeEventListener('inknote:goto-ai-config', gotoAiConfig as EventListener)
  document.removeEventListener('mousedown', onDocMousedown)
  window.removeEventListener('scroll', closeCtxMenu, true)
  window.removeEventListener('blur', closeCtxMenu)
  unsubWindowHidden?.()
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  void flushSave()
})
</script>

<template>
  <div class="editor-page" :class="{ fullscreen: ui.fullscreenEditor }">
    <!-- ---------- 顶部工具区：仅图标，低存在感 ---------- -->
    <header class="ed-top">
      <div class="ed-row1">
        <button class="btn-icon ed-ai ed-ai-accent" :data-tip="t('editor.aiPolish')" @click="aiOpen = true">
          <Icon name="sparkles" :size="16" />
        </button>
        <button class="btn-icon ed-ai" :data-tip="t('editor.aiConfig')" @click="router.push('/settings/ai')">
          <Icon name="bot" :size="16" />
        </button>

          <SegmentedControl v-model="formatModel" :options="formatOptions" class="ed-format-switch" />


        <span class="ed-flex" />

        <button class="btn-icon ed-move" :data-tip="t('editor.moveNote')" @click="openMove">
          <Icon name="move" :size="15" />
        </button>
        <button class="btn-icon ed-delete" :data-tip="t('editor.deleteNote')" @click="removeNote">
          <Icon name="trash" :size="15" />
        </button>

        <span class="ed-sep" />

        <button
          class="btn-icon ed-full"
          :data-tip="ui.fullscreenEditor ? t('editor.exitFullscreen') : t('editor.fullscreen')"
          @click="ui.fullscreenEditor = !ui.fullscreenEditor"
        >
          <Icon :name="ui.fullscreenEditor ? 'restore' : 'maximize'" :size="15" />
        </button>
      </div>

      <div v-if="!isMarkdown" class="ed-row2">
        <EditorToolbar :editor="editor as unknown as Editor" @insert-image="pickImage" />
      </div>
    </header>

    <!-- ---------- 纸页：标题在正文顶部，编辑即预览 ---------- -->
    <div ref="scrollEl" class="ed-scroll" @scroll="onScroll">
      <div class="ed-sheet" :class="{ 'ed-sheet-md': isMarkdown }">
        <input
          v-model="title"
          class="ed-title"
          :placeholder="t('editor.untitled')"
          spellcheck="false"
          @input="scheduleSave"
          @keydown.enter.prevent="onFocusEditor"
        />
        <hr class="ed-rule" />
        <EditorContent v-if="!isMarkdown" :editor="editor" class="ed-content" />
          <MarkdownEditor
            v-else
            ref="mdEditor"
            v-model="mdContent"
            :placeholder="t('markdown.placeholder')"
            @update:model-value="onMarkdownInput"
            @image-files="onMarkdownImageFiles"
            @insert-image="pickImage"
          />

        <!-- 元信息：保存状态 · 编辑/创建时间 · 字数，紧凑一行 -->
        <footer v-if="!loading" class="ed-meta">
          <span class="ed-meta-item">
            <template v-if="saveState === 'saving'">
              <span class="spinner ed-meta-spin" />
              <span>{{ t('editor.saving') }}</span>
            </template>
            <template v-else-if="saveState === 'saved'">
              <Icon name="check" :size="12" class="ed-meta-ok" />
              <span>{{ t('editor.saved') }}</span>
            </template>
            <template v-else-if="saveState === 'error'">
              <Icon name="warning" :size="12" class="ed-meta-err" />
              <span>{{ t('editor.saveFailed') }}</span>
            </template>
          </span>
          <span class="ed-meta-dot">·</span>
          <span class="ed-meta-item">
            <Icon name="clock" :size="12" />
            {{ t('home.edited', { time: timeAgo(savedAt ?? createdAt, locale) }) }}
          </span>
          <span class="ed-meta-dot">·</span>
          <span class="ed-meta-item">
            <Icon name="note" :size="12" />
            {{ t('editor.created', { date: formatDate(createdAt, locale) }) }}
          </span>
          <span class="ed-meta-dot">·</span>
          <span class="ed-meta-item">{{ t('editor.words', { n: wordCount }) }}</span>
        </footer>
      </div>
    </div>

    <!-- ---------- 返回顶部（仅滚动一段距离后出现） ---------- -->
    <Transition name="ed-topfade">
      <button v-if="showTopBtn" class="ed-top-btn" :data-tip="t('editor.backToTop')" @click="backToTop">
        <Icon name="arrow-up" :size="16" />
      </button>
    </Transition>

    <input
      ref="fileInput"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      class="ed-file-input"
      @change="onFileChange"
    />

    <AiPolishPanel
        :editor="(editor as unknown as Editor)"
        :open="aiOpen"
        :format="format"
        :get-content="getAiContent"
        :replace-content="replaceAiContent"
        @close="aiOpen = false"
      />

    <!-- ---------- 正文右键菜单：选中 → 复制/全选；未选中 → 仅全选 ---------- -->
    <Teleport to="body">
      <Transition name="ctx-pop">
        <div
          v-if="ctxMenu"
          ref="ctxMenuEl"
          class="ctx-menu"
          :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
        >
          <button v-if="ctxMenu.hasSelection" class="ctx-item" @mousedown.prevent @click="copyFromCtxMenu">
            <Icon name="copy" :size="15" />
            <span>{{ t('editor.copy') }}</span>
          </button>
          <button class="ctx-item" @mousedown.prevent @click="selectAllContent">
            <Icon name="selectAll" :size="15" />
            <span>{{ t('editor.selectAll') }}</span>
          </button>
        </div>
      </Transition>
    </Teleport>

    <!-- ---------- 移动笔记弹窗 ---------- -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="moveOpen" class="overlay" @mousedown.self="moveOpen = false">
          <div class="modal ed-move-modal" role="dialog" aria-modal="true">
            <h3>{{ t('home.moveTitle') }}</h3>
            <select v-model="moveTarget" class="input ed-move-select">
              <option value="" disabled>{{ t('editor.movePlaceholder') }}</option>
              <option v-if="currentNotebookId" :value="ALL_TARGET">{{ t('common.all') }}</option>
              <option v-for="nb in moveTargets" :key="nb.id" :value="nb.id">{{ nb.name }}</option>
            </select>
            <div class="modal-actions">
              <button class="btn btn-ghost" @click="moveOpen = false">{{ t('common.cancel') }}</button>
              <button class="btn btn-primary" :disabled="!moveTarget" @click="confirmMove">
                {{ t('common.confirm') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.editor-page {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  background:
    radial-gradient(ellipse 70% 40% at 50% -5%, color-mix(in srgb, var(--accent) 4%, transparent), transparent),
    var(--bg);
}

/* ---------- 全屏编辑：铺满工作区，遮住两侧侧栏 ---------- */
.editor-page.fullscreen {
  position: absolute;
  inset: 0;
  z-index: 40;
  background:
    radial-gradient(ellipse 70% 45% at 50% -8%, color-mix(in srgb, var(--accent) 5%, transparent), transparent),
    color-mix(in srgb, var(--bg) 96%, transparent);
  animation: ed-fade-in 0.28s var(--ease-out);
}
@keyframes ed-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.editor-page.fullscreen .ed-sheet {
  max-width: 900px;
}

/* ---------- 顶部工具区：低存在感的单行图标 + 工具栏胶囊 ---------- */
.ed-top {
  flex: none;
  padding: 0.7rem 1.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.ed-row1 {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.ed-flex {
  flex: 1;
}
.ed-format-switch {
  flex: none;
  margin: 0 0.6rem;
}
.ed-sep {
  width: 1px;
  height: 1.05rem;
  background: var(--line);
  margin: 0 0.4rem;
  flex: none;
}
/* AI 润色图标带一点朱砂，一眼可辨又不抢戏 */
.ed-ai-accent {
  color: var(--accent);
}
.ed-ai-accent:hover {
  background: var(--accent-soft);
  color: var(--accent);
}
.ed-delete:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.ed-row2 {
  display: flex;
  justify-content: center;
}

/* ---------- 滚动区与纸页 ---------- */
.ed-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.9rem 1.8rem 2.6rem;
}
.ed-sheet {
  max-width: 760px;
  margin: 0 auto;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  padding: 2.2rem 2.9rem 2.4rem;
  animation: fade-up 0.4s var(--ease-out);
  transition: max-width 0.32s var(--ease-out);
}
.ed-sheet-md {
  max-width: 1180px;
}
@media (max-width: 1240px) {
  .ed-sheet-md {
.editor-page.fullscreen .ed-sheet.ed-sheet-md {
  max-width: 1180px;
}
    max-width: 100%;
  }
}

/* ---------- 纸页内标题：位于正文区域顶部 ---------- */
.ed-title {
  display: block;
  width: 100%;
  font-family: var(--font-display);
  font-size: 1.62rem;
  font-weight: 700;
  line-height: 1.42;
  letter-spacing: 0.03em;
  color: var(--ink);
  background: none;
  padding: 0.1rem 0;
  word-break: break-word;
}
.ed-title::placeholder {
  color: var(--ink-3);
}
.ed-rule {
  border: none;
  border-top: 1px solid var(--line);
  margin: 1.1rem 0 1.5rem;
}

/* ---------- 底部元信息：保存状态 · 时间 · 字数，紧凑一行 ---------- */
.ed-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 2.2rem;
  font-size: 0.74rem;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ed-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
}
.ed-meta-item svg {
  flex: none;
}
.ed-meta-spin {
  width: 0.78rem;
  height: 0.78rem;
  border-width: 1.5px;
  color: var(--ink-3);
}
.ed-meta-ok {
  color: var(--ok);
}
.ed-meta-err {
  color: var(--danger);
}

/* ---------- 返回顶部 ---------- */
.ed-top-btn {
  position: absolute;
  right: 1.5rem;
  bottom: 1.4rem;
  z-index: 6;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-2);
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-1);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  transition: all 0.18s var(--ease);
}
.ed-top-btn:hover {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  transform: translateY(-1px);
  box-shadow: var(--shadow-2);
}
.ed-top-btn:active {
  transform: scale(0.92);
}
.ed-topfade-enter-active {
  transition: opacity 0.2s var(--ease), transform 0.2s var(--ease-out);
}
.ed-topfade-leave-active {
  transition: opacity 0.15s var(--ease), transform 0.15s var(--ease);
}
.ed-topfade-enter-from,
.ed-topfade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.ed-file-input {
  display: none;
}

/* ---------- 正文右键菜单 ---------- */
.ctx-menu {
  position: fixed;
  z-index: 320;
  min-width: 136px;
  padding: 0.4rem;
  border-radius: var(--r);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow-3);
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 2rem;
  padding: 0 0.65rem;
  border-radius: var(--r-sm);
  font-size: 0.82rem;
  color: var(--ink-2);
  text-align: left;
  transition: background 0.12s var(--ease), color 0.12s var(--ease);
}
.ctx-item svg {
  flex: none;
}
.ctx-item:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.ctx-pop-enter-active {
  transition: opacity 0.13s var(--ease), transform 0.13s var(--ease-out);
}
.ctx-pop-leave-active {
  transition: opacity 0.1s var(--ease);
}
.ctx-pop-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(-3px);
}
.ctx-pop-leave-to {
  opacity: 0;
}

/* ---------- 移动弹窗 ---------- */
.ed-move-modal {
  width: min(380px, calc(100vw - 48px));
}
.ed-move-select {
  margin-top: 0.9rem;
  cursor: pointer;
}
.ed-move-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
</style>
