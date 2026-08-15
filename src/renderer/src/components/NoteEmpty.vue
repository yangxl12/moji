<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import { useNotesStore } from '@/stores/notes'
import { useNotebooksStore } from '@/stores/notebooks'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const notes = useNotesStore()
const notebooks = useNotebooksStore()
const ui = useUiStore()

async function newNote(): Promise<void> {
  const notebookId = notebooks.activeId === 'all' ? null : notebooks.activeId
  const note = await notes.create(notebookId)
  ui.selectNote(note.id)
}
</script>

<template>
  <!-- 主区空状态：没有选中笔记时，邀请选择或新建（编辑即预览，选中即书写） -->
  <section class="ne-empty">
    <div class="ne-glyph">
      <span class="ne-seal">墨</span>
    </div>
    <h3 class="ne-title">
      {{ notes.all.length ? t('home.noPickTitle') : t('home.emptyTitle') }}
    </h3>
    <p class="ne-desc">
      {{ notes.all.length ? t('home.noPickDesc') : t('home.emptyDesc') }}
    </p>
    <button class="btn btn-soft btn-sm ne-new" @click="newNote">
      <Icon name="plus" :size="14" />
      {{ t('sidebar.newNote') }}
    </button>
    <div v-if="notes.all.length" class="ne-hints">
      <span class="kbd">↑</span>
      <span class="kbd">↓</span>
      <span class="ne-hint">{{ t('home.switchHint') }}</span>
    </div>
  </section>
</template>

<style scoped>
.ne-empty {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  gap: 0.4rem;
  background:
    radial-gradient(ellipse 62% 40% at 50% -6%, color-mix(in srgb, var(--accent) 3%, transparent), transparent),
    var(--bg);
  animation: fade-up 0.5s var(--ease-out);
}
.ne-glyph {
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
.ne-glyph::before {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: 36px;
  border: 1px dashed color-mix(in srgb, var(--line-strong) 55%, transparent);
  opacity: 0.6;
}
.ne-seal {
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
  font-size: 1.5rem;
  border-radius: 14px;
  transform: rotate(-4deg);
}
.ne-title {
  font-family: var(--font-display);
  font-size: 1.24rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.ne-desc {
  color: var(--ink-3);
  font-size: 0.84rem;
  max-width: 300px;
  line-height: 1.8;
}
.ne-new {
  margin-top: 1rem;
}
.ne-hints {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 1.4rem;
}
.ne-hint {
  font-size: 0.74rem;
  color: var(--ink-3);
}
</style>
