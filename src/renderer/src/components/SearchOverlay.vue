<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import { useUiStore } from '@/stores/ui'
import { useNotesStore } from '@/stores/notes'
import { useNotebooksStore } from '@/stores/notebooks'
import { noteToText } from '@/utils/text'
import { timeAgo } from '@/utils/format'

const ui = useUiStore()
const notes = useNotesStore()
const notebooks = useNotebooksStore()
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()

const query = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

interface Hit {
  id: string
  title: string
  excerpt: string
  notebookId: string | null
  updatedAt: number
}

const hits = computed<Hit[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  const out: Hit[] = []
  for (const n of notes.all) {
    const title = n.title || t('common.untitled')
    const text = noteToText(n)
    if (title.toLowerCase().includes(q) || text.toLowerCase().includes(q)) {
      let excerpt = text
      const idx = text.toLowerCase().indexOf(q)
      if (idx >= 0) {
        const start = Math.max(0, idx - 30)
        excerpt = (start > 0 ? '…' : '') + text.slice(start, idx + q.length + 70) + (idx + q.length + 70 < text.length ? '…' : '')
      } else {
        excerpt = text.slice(0, 110)
      }
      out.push({ id: n.id, title, excerpt, notebookId: n.notebookId, updatedAt: n.updatedAt })
    }
  }
  return out
})

function highlight(text: string): string[] {
  const q = query.value.trim()
  if (!q) return [text]
  return text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'))
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function notebookName(id: string | null): string {
  if (!id) return t('common.all')
  return notebooks.list.find((n) => n.id === id)?.name ?? t('common.all')
}

function open(id: string): void {
  const note = notes.get(id)
  ui.searchOpen = false
  if (note) {
    // 切到笔记所在笔记本再选中，保证列表里能看到高亮条目
    notebooks.select(note.notebookId ?? 'all')
    ui.selectNote(id)
  }
  if (route.name !== 'home') void router.push('/')
}

function close(): void {
  ui.searchOpen = false
}

watch(
  () => ui.searchOpen,
  async (v) => {
    if (v) {
      query.value = ''
      await nextTick()
      inputEl.value?.focus()
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="ui.searchOpen" class="search-overlay" @mousedown.self="close">
        <div class="search-panel">
          <div class="search-head">
            <Icon name="search" :size="17" class="search-ico" />
            <input
              ref="inputEl"
              v-model="query"
              class="search-input"
              :placeholder="t('search.placeholder')"
              @keydown.esc="close"
              @keydown.enter="hits.length && open(hits[0].id)"
            />
            <span class="kbd">Esc</span>
          </div>

          <div class="search-body">
            <p v-if="!query.trim()" class="search-hint">{{ t('search.hint') }}</p>
            <p v-else-if="hits.length === 0" class="search-none">{{ t('search.noResults') }}</p>
            <template v-else>
              <p class="search-count">{{ t('search.results', { n: hits.length }) }}</p>
              <div class="search-list">
                <button v-for="hit in hits" :key="hit.id" class="search-hit" @click="open(hit.id)">
                  <div class="search-hit-main">
                    <h4 class="search-hit-title clamp-1">
                      <template v-for="(seg, i) in highlight(hit.title)" :key="i">
                        <mark v-if="i % 2 === 1">{{ seg }}</mark>
                        <template v-else>{{ seg }}</template>
                      </template>
                    </h4>
                    <p class="search-hit-excerpt clamp-2">
                      <template v-for="(seg, i) in highlight(hit.excerpt)" :key="i">
                        <mark v-if="i % 2 === 1">{{ seg }}</mark>
                        <template v-else>{{ seg }}</template>
                      </template>
                    </p>
                  </div>
                  <div class="search-hit-side">
                    <span class="search-hit-nb">
                      <Icon name="book" :size="11" />
                      {{ notebookName(hit.notebookId) }}
                    </span>
                    <span class="search-hit-time">{{ timeAgo(hit.updatedAt, locale) }}</span>
                  </div>
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: color-mix(in srgb, var(--bg) 60%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
}
.search-panel {
  width: min(600px, calc(100vw - 64px));
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-3);
  overflow: hidden;
  animation: pop-in 0.28s var(--spring);
}
.search-head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.9rem 1.1rem;
  border-bottom: 1px solid var(--line);
}
.search-ico {
  color: var(--ink-3);
  flex: none;
}
.search-input {
  flex: 1;
  font-size: 1rem;
  color: var(--ink);
  background: none;
}
.search-input::placeholder {
  color: var(--ink-3);
}
.search-body {
  max-height: 46vh;
  overflow-y: auto;
  padding: 0.7rem;
}
.search-hint,
.search-none {
  text-align: center;
  color: var(--ink-3);
  font-size: 0.84rem;
  padding: 2rem 1rem;
}
.search-count {
  font-size: 0.72rem;
  color: var(--ink-3);
  padding: 0.2rem 0.55rem 0.55rem;
  letter-spacing: 0.04em;
}
.search-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.search-hit {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  text-align: left;
  padding: 0.65rem 0.7rem;
  border-radius: var(--r-sm);
  transition: background 0.13s var(--ease);
}
.search-hit:hover {
  background: var(--surface-2);
}
.search-hit-main {
  flex: 1;
  min-width: 0;
}
.search-hit-title {
  font-family: var(--font-content);
  font-size: 0.94rem;
  font-weight: 600;
  margin-bottom: 0.2rem;
}
.search-hit-excerpt {
  font-size: 0.78rem;
  color: var(--ink-2);
  line-height: 1.6;
}
.search-hit mark {
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 600;
}
.search-hit-side {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
}
.search-hit-nb {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.68rem;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-weight: 500;
}
.search-hit-time {
  font-size: 0.68rem;
  color: var(--ink-3);
  white-space: nowrap;
}
</style>
