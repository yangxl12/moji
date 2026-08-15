<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Editor } from '@tiptap/vue-3'
import type { AiStrength } from '@shared/types'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { docToText, textToDoc } from '@/utils/text'
import { cleanIpcError } from '@/utils/ipc'

const props = defineProps<{ editor: Editor | null; open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const settings = useSettingsStore()
const ui = useUiStore()

type Phase = 'idle' | 'working' | 'done' | 'error' | 'noConfig'

const phase = ref<Phase>('idle')
const strength = ref<AiStrength>('standard')
const result = ref('')
const errorMsg = ref('')
const previewEl = ref<HTMLElement | null>(null)

let unsub: (() => void) | null = null

watch(
  () => props.open,
  (v) => {
    if (v) {
      const cfg = settings.settings.ai
      strength.value = cfg?.strength ?? 'standard'
      phase.value = cfg ? 'idle' : 'noConfig'
      result.value = ''
      errorMsg.value = ''
    }
  }
)

async function scrollPreview(): Promise<void> {
  await nextTick()
  const el = previewEl.value
  if (el) el.scrollTop = el.scrollHeight
}

async function start(): Promise<void> {
  const cfg = settings.settings.ai
  if (!cfg) {
    phase.value = 'noConfig'
    return
  }
  const editor = props.editor
  const text = editor ? docToText(editor.getJSON()) : ''
  if (!text) {
    ui.toast('info', t('ai.emptyContent'))
    emit('close')
    return
  }
  phase.value = 'working'
  result.value = ''
  errorMsg.value = ''

  unsub?.()
  unsub = window.api.onAiStream((ev) => {
    if (ev.type === 'chunk' && ev.text) {
      result.value += ev.text
      void scrollPreview()
    } else if (ev.type === 'done') {
      phase.value = 'done'
    } else if (ev.type === 'error') {
      if (ev.error === 'canceled') {
        phase.value = 'idle'
        ui.toast('info', t('ai.canceled'))
      } else {
        errorMsg.value = ev.error ?? t('ai.failed')
        phase.value = 'error'
      }
    }
  })

  try {
    await window.api.startAiPolish({ config: cfg, text, strength: strength.value })
  } catch (e) {
    errorMsg.value = cleanIpcError(e)
    phase.value = 'error'
  }
}

function stop(): void {
  void window.api.cancelAiPolish()
}

function replace(): void {
  if (!props.editor) return
  props.editor.commands.setContent(textToDoc(result.value) as never)
  ui.toast('success', t('ai.doneTitle'))
  emit('close')
}

function goConfig(): void {
  emit('close')
  // 由父组件跳转
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('inknote:goto-ai-config'))
  })
}

function close(): void {
  if (phase.value === 'working') void window.api.cancelAiPolish()
  emit('close')
}

onBeforeUnmount(() => {
  unsub?.()
  if (phase.value === 'working') void window.api.cancelAiPolish()
})

const strengthOptions = [
  { value: 'gentle', label: t('ai.gentle') },
  { value: 'standard', label: t('ai.standard') },
  { value: 'deep', label: t('ai.deep') }
]

const strengthDesc = (): string => {
  switch (strength.value) {
    case 'gentle':
      return t('ai.gentleDesc')
    case 'deep':
      return t('ai.deepDesc')
    default:
      return t('ai.standardDesc')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet-fade">
      <div v-if="open" class="ai-backdrop" @mousedown.self="close" />
    </Transition>
    <Transition name="sheet">
      <aside v-if="open" class="ai-sheet">
        <header class="ai-head">
          <div class="ai-head-icon"><Icon name="sparkles" :size="17" /></div>
          <div>
            <h3>{{ t('ai.title') }}</h3>
            <p>{{ t('ai.subtitle') }}</p>
          </div>
          <button class="btn-icon ai-close" :data-tip="t('common.close')" @click="close">
            <Icon name="x" :size="15" />
          </button>
        </header>

        <!-- 未配置 -->
        <div v-if="phase === 'noConfig'" class="ai-body ai-center">
          <div class="ai-noconfig-glyph"><Icon name="bot" :size="30" /></div>
          <h4>{{ t('ai.noConfig') }}</h4>
          <p class="ai-muted">{{ t('aic.intro').slice(0, 60) }}…</p>
          <button class="btn btn-primary" @click="goConfig">
            <Icon name="settings" :size="15" />
            {{ t('ai.goConfig') }}
          </button>
        </div>

        <!-- 待命 -->
        <div v-else-if="phase === 'idle'" class="ai-body">
          <div class="ai-block">
            <label class="ai-label">{{ t('ai.strength') }}</label>
            <SegmentedControl v-model="strength" :options="strengthOptions" />
            <p class="ai-desc">{{ strengthDesc() }}</p>
          </div>
          <div class="ai-block ai-note">
            <Icon name="info" :size="14" />
            <span>{{ t('ai.replaceNote') }}</span>
          </div>
        </div>

        <!-- 润色中 -->
        <div v-else-if="phase === 'working'" class="ai-body">
          <div class="ai-working-head">
            <span class="ai-pulse" />
            <span class="ai-working-title">{{ t('ai.working') }}</span>
          </div>
          <p class="ai-muted">{{ t('ai.writingDesc') }}</p>
          <div ref="previewEl" class="ai-stream">
            <p v-if="result">{{ result }}</p>
            <div v-else class="ai-stream-skeleton">
              <span v-for="i in 4" :key="i" class="sk-line" :style="{ width: `${92 - i * 12}%` }" />
            </div>
            <span class="ai-cursor" />
          </div>
        </div>

        <!-- 完成 -->
        <div v-else-if="phase === 'done'" class="ai-body">
          <div class="ai-done-badge">
            <Icon name="check" :size="15" />
            {{ t('ai.doneTitle') }}
          </div>
          <div ref="previewEl" class="ai-stream ai-result">
            <p>{{ result }}</p>
          </div>
        </div>

        <!-- 失败 -->
        <div v-else-if="phase === 'error'" class="ai-body ai-center">
          <div class="ai-error-glyph"><Icon name="warning" :size="26" /></div>
          <h4>{{ t('ai.failed') }}</h4>
          <p class="ai-muted ai-error-msg">{{ errorMsg }}</p>
        </div>

        <footer class="ai-foot">
          <template v-if="phase === 'idle' || phase === 'error'">
            <button class="btn btn-ghost" @click="close">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" @click="start">
              <Icon name="sparkles" :size="15" />
              {{ phase === 'error' ? t('common.ok') + ' · ' + t('ai.again') : t('ai.start') }}
            </button>
          </template>
          <template v-else-if="phase === 'working'">
            <button class="btn btn-ghost" @click="stop">
              <Icon name="stop" :size="14" />
              {{ t('ai.stop') }}
            </button>
          </template>
          <template v-else-if="phase === 'done'">
            <button class="btn btn-ghost" @click="start">
              <Icon name="refresh" :size="14" />
              {{ t('ai.again') }}
            </button>
            <button class="btn btn-primary" @click="replace">
              <Icon name="check" :size="15" />
              {{ t('ai.replace') }}
            </button>
          </template>
          <template v-else>
            <button class="btn btn-ghost" @click="close">{{ t('common.close') }}</button>
            <button class="btn btn-primary" @click="goConfig">{{ t('ai.goConfig') }}</button>
          </template>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-backdrop {
  position: fixed;
  inset: 0;
  z-index: 130;
  background: color-mix(in srgb, var(--bg) 45%, transparent);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.ai-sheet {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(400px, 92vw);
  z-index: 131;
  background: var(--surface);
  border-left: 1px solid var(--line);
  box-shadow: var(--shadow-3);
  display: flex;
  flex-direction: column;
  animation: sheet-in 0.32s var(--ease-out);
}
.sheet-enter-active,
.sheet-leave-active {
  transition: all 0.28s var(--ease);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateX(60px);
  opacity: 0;
}
.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.25s var(--ease);
}
.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.ai-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.1rem 1.2rem;
  border-bottom: 1px solid var(--line);
  flex: none;
}
.ai-head-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.ai-head h3 {
  font-family: var(--font-display);
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}
.ai-head p {
  font-size: 0.74rem;
  color: var(--ink-3);
  margin-top: 0.1rem;
}
.ai-close {
  margin-left: auto;
}
.ai-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.ai-center {
  align-items: center;
  justify-content: center;
  text-align: center;
}
.ai-center h4 {
  font-family: var(--font-display);
  font-size: 1rem;
}
.ai-block {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.ai-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-2);
  letter-spacing: 0.05em;
}
.ai-desc {
  font-size: 0.76rem;
  color: var(--ink-3);
  line-height: 1.6;
}
.ai-note {
  flex-direction: row;
  align-items: flex-start;
  gap: 0.45rem;
  font-size: 0.76rem;
  color: var(--ink-2);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 0.6rem 0.7rem;
  line-height: 1.6;
}
.ai-note svg {
  color: var(--accent);
  flex: none;
  margin-top: 0.1rem;
}
.ai-muted {
  font-size: 0.78rem;
  color: var(--ink-3);
  line-height: 1.7;
}
.ai-noconfig-glyph,
.ai-error-glyph {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.4rem;
}
.ai-noconfig-glyph {
  background: var(--accent-soft);
  color: var(--accent);
}
.ai-error-glyph {
  background: var(--danger-soft);
  color: var(--danger);
}
.ai-error-msg {
  color: var(--danger);
  max-width: 260px;
}
.ai-working-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.ai-pulse {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse-soft 1.2s ease-in-out infinite;
}
.ai-working-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.98rem;
}
.ai-stream {
  flex: 1;
  min-height: 220px;
  max-height: 46vh;
  overflow-y: auto;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 1rem 1.1rem 1.4rem;
  font-family: var(--font-content);
  font-size: 0.94rem;
  line-height: 2;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  scroll-behavior: smooth;
}
.ai-stream p {
  margin: 0;
}
.ai-cursor {
  display: inline-block;
  width: 2px;
  height: 1.1em;
  background: var(--accent);
  vertical-align: text-bottom;
  margin-left: 2px;
  animation: pulse-soft 0.9s ease-in-out infinite;
}
.ai-stream-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.sk-line {
  height: 0.85rem;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--line) 25%, var(--surface) 50%, var(--line) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
.ai-result {
  white-space: pre-wrap;
}
.ai-done-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  align-self: flex-start;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ok);
  background: var(--ok-soft);
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  animation: check-pop 0.3s var(--spring);
}
.ai-foot {
  flex: none;
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  padding: 0.9rem 1.2rem;
  border-top: 1px solid var(--line);
}
</style>
