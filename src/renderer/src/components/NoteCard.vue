<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import type { NoteMeta } from '@shared/types'
import { noteExcerpt } from '@/utils/text'
import { isTruncated } from '@/utils/directives'

const props = defineProps<{
  note: NoteMeta
  index: number
  selectMode: boolean
  selected: boolean
  /** 正在预览的笔记 */
  active?: boolean
}>()

const emit = defineEmits<{ open: []; toggle: [] }>()

const { t } = useI18n()

/** 列表只展示一行标题：无标题时取正文开头文字 */
const title = computed(() => {
  const own = props.note.title.trim()
  if (own) return own
  return noteExcerpt(props.note, 60) || t('common.untitled')
})

/** 仅当标题被裁切显示省略号时才提示完整标题 */
function titleTip(el: HTMLElement): string | null {
  return isTruncated(el) ? title.value : null
}
</script>

<template>
  <article
    class="note-card"
    :class="{ selected, active, 'select-mode': selectMode }"
    :style="{ animationDelay: `${Math.min(index, 12) * 0.02}s` }"
    @click="emit('open')"
  >
    <span class="note-title clamp-1" v-tip="titleTip">{{ title }}</span>
    <button class="note-check" :class="{ checked: selected }" @click.stop="emit('toggle')">
      <Transition name="check-pop">
        <Icon v-if="selected" name="check" :size="12" />
      </Transition>
    </button>
  </article>
</template>

<style scoped>
.note-card {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0.32rem 0.85rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s var(--spring), box-shadow 0.2s var(--ease), border-color 0.2s var(--ease),
    background 0.2s var(--ease);
  animation: fade-up 0.35s var(--ease-out) both;
}
.note-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-1);
  border-color: var(--line-strong);
}
.note-card.select-mode:hover {
  transform: none;
}
.note-card.select-mode {
  cursor: default;
}

/* 正在预览：朱砂侧签 + 淡染纸色，与主侧栏的选中态呼应 */
.note-card.active {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
  background: color-mix(in srgb, var(--accent-soft) 60%, var(--surface));
}
.note-card.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 62%;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}
.note-card.active:hover {
  transform: none;
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
}

.note-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft), var(--shadow-1);
}

.note-title {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-family: var(--font-content);
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.01em;
  padding-right: 1.6rem;
}

.note-check {
  position: absolute;
  top: 50%;
  right: 0.65rem;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  backdrop-filter: blur(4px);
  border: 1.5px solid var(--line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transform: translateY(-50%) scale(0.8);
  transition: opacity 0.18s var(--ease), transform 0.18s var(--spring), background 0.18s var(--ease),
    border-color 0.18s var(--ease);
  z-index: 2;
}
.note-card:hover .note-check,
.note-card.select-mode .note-check {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}
.note-check.checked {
  opacity: 1;
  background: var(--accent);
  border-color: var(--accent);
  transform: translateY(-50%) scale(1);
}
.check-pop-enter-active {
  animation: check-pop 0.25s var(--spring);
}
</style>
