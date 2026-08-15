<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Sidebar from '@/components/Sidebar.vue'
import NotesPane from '@/components/NotesPane.vue'
import PreviewPane from '@/components/PreviewPane.vue'
import EditorView from '@/views/EditorView.vue'
import SearchOverlay from '@/components/SearchOverlay.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

// 主页快捷键：Ctrl+K 搜索；Esc 退出全屏预览 / 全屏编辑（多选的 Esc 由 NotesPane 处理）
function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    ui.searchOpen = true
  } else if (e.key === 'Escape') {
    if (ui.fullscreenEditor) ui.fullscreenEditor = false
    else if (ui.fullscreenPreview) ui.fullscreenPreview = false
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="home">
    <Sidebar />
    <NotesPane />
    <!-- 编辑态：主区显示"局部编辑页"（两侧侧栏保持可见），点击返回回到预览 -->
    <EditorView v-if="ui.editingNoteId" :key="ui.editingNoteId" :note-id="ui.editingNoteId" />
    <PreviewPane v-else />
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
