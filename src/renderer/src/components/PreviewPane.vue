<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import { useNotesStore } from '@/stores/notes'
import { useNotebooksStore } from '@/stores/notebooks'
import { useUiStore } from '@/stores/ui'
import { renderNoteHtml } from '@/utils/preview'
import { countWords } from '@/utils/text'
import { timeAgo, formatDate } from '@/utils/format'

const { t, locale } = useI18n()
const router = useRouter()
const notes = useNotesStore()
const notebooks = useNotebooksStore()
const ui = useUiStore()

const scrollEl = ref<HTMLElement | null>(null)

const activeNote = computed(() => {
  const id = ui.selectedNoteId
  return id ? (notes.get(id) ?? null) : null
})

const title = computed(() => (activeNote.value?.title || t('common.untitled')).trim() || t('common.untitled'))
const html = computed(() => renderNoteHtml(activeNote.value?.content ?? null))
const wordCount = computed(() => countWords(activeNote.value?.content ?? null))

// ---------- 移动笔记弹窗 ----------
/** 「移动到全部」的哨兵值（笔记本 id 都是 UUID，不会冲突） */
const ALL_TARGET = 'null'
const moveOpen = ref(false)
const moveTarget = ref('')

/** 可选目标：全部（当前不在全部时）+ 其余笔记本 */
const moveTargets = computed(() => {
  if (!activeNote.value) return []
  return notebooks.list.filter((n) => n.id !== activeNote.value!.notebookId)
})

function openMove(): void {
  moveTarget.value = ''
  moveOpen.value = true
}

async function confirmMove(): Promise<void> {
  const note = activeNote.value
  if (!note || !moveTarget.value) return
  const target = moveTarget.value === ALL_TARGET ? null : moveTarget.value
  moveOpen.value = false
  await notes.move([note.id], target)
  const name = target ? notebooks.list.find((n) => n.id === target)?.name : t('common.all')
  ui.toast('success', t('home.movedToast', { name: name ?? t('common.all') }))
}

async function removeNote(): Promise<void> {
  const note = activeNote.value
  if (!note) return
  const ok = await ui.confirm({
    title: t('home.deleteTitle'),
    desc: t('home.deleteDesc', { n: 1 }),
    okText: t('common.delete'),
    danger: true
  })
  if (!ok) return
  await notes.remove([note.id])
  ui.selectedNoteId = null
  ui.toast('success', t('home.deletedToast', { n: 1 }))
}

function edit(): void {
  if (!activeNote.value) return
  router.push(`/note/${activeNote.value.id}`)
}

function toggleFullscreen(): void {
  ui.fullscreenPreview = !ui.fullscreenPreview
}

/** 预览里的链接：http(s) 交给系统浏览器，其余一律不导航 */
function onContentClick(e: MouseEvent): void {
  const anchor = (e.target as HTMLElement).closest('a')
  if (!anchor) return
  e.preventDefault()
  const href = anchor.getAttribute('href') ?? ''
  if (/^https?:\/\//i.test(href)) window.open(href, '_blank')
}

// 移动弹窗的 Esc 关闭
function onEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape' && moveOpen.value) moveOpen.value = false
}
onMounted(() => document.addEventListener('keydown', onEsc))
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc))

// 切换笔记时回到纸页顶部
watch(
  () => activeNote.value?.id,
  () => {
    if (scrollEl.value) scrollEl.value.scrollTop = 0
  }
)
</script>

<template>
  <section class="preview" :class="{ fullscreen: ui.fullscreenPreview }">
    <!-- ---------- 有笔记：预览 ---------- -->
    <template v-if="activeNote">
      <header class="pv-head">
        <div class="pv-head-actions">
          <button class="btn-icon pv-edit" :data-tip="t('preview.edit')" @click="edit">
            <Icon name="pencil" :size="15" />
          </button>
          <button
            class="btn-icon pv-full"
            :data-tip="ui.fullscreenPreview ? t('preview.exitFullscreen') : t('preview.fullscreen')"
            @click="toggleFullscreen"
          >
            <Icon :name="ui.fullscreenPreview ? 'restore' : 'maximize'" :size="15" />
          </button>
          <button class="btn-icon pv-move" :data-tip="t('preview.move')" @click="openMove">
            <Icon name="move" :size="15" />
          </button>
          <button class="btn-icon pv-delete" :data-tip="t('preview.delete')" @click="removeNote">
            <Icon name="trash" :size="15" />
          </button>
        </div>
      </header>

      <div ref="scrollEl" class="pv-scroll">
        <Transition name="pv-fade" mode="out-in">
          <article :key="activeNote.id" class="pv-sheet">
            <h1 class="pv-title">{{ title }}</h1>

            <hr class="pv-rule" />

            <div class="pv-body">
              <div v-if="html" class="tiptap pv-content" v-html="html" @click="onContentClick" />
              <p v-else class="pv-nocontent">{{ t('preview.noContent') }}</p>
            </div>

            <footer class="pv-meta">
              <span class="pv-meta-item">
                <Icon name="clock" :size="12" />
                {{ t('home.edited', { time: timeAgo(activeNote.updatedAt, locale) }) }}
              </span>
              <span class="pv-meta-dot">·</span>
              <span class="pv-meta-item">
                <Icon name="note" :size="12" />
                {{ t('preview.created', { date: formatDate(activeNote.createdAt, locale) }) }}
              </span>
              <span class="pv-meta-dot">·</span>
              <span class="pv-meta-item">{{ t('editor.words', { n: wordCount }) }}</span>
            </footer>
          </article>
        </Transition>
      </div>
    </template>

    <!-- ---------- 无笔记：空状态 ---------- -->
    <div v-else class="pv-empty">
      <div class="pv-empty-glyph">
        <span class="pv-empty-seal">{{ t('preview.seal') }}</span>
      </div>
      <h3 class="pv-empty-title">
        {{ notes.all.length ? t('preview.emptyTitle') : t('home.emptyTitle') }}
      </h3>
      <p class="pv-empty-desc">
        {{ notes.all.length ? t('preview.emptyDesc') : t('home.emptyDesc') }}
      </p>
      <div v-if="notes.all.length" class="pv-empty-hints">
        <span class="kbd">↑</span>
        <span class="kbd">↓</span>
        <span class="pv-empty-hint">{{ t('preview.emptyHintSwitch') }}</span>
        <span class="pv-empty-sep" />
        <span class="kbd">Enter</span>
        <span class="pv-empty-hint">{{ t('preview.emptyHintEdit') }}</span>
      </div>
    </div>

    <!-- ---------- 移动笔记弹窗 ---------- -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="moveOpen" class="overlay" @mousedown.self="moveOpen = false">
          <div class="modal pv-move-modal" role="dialog" aria-modal="true">
            <h3>{{ t('home.moveTitle') }}</h3>
            <select v-model="moveTarget" class="input pv-move-select">
              <option value="" disabled>{{ t('preview.movePlaceholder') }}</option>
              <option v-if="activeNote?.notebookId" :value="ALL_TARGET">{{ t('common.all') }}</option>
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
  </section>
</template>

<style scoped>
.preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  background:
    radial-gradient(ellipse 62% 40% at 50% -6%, color-mix(in srgb, var(--accent) 3%, transparent), transparent),
    var(--bg);
  transition: background 0.3s var(--ease);
}

/* ---------- 全屏预览 ---------- */
.preview.fullscreen {
  position: absolute;
  inset: 0;
  z-index: 40;
  background:
    radial-gradient(ellipse 70% 45% at 50% -8%, color-mix(in srgb, var(--accent) 5%, transparent), transparent),
    color-mix(in srgb, var(--bg) 96%, transparent);
  animation: pv-fade-in 0.28s var(--ease-out);
}
@keyframes pv-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ---------- 预览头部（右侧纯图标操作） ---------- */
.pv-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  padding: 0.7rem 1.4rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 26%, transparent);
}
.pv-head-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: none;
}
.pv-delete:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

/* ---------- 纸页 ---------- */
.pv-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.6rem 2.2rem 4rem;
}
.pv-sheet {
  position: relative;
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  padding: 3.2rem 3.8rem 0;
  min-height: 56vh;
  transition: max-width 0.32s var(--ease-out);
}
.preview.fullscreen .pv-sheet {
  max-width: 900px;
}
.pv-fade-enter-active {
  animation: fade-up 0.34s var(--ease-out);
}
.pv-fade-leave-active {
  transition: opacity 0.14s var(--ease);
}
.pv-fade-leave-to {
  opacity: 0;
}

.pv-title {
  font-family: var(--font-display);
  font-size: 1.72rem;
  font-weight: 700;
  line-height: 1.42;
  letter-spacing: 0.03em;
  word-break: break-word;
}

/* 正文区域：占据剩余高度，把元信息行压在纸页底部 */
.pv-body {
  flex: 1;
  min-width: 0;
  padding-bottom: 2.4rem;
}

/* 底部固定一行的元信息（编辑/创建时间、字数）：无分割线、无阴影，直接融进纸页 */
.pv-meta {
  position: sticky;
  bottom: 0;
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 1.05rem 0 1.2rem;
  background: var(--surface);
  font-size: 0.74rem;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
}
.pv-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-meta-item svg {
  flex: none;
}
.pv-meta-dot {
  color: var(--ink-3);
}

.pv-rule {
  border: none;
  border-top: 1px solid var(--line);
  margin: 1.35rem 0 1.6rem;
}

/* 预览正文：与编辑器同款排版，但只读 */
.pv-content {
  min-height: 0;
  cursor: default;
  user-select: text;
  -webkit-user-select: text;
}
.pv-content :deep(a) {
  cursor: pointer;
}
.pv-nocontent {
  color: var(--ink-3);
  font-style: italic;
  font-family: var(--font-content);
  font-size: 1.02rem;
  line-height: 2;
  padding: 1.4rem 0;
}

/* ---------- 移动弹窗 ---------- */
.pv-move-modal {
  width: min(380px, calc(100vw - 48px));
}
.pv-move-select {
  margin-top: 0.9rem;
  cursor: pointer;
}
.pv-move-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

/* ---------- 空状态 ---------- */
.pv-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  gap: 0.4rem;
  animation: fade-up 0.5s var(--ease-out);
}
.pv-empty-glyph {
  width: 96px;
  height: 96px;
  border-radius: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--line-strong);
  background: color-mix(in srgb, var(--surface) 55%, transparent);
  margin-bottom: 0.9rem;
  position: relative;
}
.pv-empty-glyph::before {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: 36px;
  border: 1px dashed color-mix(in srgb, var(--line-strong) 55%, transparent);
  opacity: 0.6;
}
.pv-empty-seal {
  width: 54px;
  height: 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--accent) 38%, transparent);
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
  border-radius: 14px;
  transform: rotate(-4deg);
}
.pv-empty-title {
  font-family: var(--font-display);
  font-size: 1.24rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.pv-empty-desc {
  color: var(--ink-3);
  font-size: 0.84rem;
  max-width: 300px;
  line-height: 1.8;
}
.pv-empty-hints {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 1.4rem;
}
.pv-empty-hint {
  font-size: 0.74rem;
  color: var(--ink-3);
}
.pv-empty-sep {
  width: 1px;
  height: 0.9rem;
  background: var(--line);
  margin: 0 0.5rem;
}
</style>
