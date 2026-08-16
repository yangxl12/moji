<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface SegOption {
  value: string
  label: string
  icon?: string
}

defineProps<{ options: SegOption[] }>()
const model = defineModel<string>({ required: true })

const root = ref<HTMLElement | null>(null)
const thumbStyle = ref<{ left: string; width: string }>({ left: '3px', width: '0px' })
/**
 * 首次布局完成前关闭滑块过渡：挂载瞬间直接落到目标位置，
 * 避免每次重挂载（切换笔记）滑块都从 0 宽度「弹出」造成抖动。
 */
const ready = ref(false)
let readyRaf = 0

function layout(): void {
  const el = root.value
  if (!el) return
  const items = el.querySelectorAll<HTMLElement>('.seg-item')
  const active = Array.from(items).find((i) => i.dataset.value === model.value)
  const target = active ?? items[0]
  if (target) {
    thumbStyle.value = {
      left: `${target.offsetLeft}px`,
      width: `${target.offsetWidth}px`
    }
  }
}

onMounted(() => {
  layout()
  // 首帧之后再放行过渡动画（此时滑块已按最终位置渲染）
  readyRaf = requestAnimationFrame(() => {
    ready.value = true
  })
  window.addEventListener('resize', layout)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(readyRaf)
  window.removeEventListener('resize', layout)
})

watch(model, () => {
  requestAnimationFrame(layout)
})
</script>

<template>
  <div ref="root" class="seg">
    <div class="seg-thumb" :class="{ ready }" :style="thumbStyle" />
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="seg-item"
      :class="{ active: model === opt.value }"
      :data-value="opt.value"
      @click="model = opt.value"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
