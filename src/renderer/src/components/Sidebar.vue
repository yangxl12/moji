<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import { useNotebooksStore } from '@/stores/notebooks'
import { useUiStore } from '@/stores/ui'
import { isTruncated } from '@/utils/directives'
import type { ExportFormat } from '@shared/types'

const { t } = useI18n()
const router = useRouter()
const notebooks = useNotebooksStore()
const ui = useUiStore()

const collapsed = computed(() => ui.sidebarCollapsed)

/** 仅当笔记本名被裁切（省略号 / 折叠隐藏）时才提示完整名称 */
function nbTip(el: HTMLElement, name: string): string | null {
  return isTruncated(el.querySelector('.sb-item-name')) ? name : null
}

const creating = ref(false)
const newName = ref('')
const createInput = ref<HTMLInputElement | null>(null)

const editingId = ref<string | null>(null)
const editName = ref('')
const editInput = ref<HTMLInputElement | null>(null)

// 全局快捷键（Ctrl+Shift+N）与托盘菜单触发的"新建笔记本"请求
watch(
  () => ui.notebookCreateReq,
  (v) => {
    if (v > 0) void beginCreate()
  },
  { immediate: true }
)

async function beginCreate(): Promise<void> {
  // 折叠态下先展开侧栏，再进入命名输入
  if (ui.sidebarCollapsed) ui.toggleSidebar()
  creating.value = true
  newName.value = ''
  await nextTick()
  createInput.value?.focus()
}

// Enter 与 blur 会先后触发 commitCreate，用锁防止同一名称重复提交
let createLock = false

async function commitCreate(): Promise<void> {
  if (!creating.value || createLock) return
  const name = newName.value.trim()
  if (!name) {
    creating.value = false
    return
  }
  createLock = true
  try {
    await notebooks.create(name)
    creating.value = false
  } catch (e) {
    ui.toast('error', e instanceof Error ? e.message : 'Failed')
    newName.value = ''
  } finally {
    createLock = false
  }
}

async function beginRename(id: string): Promise<void> {
  const nb = notebooks.list.find((n) => n.id === id)
  if (!nb) return
  editingId.value = id
  editName.value = nb.name
  await nextTick()
  editInput.value?.focus()
  editInput.value?.select()
}

async function commitRename(): Promise<void> {
  const id = editingId.value
  const name = editName.value.trim()
  editingId.value = null
  if (!id || !name) return
  try {
    await notebooks.rename(id, name)
  } catch (e) {
    ui.toast('error', e instanceof Error ? e.message : 'Failed')
  }
}

async function removeNotebook(id: string): Promise<void> {
  const nb = notebooks.list.find((n) => n.id === id)
  const ok = await ui.confirm({
    title: t('sidebar.deleteTitle'),
    desc: t('sidebar.deleteDesc', { name: nb?.name ?? '' }),
    okText: t('common.delete'),
    danger: true
  })
  if (ok) await notebooks.remove(id)
}

function onNotebookMenu(key: string, id: string): void {
  if (key === 'export-md') void exportNotebook(id, 'md')
  else if (key === 'export-pdf') void exportNotebook(id, 'pdf')
  else if (key === 'rename') void beginRename(id)
  else if (key === 'delete') void removeNotebook(id)
}

// ---------- 笔记本右键菜单（导出） ----------
const ctx = ref<{ x: number; y: number; notebookId: string | null } | null>(null)
const ctxEl = ref<HTMLElement | null>(null)

function closeCtx(): void {
  ctx.value = null
}

/** 打开右键菜单：定位到光标处并钳制在视口内（与编辑器右键菜单行为一致） */
async function openCtx(e: MouseEvent, notebookId: string | null): Promise<void> {
  ctx.value = { x: e.clientX, y: e.clientY, notebookId }
  await nextTick()
  const el = ctxEl.value
  if (!el || !ctx.value) return
  const r = el.getBoundingClientRect()
  const margin = 8
  ctx.value = {
    x: Math.max(margin, Math.min(e.clientX, window.innerWidth - r.width - margin)),
    y: Math.max(margin, Math.min(e.clientY, window.innerHeight - r.height - margin)),
    notebookId
  }
}

/** 导出当前右键目标笔记本（null 表示「全部」）：zip 落在数据目录根 */
async function exportNotebook(id: string | null, format: ExportFormat): Promise<void> {
  closeCtx()
  const res = await window.api.exportNotebook(id, format)
  if (res.ok && res.file) {
    const name = res.file.split(/[\\/]/).pop() ?? res.file
    ui.toast('success', t('sidebar.exportSuccess', { n: res.count ?? 0, file: name }))
  } else if (res.error === 'Empty') {
    ui.toast('info', t('sidebar.exportEmpty'))
  } else {
    ui.toast('error', t('sidebar.exportFailed'))
  }
}

function onCtxOutside(e: MouseEvent): void {
  const target = e.target as Node | null
  if (!target) return
  if (ctxEl.value?.contains(target)) return
  closeCtx()
}
function onCtxEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeCtx()
}
function onCtxScroll(): void {
  closeCtx()
}
function onCtxBlur(): void {
  closeCtx()
}

onMounted(() => {
  document.addEventListener('mousedown', onCtxOutside)
  document.addEventListener('keydown', onCtxEsc)
  document.addEventListener('scroll', onCtxScroll, true)
  window.addEventListener('blur', onCtxBlur)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onCtxOutside)
  document.removeEventListener('keydown', onCtxEsc)
  document.removeEventListener('scroll', onCtxScroll, true)
  window.removeEventListener('blur', onCtxBlur)
})
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <nav class="sb-nav">
      <div class="sb-section">
        <div class="sb-section-head">
          <span v-if="!collapsed" class="sb-section-title">{{ t('sidebar.notebooks') }}</span>
          <button
            v-tip="t('sidebar.newNotebook')"
            class="btn-icon sb-add"
            @click="beginCreate"
          >
            <Icon name="plus" :size="14" />
          </button>
        </div>

        <Transition name="fade">
          <div v-if="creating && !collapsed" class="sb-input-wrap">
            <input
              ref="createInput"
              v-model="newName"
              class="input sb-input"
              :placeholder="t('sidebar.notebookName')"
              @keydown.enter="commitCreate"
              @keydown.esc="creating = false"
              @blur="commitCreate"
            />
          </div>
        </Transition>

        <div class="sb-list">
          <button
            class="sb-item"
            :class="{ active: notebooks.activeId === 'all' }"
            v-tip="{ text: collapsed ? t('common.all') : '', side: 'right' }"
            @click="notebooks.select('all')"
            @contextmenu.prevent="openCtx($event, null)"
          >
            <span class="sb-item-icon"><Icon name="note" :size="15" /></span>
            <span class="sb-item-name" :aria-hidden="collapsed || undefined">{{ t('common.all') }}</span>
          </button>

          <div
            v-for="(nb, i) in notebooks.list"
            :key="nb.id"
            class="sb-item"
            :class="{ active: notebooks.activeId === nb.id }"
            :style="{ animationDelay: `${i * 0.02}s` }"
            v-tip="{ text: (el: HTMLElement) => nbTip(el, nb.name), side: 'right' }"
            @click="notebooks.select(nb.id)"
            @contextmenu.prevent="openCtx($event, nb.id)"
          >
            <template v-if="editingId === nb.id && !collapsed">
              <span class="sb-item-icon"><Icon name="book" :size="15" /></span>
              <input
                ref="editInput"
                v-model="editName"
                class="sb-edit-input"
                @keydown.enter.stop="commitRename"
                @keydown.esc.stop="editingId = null"
                @blur="commitRename"
                @click.stop
              />
            </template>
            <template v-else>
              <span class="sb-item-icon"><Icon name="book" :size="15" /></span>
              <span class="sb-item-name" :aria-hidden="collapsed || undefined" :data-nb-title="nb.id">{{ nb.name }}</span>
              <span v-if="!collapsed" class="sb-more" @click.stop>
                <Dropdown
                  :entries="[
                    { key: 'export-md', label: t('sidebar.exportNotebookMd'), icon: 'download' },
                    { key: 'export-pdf', label: t('sidebar.exportNotebookPdf'), icon: 'download' },
                    { key: 'rename', label: t('common.rename'), icon: 'pencil' },
                    { key: 'delete', label: t('common.delete'), icon: 'trash', danger: true }
                  ]"
                  align="left"
                  :anchor-selector="`[data-nb-title='${nb.id}']`"
                  @select="onNotebookMenu($event, nb.id)"
                >
                  <template #default="{ toggle }">
                    <button class="btn-icon sb-more-btn" @click="toggle"><Icon name="more" :size="14" /></button>
                  </template>
                </Dropdown>
              </span>
            </template>
          </div>
        </div>
      </div>
    </nav>

    <div class="sb-bottom">
      <button class="sb-item sb-settings" @click="router.push('/settings')">
        <span class="sb-item-icon"><Icon name="settings" :size="15" /></span>
      </button>
      <button class="btn-icon sb-collapse" @click="ui.toggleSidebar()">
        <Icon :name="collapsed ? 'chevron-right' : 'chevron-left'" :size="15" />
      </button>
    </div>

    <!-- ---------- 笔记本右键菜单：按格式打包 ZIP（「全部」同样支持） ---------- -->
    <Teleport to="body">
      <Transition name="ctx-pop">
        <div
          v-if="ctx"
          ref="ctxEl"
          class="ctx-menu nb-ctx-menu"
          :style="{ left: `${ctx.x}px`, top: `${ctx.y}px` }"
        >
          <button class="ctx-item" @click="exportNotebook(ctx.notebookId, 'md')">
            <Icon name="download" :size="15" />
            <span>{{ t('sidebar.exportNotebookMd') }}</span>
          </button>
          <button class="ctx-item" @click="exportNotebook(ctx.notebookId, 'pdf')">
            <Icon name="download" :size="15" />
            <span>{{ t('sidebar.exportNotebookPdf') }}</span>
          </button>
        </div>
      </Transition>
    </Teleport>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-w);
  flex: none;
  background: color-mix(in srgb, var(--panel) 82%, var(--bg));
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  padding: 0.9rem 0.55rem 0.85rem;
  gap: 0.6rem;
  min-height: 0;
  transition: width 0.32s var(--ease-out), padding 0.32s var(--ease-out);
}
.sidebar.collapsed {
  width: 64px;
  padding: 0.9rem 0.5rem 0.85rem;
}

.sb-nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  padding-right: 2px;
}
.sb-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  height: 2.2rem;
  padding: 0 0.5rem;
  border-radius: var(--r-sm);
  color: var(--ink-2);
  font-size: 0.8rem;
  transition:
    background 0.15s var(--ease), color 0.15s var(--ease),
    padding 0.32s var(--ease-out), gap 0.32s var(--ease-out);
  position: relative;
  animation: fade-up 0.3s var(--ease-out) both;
  white-space: nowrap;
}
.sidebar.collapsed .sb-item {
  justify-content: flex-start;
  padding: 0;
  gap: 0;
}
.sb-item:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.sb-item.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.sb-item.active::before {
  content: '';
  position: absolute;
  left: -0.55rem;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  border-radius: 3px;
  background: var(--accent);
}
.sidebar.collapsed .sb-item.active::before {
  left: -0.5rem;
}
.sb-item-icon {
  display: inline-flex;
  flex: none;
  /* 折叠时图标平滑滑到轨道中央：轨道内容宽 48px，图标 15px → (48-15)/2 */
  transition: transform 0.32s var(--ease-out);
}
.sidebar.collapsed .sb-item-icon {
  transform: translateX(16.5px);
}
.sb-item-name {
  flex: 1;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 1;
  transition: opacity 0.15s var(--ease), width 0.32s var(--ease-out);
}
.sidebar.collapsed .sb-item-name {
  flex: none;
  width: 0;
  opacity: 0;
}
.sb-section {
  display: flex;
  flex-direction: column;
}
.sb-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.5rem;
  margin-bottom: 0.45rem;
  /* 与二级侧栏头部行等高，保证两侧顶部行水平对齐 */
  min-height: 2rem;
}
/* 折叠时 + 按钮水平居中，替代原标题行 */
.sidebar.collapsed .sb-section-head {
  justify-content: center;
}
.sb-section-title {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--ink-3);
  text-transform: uppercase;
}
.sb-add {
  width: 2rem;
  height: 2rem;
}
.sb-input-wrap {
  margin: 0.1rem 0 0.4rem;
}
.sb-input {
  height: 2rem;
  font-size: 0.8rem;
  padding: 0 0.55rem;
}
.sb-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sb-more {
  /* 常驻占位（visibility 切换）：保证标题宽度稳定，弹窗锚点不随悬停漂移 */
  display: inline-flex;
  visibility: hidden;
  flex: none;
}
.sb-more-btn {
  width: 1.5rem;
  height: 1.5rem;
}
.sb-item:hover .sb-more {
  visibility: visible;
}
.sb-edit-input {
  flex: 1;
  min-width: 0;
  height: 1.7rem;
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 0 0.45rem;
  font-size: 0.78rem;
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.sb-bottom {
  border-top: 1px solid var(--line);
  padding-top: 0.45rem;
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.sb-bottom .sb-settings {
  flex: 1;
  min-width: 0;
}
.sb-collapse {
  width: 1.9rem;
  height: 1.9rem;
  flex: none;
}
.sidebar.collapsed .sb-bottom {
  flex-direction: column;
  gap: 0.4rem;
}
.sidebar.collapsed .sb-bottom .sb-settings {
  flex: none;
  width: 100%;
}
</style>
