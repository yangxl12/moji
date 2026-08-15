<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import NoteCard from '@/components/NoteCard.vue'
import { useNotesStore } from '@/stores/notes'
import { useNotebooksStore } from '@/stores/notebooks'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const notes = useNotesStore()
const notebooks = useNotebooksStore()
const ui = useUiStore()

const selectMode = ref(false)
const selected = ref<Set<string>>(new Set())
const bodyEl = ref<HTMLElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const batchEl = ref<HTMLElement | null>(null)
/** 多选浮层的固定定位坐标（锚定在最顶部选中条目的右侧） */
const batchPos = ref({ left: '0px', top: '0px' })

const visibleNotes = computed(() => {
  const active = notebooks.activeId
  const list = notes.byCreatedAt
  if (active === 'all') return list
  return list.filter((n) => n.notebookId === active)
})

/** 顶部行标题：当前所在笔记本名（「全部」不落库，显示通用文案） */
const activeTitle = computed(() => {
  if (notebooks.activeId !== 'all') {
    const nb = notebooks.list.find((n) => n.id === notebooks.activeId)
    if (nb) return nb.name
  }
  return t('common.all')
})

const allSelected = computed(() => visibleNotes.value.length > 0 && selected.value.size === visibleNotes.value.length)

/** 折叠后轨道上的"书脊"字符 */
function spineChar(title: string): string {
  const c = title.trim().charAt(0)
  if (!c) return '·'
  return c.toUpperCase()
}

function toggleNote(id: string): void {
  if (!selectMode.value) selectMode.value = true
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
  if (s.size === 0) exitSelect()
}

function toggleSelectAll(): void {
  if (allSelected.value) {
    selected.value = new Set()
    exitSelect()
  } else {
    selectMode.value = true
    selected.value = new Set(visibleNotes.value.map((n) => n.id))
  }
}

function exitSelect(): void {
  selectMode.value = false
  selected.value = new Set()
}

// ---------- 多选浮层定位 ----------
/** 浮层锚点：列表中最顶部那条被选中的笔记卡片 */
function anchorCard(): HTMLElement | null {
  for (const n of visibleNotes.value) {
    if (!selected.value.has(n.id)) continue
    const el = document.querySelector<HTMLElement>(`[data-note-id="${n.id}"]`)
    if (el) return el
  }
  return null
}

/** 固定定位到锚点条目右侧（垂直居中），并钳制在视口内 */
function updateBatchPos(): void {
  if (!selectMode.value) return
  const bar = batchEl.value
  if (!bar) return
  const card = anchorCard()
  const pane = rootEl.value
  let left: number
  let top: number
  if (card) {
    const r = card.getBoundingClientRect()
    left = r.right + 10
    top = r.top + r.height / 2 - bar.offsetHeight / 2
  } else if (pane) {
    const pr = pane.getBoundingClientRect()
    left = pr.right + 10
    top = pr.top + 8
  } else {
    return
  }
  const margin = 8
  top = Math.max(margin, Math.min(top, window.innerHeight - bar.offsetHeight - margin))
  left = Math.max(margin, Math.min(left, window.innerWidth - bar.offsetWidth - margin))
  batchPos.value = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
}

// 进入多选 / 选中集合变化时重新定位浮层
watch(
  () => selectMode.value,
  async (on) => {
    if (!on) return
    await nextTick()
    updateBatchPos()
  }
)
watch(selected, async () => {
  if (!selectMode.value) return
  await nextTick()
  updateBatchPos()
})

async function deleteSelected(): Promise<void> {
  const ids = [...selected.value]
  const ok = await ui.confirm({
    title: t('home.deleteTitle'),
    desc: t('home.deleteDesc', { n: ids.length }),
    okText: t('common.delete'),
    danger: true
  })
  if (!ok) return
  await notes.remove(ids)
  if (ui.selectedNoteId && ids.includes(ui.selectedNoteId)) ui.selectedNoteId = null
  ui.toast('success', t('home.deletedToast', { n: ids.length }))
  exitSelect()
}

async function moveSelected(target: string | null): Promise<void> {
  const ids = [...selected.value]
  await notes.move(ids, target)
  const name = target ? notebooks.list.find((n) => n.id === target)?.name : t('common.all')
  ui.toast('success', t('home.movedToast', { name: name ?? t('common.all') }))
  exitSelect()
}

function openNote(id: string): void {
  ui.selectNote(id)
}

async function newNote(): Promise<void> {
  if (selectMode.value) exitSelect()
  const notebookId = notebooks.activeId === 'all' ? null : notebooks.activeId
  const note = await notes.create(notebookId)
  ui.selectNote(note.id)
}

function togglePane(): void {
  if (selectMode.value) exitSelect()
  ui.toggleNotesPane()
}

// ---------- 多选浮层外部点击关闭 ----------
// 单击浮层与笔记列表（整个二级侧栏）以外的区域即退出多选；
// Dropdown 菜单已 Teleport 到 body，点击其菜单项不应触发退出
function onDocMousedown(e: MouseEvent): void {
  if (!selectMode.value) return
  const target = e.target as Node | null
  if (!target) return
  if (batchEl.value?.contains(target)) return
  if (rootEl.value?.contains(target)) return
  if (target instanceof Element && target.closest('.dd-anchor')) return
  exitSelect()
}

// ---------- 选中态与列表联动 ----------
// 切笔记本 / 笔记被移走后，若预览对象已不在当前列表则清空，保证预览与列表一致
watch(
  visibleNotes,
  (list) => {
    if (ui.selectedNoteId && !list.some((n) => n.id === ui.selectedNoteId)) ui.selectedNoteId = null
  },
  { immediate: true }
)

// 搜索 / 键盘切换选中后，让对应条目滚入可视区。
// 只用列表容器自身的 scrollTop，避免 scrollIntoView 波及 overflow:hidden 的祖先容器
watch(
  () => ui.selectedNoteId,
  async (id) => {
    if (!id) return
    await nextTick()
    const el = document.querySelector<HTMLElement>(`[data-note-id="${id}"]`)
    const body = bodyEl.value
    if (!el || !body) return
    const bodyTop = body.getBoundingClientRect().top
    const elTop = el.getBoundingClientRect().top - bodyTop + body.scrollTop
    const elBottom = elTop + el.offsetHeight
    if (elTop < body.scrollTop) {
      body.scrollTop = elTop - 8
    } else if (elBottom > body.scrollTop + body.clientHeight) {
      body.scrollTop = elBottom - body.clientHeight + 8
    }
  }
)

// ---------- 键盘交互 ----------
// ↑ ↓ 切换笔记；Enter 聚焦正文（编辑即预览，无需再"进入编辑"）；Esc 退出多选
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (selectMode.value) exitSelect()
    return
  }
  const isNavKey = e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter'
  if (!isNavKey || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
  if (ui.searchOpen || selectMode.value) return
  const ae = document.activeElement
  const tag = ae?.tagName
  // 输入类元素内保留原生行为；按钮获得焦点时仅拦截 Enter（避免点击按钮后按 Enter 双重触发）
  if (ae && ae !== document.body && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (ae as HTMLElement).isContentEditable)) {
    return
  }
  if (e.key === 'Enter' && ae && tag === 'BUTTON') return
  const list = visibleNotes.value
  if (!list.length) return
  e.preventDefault()
  if (e.key === 'Enter') {
    // 通知笔记页聚焦正文（编辑即预览）
    if (ui.selectedNoteId) window.dispatchEvent(new CustomEvent('inknote:focus-editor'))
    return
  }
  const idx = list.findIndex((n) => n.id === ui.selectedNoteId)
  const target =
    idx === -1
      ? e.key === 'ArrowDown'
        ? list[0]
        : list[list.length - 1]
      : e.key === 'ArrowDown'
        ? list[Math.min(idx + 1, list.length - 1)]
        : list[Math.max(idx - 1, 0)]
  if (target) ui.selectNote(target.id)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updateBatchPos)
  document.addEventListener('mousedown', onDocMousedown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updateBatchPos)
  document.removeEventListener('mousedown', onDocMousedown)
})
</script>

<template>
  <aside ref="rootEl" class="notes-pane" :class="{ collapsed: ui.notesCollapsed }">
    <!-- ---------- 顶部行：当前笔记本标题 + 新建笔记 ---------- -->
    <header v-if="!ui.notesCollapsed" class="np-head">
      <h2 class="np-head-title clamp-1">
        <Icon name="book" :size="14" />
        {{ activeTitle }}
      </h2>
      <button class="btn-icon np-head-new sb-new" @click="newNote">
        <Icon name="plus" :size="15" />
      </button>
    </header>

    <!-- ---------- 折叠态：顶部竖直工具条（仅新建 + 分割线） ---------- -->
    <header v-if="ui.notesCollapsed" class="np-head-rail">
      <button class="btn-icon np-rail-new sb-new" @click="newNote">
        <Icon name="plus" :size="15" />
      </button>
      <span class="np-rail-line" />
    </header>

    <!-- ---------- 列表 / 书脊轨道 ---------- -->
    <div ref="bodyEl" class="np-body" @scroll="updateBatchPos">
      <template v-if="!ui.notesCollapsed">
        <div v-if="visibleNotes.length" class="np-list">
          <NoteCard
            v-for="(note, i) in visibleNotes"
            :key="note.id"
            :note="note"
            :index="i"
            :data-note-id="note.id"
            :select-mode="selectMode"
            :selected="selected.has(note.id)"
            :active="ui.selectedNoteId === note.id"
            @open="selectMode ? toggleNote(note.id) : openNote(note.id)"
            @toggle="toggleNote(note.id)"
          />
        </div>

        <div v-else class="empty np-empty">
          <div class="empty-glyph"><Icon name="note" :size="26" /></div>
          <h3>{{ notebooks.activeId === 'all' ? t('home.emptyTitle') : t('home.notebookEmptyTitle') }}</h3>
          <p>{{ t('home.emptyDesc') }}</p>
          <button class="btn btn-soft btn-sm np-empty-new" @click="newNote">
            <Icon name="plus" :size="14" />
            {{ t('sidebar.newNote') }}
          </button>
        </div>
      </template>

      <nav v-else class="np-rail">
        <button
          v-for="note in visibleNotes"
          :key="note.id"
          class="np-spine"
          :class="{ active: ui.selectedNoteId === note.id }"
          :data-note-id="note.id"
          v-tip="{ text: note.title || t('common.untitled'), side: 'right' }"
          @click="openNote(note.id)"
        >
          {{ spineChar(note.title || t('common.untitled')) }}
        </button>
        <p v-if="!visibleNotes.length" class="np-rail-empty">…</p>
      </nav>
    </div>

    <!-- ---------- 底部：搜索图标 + 折叠（与一级侧栏底部同款） ---------- -->
    <footer class="np-foot">
      <button class="np-search-btn" @click="ui.searchOpen = true">
        <Icon name="search" :size="15" />
      </button>
      <button class="btn-icon np-collapse" @click="togglePane">
        <Icon :name="ui.notesCollapsed ? 'chevron-right' : 'chevron-left'" :size="15" />
      </button>
    </footer>

    <!-- ---------- 多选浮层：锚定在最顶部选中条目的右侧 ---------- -->
    <Transition name="batch">
      <div v-if="selectMode" ref="batchEl" class="batch-bar" :style="batchPos">
        <span class="batch-count">
          <Icon name="listCheck" :size="15" />
          {{ t('home.selectedCount', { n: selected.size }) }}
        </span>
        <span class="batch-sep" />
        <button class="batch-btn" @click="toggleSelectAll">
          <Icon :name="allSelected ? 'minus' : 'check'" :size="15" />
          {{ allSelected ? t('home.deselectAll') : t('home.selectAll') }}
        </button>
        <button class="batch-btn" @click="moveSelected(null)">
          <Icon name="note" :size="15" />
          {{ t('common.all') }}
        </button>
        <Dropdown
          direction="down"
          :entries="notebooks.list.map((n) => ({ key: n.id, label: n.name, icon: 'book' }))"
          @select="moveSelected($event)"
        >
          <template #default="{ toggle }">
            <button class="batch-btn" @click="toggle">
              <Icon name="move" :size="15" />
              {{ t('home.moveTo') }}
              <Icon name="chevron-down" :size="13" class="batch-chev" />
            </button>
          </template>
        </Dropdown>
        <span class="batch-sep" />
        <button class="batch-btn batch-danger" @click="deleteSelected">
          <Icon name="trash" :size="15" />
          {{ t('common.delete') }}
        </button>
        <button class="batch-btn batch-exit" @click="exitSelect">
          {{ t('home.exitSelect') }}
        </button>
      </div>
    </Transition>
  </aside>
</template>

<style scoped>
.notes-pane {
  position: relative;
  width: var(--notes-w);
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: color-mix(in srgb, var(--panel) 45%, var(--bg));
  border-right: 1px solid var(--line);
  padding: 0.9rem 0.85rem 0.85rem;
  gap: 0.45rem;
  transition: width 0.3s var(--spring), padding 0.3s var(--spring);
  overflow: hidden;
}
/* 折叠宽度与一级侧栏一致（64px），底部按钮列才能水平对齐 */
.notes-pane.collapsed {
  width: 64px;
  padding: 0.9rem 0.5rem 0.85rem;
}

/* ---------- 顶部行：当前笔记本标题 + 新建 ---------- */
.np-head {
  flex: none;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.np-head-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  font-family: var(--font-display);
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink);
}
.np-head-title svg {
  flex: none;
  color: var(--accent);
}
.np-head-new {
  width: 2rem;
  height: 2rem;
  flex: none;
  background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--accent);
}
.np-head-new:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}

/* ---------- 折叠轨道头部 ---------- */
.np-head-rail {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}
.np-head-rail .btn-icon {
  width: 2rem;
  height: 2rem;
}
.np-rail-line {
  width: 70%;
  height: 1px;
  background: var(--line);
  margin: 0.2rem 0;
}

/* ---------- 列表区 ---------- */
.np-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
}
.np-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.np-empty {
  padding: 3rem 0.5rem;
}
.np-empty .empty-glyph {
  width: 60px;
  height: 60px;
  border-radius: 19px;
  margin-bottom: 0.7rem;
}
.np-empty h3 {
  font-size: 1rem;
}
.np-empty p {
  max-width: 180px;
}
.np-empty-new {
  margin-top: 1rem;
}

/* ---------- 书脊轨道 ---------- */
.np-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0;
}
.np-spine {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink-2);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.88rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  transition: all 0.16s var(--ease);
  animation: fade-up 0.3s var(--ease-out) both;
}
.np-spine:hover {
  background: var(--surface-2);
  color: var(--ink);
  transform: translateY(-1px);
}
.np-spine.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent);
  transform: rotate(-3deg);
}
.np-rail-empty {
  color: var(--ink-3);
  font-size: 0.9rem;
  padding-top: 0.5rem;
}

/* ---------- 底部工具行：与一级侧栏底部同款（条目式图标 + 折叠按钮） ---------- */
.np-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border-top: 1px solid var(--line);
  padding-top: 0.45rem;
}
.np-search-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  height: 2.2rem;
  padding: 0 0.5rem;
  border-radius: var(--r-sm);
  color: var(--ink-2);
  transition: background 0.15s var(--ease), color 0.15s var(--ease);
}
.np-search-btn:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.np-collapse {
  width: 1.9rem;
  height: 1.9rem;
  flex: none;
}
/* 折叠时底部与一级侧栏同构：两枚按钮纵向堆叠、居中 */
.notes-pane.collapsed .np-foot {
  flex-direction: column;
  gap: 0.4rem;
}
.notes-pane.collapsed .np-search-btn {
  flex: none;
  width: 100%;
  justify-content: center;
  padding: 0;
}

/* ---------- 多选浮层：纵向操作菜单，锚定在最顶部选中条目的右侧 ---------- */
.batch-bar {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.15rem;
  min-width: 172px;
  padding: 0.45rem;
  border-radius: var(--r);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow-3);
  transform-origin: left center;
}
/* 指向锚点卡片的小箭头（双层三角模拟描边） */
.batch-bar::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 50%;
  transform: translateY(-50%);
  border: 7px solid transparent;
  border-right-color: var(--line-strong);
  border-left-width: 0;
}
.batch-bar::after {
  content: '';
  position: absolute;
  left: -5px;
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-right-color: var(--surface);
  border-left-width: 0;
}
.batch-count {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  height: 1.9rem;
  padding: 0 0.6rem;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}
.batch-sep {
  height: 1px;
  background: var(--line);
  margin: 0.1rem 0.25rem;
}
.batch-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.35rem;
  width: 100%;
  height: 1.9rem;
  padding: 0 0.65rem;
  border-radius: var(--r-sm);
  font-size: 0.8rem;
  color: var(--ink-2);
  transition: background 0.14s var(--ease), color 0.14s var(--ease);
  white-space: nowrap;
}
.batch-chev {
  margin-left: auto;
}
.batch-btn:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.batch-danger {
  color: var(--danger);
}
.batch-danger:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.batch-exit {
  color: var(--ink-3);
}
.batch-exit:hover {
  color: var(--ink);
}
.batch-enter-active {
  transition: opacity 0.18s var(--ease), transform 0.18s var(--ease-out);
}
.batch-enter-from {
  opacity: 0;
  transform: translateX(-6px);
}
.batch-leave-active {
  transition: opacity 0.16s var(--ease), transform 0.16s var(--ease);
}
.batch-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.96);
}
</style>
