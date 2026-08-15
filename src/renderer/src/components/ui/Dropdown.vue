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

const props = withDefaults(defineProps<{ entries: MenuEntry[]; direction?: 'down' | 'up' }>(), {
  direction: 'down'
})
const emit = defineEmits<{ select: [key: string] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const menuStyle = ref<{ left: string; top?: string; bottom?: string }>({ left: '0px' })

/** 用 fixed 定位让菜单脱离侧栏等 overflow 容器的裁切，锚定在触发按钮右缘、向左展开 */
function place(): void {
  const el = root.value
  if (!el) return
  const r = el.getBoundingClientRect()
  if (props.direction === 'up') {
    menuStyle.value = {
      left: `${Math.round(r.right)}px`,
      bottom: `${Math.round(window.innerHeight - r.top + 6)}px`
    }
  } else {
    menuStyle.value = {
      left: `${Math.round(r.right)}px`,
      top: `${Math.round(r.bottom + 6)}px`
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
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
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
    <Transition name="menu-pop">
      <div v-if="open" class="dd-anchor" :style="menuStyle">
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
  </div>
</template>

<style scoped>
.dd-root {
  position: relative;
  display: inline-flex;
}
.dd-anchor {
  position: fixed;
  z-index: 220;
  transform: translateX(-100%);
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
