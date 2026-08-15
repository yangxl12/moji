<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Editor } from '@tiptap/vue-3'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps<{ editor: Editor | null }>()
const emit = defineEmits<{ insertImage: [] }>()
const { t } = useI18n()

interface Btn {
  key: string
  icon: string
  tip: string
  run: () => boolean | void
  active?: () => boolean
  disabled?: () => boolean
  text?: string
}

const groups = computed<Btn[][]>(() => {
  const e = props.editor
  if (!e) return []
  // 注意：tiptap 2.11 的 chain().xxx() 会立即以 dispatch=true 执行命令，
  // 在 computed 里调用 focus() 会在每次重算时把焦点抢回编辑器，
  // 导致标题输入框无法输入。这里只构建链，不放任何带副作用的命令。
  const cmd = e.chain()
  return [
    [
      {
        key: 'undo',
        icon: 'undo',
        tip: t('toolbar.undo'),
        run: () => e.chain().undo().run(),
        disabled: () => !e.can().undo()
      },
      {
        key: 'redo',
        icon: 'redo',
        tip: t('toolbar.redo'),
        run: () => e.chain().redo().run(),
        disabled: () => !e.can().redo()
      }
    ],
    [
      {
        key: 'h1',
        icon: 'h1',
        tip: t('toolbar.h1'),
        run: () => cmd.toggleHeading({ level: 1 }).run(),
        active: () => e.isActive('heading', { level: 1 })
      },
      {
        key: 'h2',
        icon: 'h2',
        tip: t('toolbar.h2'),
        run: () => cmd.toggleHeading({ level: 2 }).run(),
        active: () => e.isActive('heading', { level: 2 })
      },
      {
        key: 'h3',
        icon: 'h3',
        tip: t('toolbar.h3'),
        run: () => cmd.toggleHeading({ level: 3 }).run(),
        active: () => e.isActive('heading', { level: 3 })
      }
    ],
    [
      {
        key: 'bold',
        icon: 'bold',
        tip: t('toolbar.bold'),
        run: () => cmd.toggleBold().run(),
        active: () => e.isActive('bold')
      },
      {
        key: 'italic',
        icon: 'italic',
        tip: t('toolbar.italic'),
        run: () => cmd.toggleItalic().run(),
        active: () => e.isActive('italic')
      },
      {
        key: 'underline',
        icon: 'underline',
        tip: t('toolbar.underline'),
        run: () => cmd.toggleUnderline().run(),
        active: () => e.isActive('underline')
      },
      {
        key: 'strike',
        icon: 'strike',
        tip: t('toolbar.strike'),
        run: () => cmd.toggleStrike().run(),
        active: () => e.isActive('strike')
      }
    ],
    [
      {
        key: 'bullet',
        icon: 'bullet',
        tip: t('toolbar.bullet'),
        run: () => cmd.toggleBulletList().run(),
        active: () => e.isActive('bulletList')
      },
      {
        key: 'ordered',
        icon: 'ordered',
        tip: t('toolbar.ordered'),
        run: () => cmd.toggleOrderedList().run(),
        active: () => e.isActive('orderedList')
      },
      {
        key: 'quote',
        icon: 'quote',
        tip: t('toolbar.quote'),
        run: () => cmd.toggleBlockquote().run(),
        active: () => e.isActive('blockquote')
      },
      {
        key: 'code',
        icon: 'code',
        tip: t('toolbar.code'),
        run: () => cmd.toggleCodeBlock().run(),
        active: () => e.isActive('codeBlock')
      }
    ],
    [
      {
        key: 'alignLeft',
        icon: 'alignLeft',
        tip: t('toolbar.alignLeft'),
        run: () => cmd.setTextAlign('left').run(),
        active: () => e.isActive({ textAlign: 'left' })
      },
      {
        key: 'alignCenter',
        icon: 'alignCenter',
        tip: t('toolbar.alignCenter'),
        run: () => cmd.setTextAlign('center').run(),
        active: () => e.isActive({ textAlign: 'center' })
      },
      {
        key: 'alignRight',
        icon: 'alignRight',
        tip: t('toolbar.alignRight'),
        run: () => cmd.setTextAlign('right').run(),
        active: () => e.isActive({ textAlign: 'right' })
      }
    ],
    [
      {
        key: 'divider',
        icon: 'divider',
        tip: t('toolbar.divider'),
        run: () => cmd.setHorizontalRule().run()
      },
      {
        key: 'image',
        icon: 'image',
        tip: t('toolbar.image'),
        run: () => emit('insertImage')
      },
      {
        key: 'clear',
        icon: 'refresh',
        tip: t('toolbar.clearFormat'),
        run: () => cmd.unsetAllMarks().clearNodes().run()
      }
    ]
  ]
})
</script>

<template>
  <div class="ed-toolbar">
    <template v-for="(group, gi) in groups" :key="gi">
      <div v-if="gi > 0" class="ed-tb-sep" />
      <div class="ed-tb-group">
        <button
          v-for="b in group"
          :key="b.key"
          class="ed-tb-btn"
          :class="{ active: b.active?.() }"
          :disabled="b.disabled?.()"
          :data-tip="b.tip"
          @mousedown.prevent
          @click="b.run()"
        >
          <Icon :name="b.icon" :size="16" />
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ed-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.22rem;
  padding: 0.38rem 0.7rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-1);
  width: max-content;
  max-width: 100%;
  flex-wrap: wrap;
  animation: fade-up 0.35s var(--ease-out);
}
.ed-tb-group {
  display: flex;
  gap: 2px;
}
.ed-tb-sep {
  width: 1px;
  height: 1.05rem;
  background: var(--line);
  margin: 0 0.2rem;
  flex: none;
}
.ed-tb-btn {
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-2);
  transition: all 0.14s var(--ease);
}
.ed-tb-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--ink);
}
.ed-tb-btn:active:not(:disabled) {
  transform: scale(0.9);
}
.ed-tb-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.ed-tb-btn:disabled {
  opacity: 0.35;
  pointer-events: none;
}
</style>
