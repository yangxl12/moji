<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'

export interface MenuEntry {
  key: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    entries: MenuEntry[]
    direction?: 'down' | 'up'
    /** 展开方向：right=弹层右缘贴锚点右缘向左展开（默认）；left=弹层左缘贴锚点右缘向右展开 */
    align?: 'left' | 'right'
    /** 可选锚点 CSS 选择器：不传则以触发按钮为锚点（弹层仍固定定位，可脱离容器裁切） */
    anchorSelector?: string
  }>(),
  { direction: 'down', align: 'right', anchorSelector: '' }
)
const emit = defineEmits<{ select: [key: string] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuStyle = ref<{ left: string; top?: string; bottom?: string }>({ left: '0px' })

/** 用 fixed 定位让菜单脱离侧栏等 overflow 容器的裁切 */
function place(): void {
  const el = props.anchorSelector
    ? document.querySelector<HTMLElement>(props.anchorSelector)
    : root.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const left = props.align === 'left' ? Math.round(r.right + 6) : Math.round(r.right)
  if (props.direction === 'up') {
    menuStyle.value = {
      left: `${left}px`,
      bottom: `${Math.round(window.innerHeight - r.top + 6)}px`
    }
  } else {
    menuStyle.value = {
      left: `${left}px`,
      top: `${Math.round(props.align === 'left' ? r.top : r.bottom + 6)}px`
    }
  }
}

function toggle(): void {
  open.value = !open.value
  if (open.value) place()
}

function pick(key: string): void {
  open.value = false
  emit('select', key)
}

function onOutside(e: MouseEvent): void {
  const target = e.target as Node | null
  if (!target) return
  // 菜单已 Teleport 到 body，需同时排除触发区与菜单本体
  if (root.value?.contains(target)) return
  if (menuEl.value?.contains(target)) return
  open.value = false
}
function onEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false
}
function onScroll(): void {
  if (open.value) open.value = false
}
function onResize(): void {
  if (open.value) place()
}

onMounted(() => {
  document.addEventListener('mousedown', onOutside)
  document.addEventListener('keydown', onEsc)
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onOutside)
  document.removeEventListener('keydown', onEsc)
  document.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div ref="root" class="dd-root">
    <slot :toggle="toggle" :open="open" />
    <!-- Teleport 到 body：避免 transformed 祖先（如带入场动画的列表行）劫持 fixed 定位 -->
    <Teleport to="body">
      <Transition name="menu-pop">
        <div v-if="open" ref="menuEl" class="dd-anchor" :class="{ 'dd-align-left': align === 'left' }" :style="menuStyle">
          <div class="menu dd-menu">
            <button
              v-for="e in entries"
              :key="e.key"
              class="menu-item"
              :class="{ danger: e.danger }"
              :disabled="e.disabled"
              @click="pick(e.key)"
            >
              <Icon v-if="e.icon" :name="e.icon" :size="15" />
              <span>{{ e.label }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.dd-root {
  position: relative;
  display: inline-flex;
}
.dd-anchor {
  position: fixed;
  /* 下拉菜单可能从多选浮层或右键菜单打开，必须位于它们之上。 */
  z-index: 350;
  transform: translateX(-100%);
}
/* 向右展开：左缘贴锚点右缘，无需回移 */
.dd-anchor.dd-align-left {
  transform: none;
}
.dd-anchor.dd-align-left .dd-menu {
  transform-origin: top left;
}
.dd-menu {
  position: static;
  min-width: 150px;
}
.menu-pop-enter-active,
.menu-pop-leave-active {
  transition: opacity 0.14s var(--ease);
}
.menu-pop-enter-from,
.menu-pop-leave-to {
  opacity: 0;
}
</style>
