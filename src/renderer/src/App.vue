<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TitleBar from '@/components/TitleBar.vue'
import Toasts from '@/components/ui/Toasts.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useAppStore } from '@/stores/app'
import { useNotesStore } from '@/stores/notes'
import { useNotebooksStore } from '@/stores/notebooks'
import { useUiStore } from '@/stores/ui'
import type { TrayAction } from '@shared/types'

const app = useAppStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

watch(
  () => [t('app.name'), route.name],
  () => {
    document.title = t('app.name')
  },
  { immediate: true }
)

// ---------- 托盘右键菜单文案（随语言同步） ----------
function syncTrayMenu(): void {
  void window.api.setTrayMenu({
    show: t('tray.show'),
    newNote: t('sidebar.newNote'),
    newNotebook: t('sidebar.newNotebook'),
    settings: t('common.settings'),
    quit: t('common.quit'),
    hideHint: t('tray.hideHint')
  })
}
watch(locale, syncTrayMenu, { immediate: true })

// ---------- 新建笔记 / 新建笔记本（快捷键与托盘共用） ----------
async function createNoteAndOpen(): Promise<void> {
  if (!app.storageDir) return
  const notebooks = useNotebooksStore()
  const notes = useNotesStore()
  const notebookId = notebooks.activeId === 'all' ? null : notebooks.activeId
  const note = await notes.create(notebookId)
  if (route.name !== 'home') await router.push('/')
  ui.selectNote(note.id)
}

function requestNewNotebook(): void {
  ui.requestNewNotebook()
  if (route.name !== 'home') void router.push('/')
}

function onTrayAction(action: TrayAction): void {
  if (action === 'new-note') void createNoteAndOpen()
  else if (action === 'new-notebook') requestNewNotebook()
  else if (action === 'settings') void router.push('/settings')
}

// ---------- 全局快捷键 ----------
// Ctrl+N        新建笔记
// Ctrl+Shift+N  新建笔记本
// Ctrl+I        打开设置（编辑器正文内例外：优先保留斜体快捷键）
function isInEditor(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return !!target.closest('.tiptap, .ProseMirror')
}

function onGlobalKeydown(e: KeyboardEvent): void {
  if (e.repeat || !(e.ctrlKey || e.metaKey) || e.altKey) return
  const key = e.key.toLowerCase()
  if (key === 'n' && e.shiftKey) {
    e.preventDefault()
    requestNewNotebook()
  } else if (key === 'n') {
    e.preventDefault()
    void createNoteAndOpen()
  } else if (key === 'i' && !e.shiftKey) {
    if (isInEditor(e.target)) return // 正文内交给 ProseMirror：Ctrl+I = 斜体
    e.preventDefault()
    e.stopPropagation()
    void router.push('/settings')
  }
}

let unsubTray: (() => void) | null = null
onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown, true)
  unsubTray = window.api.onTrayAction(onTrayAction)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown, true)
  unsubTray?.()
})
</script>

<template>
  <div class="app-root">
    <TitleBar v-if="app.ready && app.storageDir && route.name !== 'onboarding'" />
    <div class="app-body">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </div>
    <Toasts />
    <ConfirmDialog />
  </div>
</template>

<style scoped>
.app-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.app-body > * {
  flex: 1;
  min-height: 0;
}
</style>
