<script setup lang="ts">
import { defineModel, onMounted, ref, watch } from 'vue'

interface SegOption {
  value: string
  label: string
  icon?: string
}

defineProps<{ options: SegOption[] }>()
const model = defineModel<string>({ required: true })

const root = ref<HTMLElement | null>(null)
const thumbStyle = ref<{ left: string; width: string }>({ left: '3px', width: '0px' })

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
  window.addEventListener('resize', layout)
})

watch(model, () => {
  requestAnimationFrame(layout)
})
</script>

<template>
  <div ref="root" class="seg">
    <div class="seg-thumb" :style="thumbStyle" />
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
