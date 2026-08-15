<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Editor, EditorContent, useEditor } from '@tiptap/vue-3'
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
import { useUiStore } from '@/stores/ui'
import { countWords } from '@/utils/text'
import { processImageFile, formatBytes } from '@/utils/compress'
import { formatClock } from '@/utils/format'
import { cleanIpcError } from '@/utils/ipc'
import '@/styles/editor.css'

const props = defineProps<{
  /** 要编辑的笔记 id（由 HomeView 传入，以局部页面形式嵌入主页） */
  noteId: string
}>()

const router = useRouter()
const { t } = useI18n()
const notes = useNotesStore()
const ui = useUiStore()

// 挂载时固化笔记 id（不能从 props 动态取：卸载落盘时组件即将销毁，props 仍可用，保持不变）
const noteId = props.noteId

const title = ref('')
const loading = ref(true)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const savedAt = ref<number | null>(null)
const wordCount = ref(0)
const aiOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

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
    }
  }
})

async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (loading.value || !editor.value) return
  try {
    saveState.value = 'saving'
    await window.api.updateNote(noteId, {
      title: title.value,
      content: editor.value.getJSON()
    })
    notes.syncLocal(noteId, { title: title.value, content: editor.value.getJSON() })
    saveState.value = 'saved'
    savedAt.value = Date.now()
  } catch {
    saveState.value = 'error'
  }
}

function scheduleSave(): void {
  saveState.value = 'saving'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushSave(), 900)
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
    editor.value?.chain().focus().setImage({ src: saved.src, alt: img.fileName }).run()
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

async function goBack(): Promise<void> {
  await flushSave()
  ui.fullscreenEditor = false
  ui.editingNoteId = null
}

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

let unsubWindowHidden: (() => void) | null = null

onMounted(async () => {
  const note = notes.get(noteId) ?? (await window.api.getNote(noteId))
  if (!note) {
    ui.toast('error', 'Note not found')
    ui.editingNoteId = null
    return
  }
  // 返回主页后预览这篇笔记
  ui.selectedNoteId = note.id
  // 从全屏预览进入编辑时收起全屏；每次进入编辑都从非全屏开始
  ui.fullscreenPreview = false
  ui.fullscreenEditor = false
  title.value = note.title
  editor.value?.commands.setContent((note.content as never) ?? { type: 'doc', content: [] })
  wordCount.value = countWords(editor.value?.getJSON() ?? null)
  loading.value = false
  saveState.value = 'saved'
  savedAt.value = note.updatedAt

  editor.value?.on('update', () => {
    wordCount.value = countWords(editor.value?.getJSON() ?? null)
    scheduleSave()
  })

  window.addEventListener('keydown', onKeydown)
  window.addEventListener('inknote:goto-ai-config', gotoAiConfig as EventListener)
  unsubWindowHidden = window.api.onWindowHidden(onWindowHidden)
})

function gotoAiConfig(): void {
  void router.push('/settings/ai')
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('inknote:goto-ai-config', gotoAiConfig as EventListener)
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
    <header class="ed-top">
      <div class="ed-row1">
        <button class="btn-icon ed-back" :data-tip="t('common.back')" @click="goBack">
          <Icon name="arrow-left" :size="17" />
        </button>

        <input
          v-model="title"
          class="ed-title"
          :placeholder="t('editor.untitled')"
          spellcheck="false"
          @input="scheduleSave"
        />

        <div class="ed-status">
          <template v-if="saveState === 'saving'">
            <span class="spinner ed-status-spin" />
            <span>{{ t('editor.saving') }}</span>
          </template>
          <template v-else-if="saveState === 'saved'">
            <Icon name="check" :size="13" class="ed-status-check" />
            <span>{{ t('editor.saved') }}<template v-if="savedAt"> · {{ formatClock(savedAt) }}</template></span>
          </template>
          <template v-else-if="saveState === 'error'">
            <Icon name="warning" :size="13" class="ed-status-err" />
            <span>{{ t('editor.saveFailed') }}</span>
          </template>
          <span class="ed-status-sep">·</span>
          <span>{{ t('editor.words', { n: wordCount }) }}</span>
        </div>

        <button class="btn btn-soft ed-ai" @click="aiOpen = true">
          <Icon name="sparkles" :size="15" />
          {{ t('editor.aiPolish') }}
        </button>
        <button class="btn btn-ghost ed-ai" @click="router.push('/settings/ai')">
          <Icon name="settings" :size="15" />
          {{ t('editor.aiConfig') }}
        </button>
        <button
          class="btn-icon ed-full"
          :data-tip="ui.fullscreenEditor ? t('editor.exitFullscreen') : t('editor.fullscreen')"
          @click="ui.fullscreenEditor = !ui.fullscreenEditor"
        >
          <Icon :name="ui.fullscreenEditor ? 'restore' : 'maximize'" :size="15" />
        </button>
      </div>

      <div class="ed-row2">
        <EditorToolbar :editor="editor as unknown as Editor" @insert-image="pickImage" />
      </div>
    </header>

    <div class="ed-scroll">
      <div class="ed-sheet">
        <EditorContent :editor="editor" class="ed-content" />
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      class="ed-file-input"
      @change="onFileChange"
    />

    <AiPolishPanel :editor="(editor as unknown as Editor)" :open="aiOpen" @close="aiOpen = false" />
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

/* ---------- 全屏编辑（与全屏预览同构：铺满工作区，遮住两侧侧栏） ---------- */
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
.ed-top {
  flex: none;
  padding: 0.9rem 1.6rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.ed-row1 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.ed-back {
  flex: none;
}
.ed-title {
  flex: 1;
  min-width: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--ink);
  background: none;
  padding: 0.2rem 0;
}
.ed-title::placeholder {
  color: var(--ink-3);
}
.ed-status {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.74rem;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ed-status-spin {
  width: 0.8rem;
  height: 0.8rem;
  border-width: 1.5px;
  color: var(--ink-3);
}
.ed-status-check {
  color: var(--ok);
  animation: check-pop 0.3s var(--spring);
}
.ed-status-err {
  color: var(--danger);
}
.ed-status-sep {
  margin: 0 0.15rem;
}
.ed-ai {
  flex: none;
}
.ed-row2 {
  display: flex;
  justify-content: center;
}
.ed-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.1rem 2rem 3.2rem;
}
.ed-sheet {
  /* 默认与预览纸页同宽同高，保证"局部编辑页"观感一致 */
  max-width: 760px;
  margin: 0 auto;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  padding: 3rem 3.6rem 4rem;
  min-height: 56vh;
  animation: fade-up 0.4s var(--ease-out);
  transition: max-width 0.32s var(--ease-out);
}
.ed-file-input {
  display: none;
}
</style>
