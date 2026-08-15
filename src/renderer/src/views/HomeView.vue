<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Sidebar from '@/components/Sidebar.vue'
import NotesPane from '@/components/NotesPane.vue'
import NoteEmpty from '@/components/NoteEmpty.vue'
import EditorView from '@/views/EditorView.vue'
import SearchOverlay from '@/components/SearchOverlay.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

// 主页快捷键：Ctrl+K 搜索；Esc 退出全屏编辑（多选的 Esc 由 NotesPane 处理）
function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    ui.searchOpen = true
  } else if (e.key === 'Escape') {
    if (ui.fullscreenEditor) ui.fullscreenEditor = false
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="home">
    <Sidebar />
    <NotesPane />
    <!-- 编辑即预览：主区始终显示笔记页（选中即打开，可随时编辑），无选中时显示空状态 -->
    <EditorView v-if="ui.selectedNoteId" :key="ui.selectedNoteId" :note-id="ui.selectedNoteId" />
    <NoteEmpty v-else />
    <SearchOverlay />
  </div>
</template>

<style scoped>
.home {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  background:
    radial-gradient(ellipse 60% 36% at 50% -8%, color-mix(in srgb, var(--accent) 3.5%, transparent), transparent),
    var(--bg);
}
</style>
