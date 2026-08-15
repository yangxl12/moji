<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { AiConfig } from '@shared/types'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { cleanIpcError } from '@/utils/ipc'

const { t } = useI18n()
const router = useRouter()
const settings = useSettingsStore()
const ui = useUiStore()

const PROVIDERS: { name: string; baseUrl: string; model: string }[] = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3' }
]

const existing = settings.settings.ai

const form = reactive<AiConfig>({
  baseUrl: existing?.baseUrl ?? '',
  apiKey: '',
  model: existing?.model ?? '',
  strength: existing?.strength ?? 'standard',
  customPrompt: existing?.customPrompt ?? '',
  temperatures: existing?.temperatures
})

const hasKey = ref(!!existing?.apiKey)
const showKey = ref(false)
const dirty = ref(false)

type TestState = 'idle' | 'testing' | 'ok' | 'fail'
const testState = ref<TestState>('idle')
const testResult = ref<{ latencyMs?: number; reply?: string; error?: string }>({})

const strengthOptions = ref([
  { value: 'gentle', label: t('ai.gentle') },
  { value: 'standard', label: t('ai.standard') },
  { value: 'deep', label: t('ai.deep') }
])

function strengthDesc(): string {
  switch (form.strength) {
    case 'gentle':
      return t('ai.gentleDesc')
    case 'deep':
      return t('ai.deepDesc')
    default:
      return t('ai.standardDesc')
  }
}

function markDirty(): void {
  dirty.value = true
}

function fillProvider(p: { baseUrl: string; model: string }): void {
  form.baseUrl = p.baseUrl
  form.model = p.model
  markDirty()
}

function buildConfig(): AiConfig {
  return {
    baseUrl: form.baseUrl.trim(),
    apiKey: form.apiKey.trim(),
    model: form.model.trim(),
    strength: form.strength,
    customPrompt: form.customPrompt.trim(),
    temperatures: form.temperatures
  }
}

async function doTest(): Promise<void> {
  const cfg = buildConfig()
  const key = cfg.apiKey || existing?.apiKey || ''
  if (!cfg.baseUrl || !key || !cfg.model) {
    ui.toast('error', t('aic.required'))
    return
  }
  testState.value = 'testing'
  testResult.value = {}
  const r = await window.api.testAi({ ...cfg, apiKey: key })
  if (r.ok) {
    testState.value = 'ok'
    testResult.value = { latencyMs: r.latencyMs, reply: r.reply }
  } else {
    testState.value = 'fail'
    testResult.value = { error: r.error }
  }
}

async function save(): Promise<void> {
  const cfg = buildConfig()
  const key = cfg.apiKey || existing?.apiKey || ''
  if (!cfg.baseUrl || !key || !cfg.model) {
    ui.toast('error', t('aic.required'))
    return
  }
  try {
    await settings.update({ ai: { ...cfg, apiKey: key } })
    ui.toast('success', t('aic.saved'))
    dirty.value = false
    hasKey.value = true
    form.apiKey = ''
    setTimeout(() => router.back(), 350)
  } catch (e) {
    ui.toast('error', `${t('aic.saveFailed')} · ${cleanIpcError(e)}`)
  }
}

async function goBack(): Promise<void> {
  if (dirty.value) {
    const ok = await ui.confirm({ title: t('aic.backConfirm'), okText: t('common.confirm') })
    if (!ok) return
  }
  router.push('/settings')
}
</script>

<template>
  <div class="aic-page">
    <header class="aic-head">
      <button class="btn-icon" :data-tip="t('aic.back')" @click="goBack">
        <Icon name="arrow-left" :size="17" />
      </button>
      <h1>{{ t('aic.title') }}</h1>
      <span class="aic-badge" :class="{ on: settings.settings.ai }">
        <template v-if="settings.settings.ai">{{ t('aic.configured', { model: settings.settings.ai.model }) }}</template>
        <template v-else>{{ t('aic.notConfigured') }}</template>
      </span>
    </header>

    <div class="aic-scroll">
      <div class="aic-inner">
        <p class="aic-intro">{{ t('aic.intro') }}</p>

        <div class="aic-card">
          <!-- 常用服务 -->
          <div class="aic-block">
            <label class="aic-label">{{ t('aic.providers') }}</label>
            <div class="aic-providers">
              <button v-for="p in PROVIDERS" :key="p.name" class="aic-chip" @click="fillProvider(p)">
                {{ p.name }}
              </button>
            </div>
          </div>

          <!-- 服务地址 -->
          <div class="aic-block">
            <label class="aic-label">{{ t('aic.baseUrl') }}</label>
            <input
              v-model="form.baseUrl"
              class="input"
              :placeholder="t('aic.baseUrlPh')"
              spellcheck="false"
              @input="markDirty"
            />
          </div>

          <!-- 密钥 -->
          <div class="aic-block">
            <label class="aic-label">{{ t('aic.apiKey') }}</label>
            <div class="aic-key-wrap">
              <Icon name="key" :size="15" class="aic-key-ico" />
              <input
                v-model="form.apiKey"
                class="input aic-key-input"
                :type="showKey ? 'text' : 'password'"
                :placeholder="hasKey ? '••••••••••••' : t('aic.apiKeyPh')"
                spellcheck="false"
                @input="markDirty"
              />
              <button class="btn-icon aic-eye" :data-tip="t('aic.apiKeyHint')" @click="showKey = !showKey">
                <Icon name="eye" :size="15" />
              </button>
            </div>
            <p class="aic-hint">{{ t('aic.apiKeyHint') }}</p>
            <p v-if="hasKey" class="aic-hint">{{ t('aic.apiKeyKeep') }}</p>
          </div>

          <!-- 模型 -->
          <div class="aic-block">
            <label class="aic-label">{{ t('aic.model') }}</label>
            <input v-model="form.model" class="input" :placeholder="t('aic.modelPh')" spellcheck="false" @input="markDirty" />
          </div>

          <!-- 强度 -->
          <div class="aic-block">
            <label class="aic-label">{{ t('aic.strength') }}</label>
            <SegmentedControl
              v-model="form.strength"
              :options="strengthOptions"
              @update:model-value="markDirty"
            />
            <p class="aic-hint">{{ strengthDesc() }}</p>
          </div>

          <!-- 自定义指令 -->
          <div class="aic-block">
            <label class="aic-label">{{ t('aic.custom') }}</label>
            <textarea
              v-model="form.customPrompt"
              class="input"
              rows="3"
              :placeholder="t('aic.customPh')"
              @input="markDirty"
            />
            <p class="aic-hint">{{ t('aic.customHint') }}</p>
          </div>

          <!-- 测试 -->
          <div class="aic-block">
            <label class="aic-label">{{ t('aic.test') }}</label>
            <div class="aic-test-row">
              <button class="btn btn-ghost" :disabled="testState === 'testing'" @click="doTest">
                <span v-if="testState === 'testing'" class="spinner" />
                <Icon v-else name="bot" :size="15" />
                {{ testState === 'testing' ? t('aic.testing') : t('aic.test') }}
              </button>
              <Transition name="fade">
                <span v-if="testState === 'ok'" class="aic-test-ok">
                  <Icon name="check" :size="13" />
                  {{ t('aic.testOk', { ms: testResult.latencyMs }) }}
                </span>
                <span v-else-if="testState === 'fail'" class="aic-test-fail">
                  <Icon name="warning" :size="13" />
                  {{ testResult.error }}
                </span>
              </Transition>
            </div>
            <Transition name="fade">
              <div v-if="testState === 'ok' && testResult.reply" class="aic-reply">
                <p class="aic-reply-label">{{ t('aic.sampleReply') }}</p>
                <p class="aic-reply-text">“{{ testResult.reply }}”</p>
              </div>
            </Transition>
          </div>
        </div>

        <div class="aic-foot">
          <button class="btn btn-ghost" @click="goBack">{{ t('common.cancel') }}</button>
          <button class="btn btn-primary" @click="save">
            <Icon name="check" :size="15" />
            {{ t('aic.save') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.aic-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.aic-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1.1rem 2rem 0.9rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 55%, var(--bg));
}
.aic-head h1 {
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  animation: fade-up 0.35s var(--ease-out) both;
}
.aic-badge {
  margin-left: auto;
  font-size: 0.74rem;
  color: var(--ink-3);
  background: var(--surface-2);
  border: 1px solid var(--line);
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  animation: fade-up 0.35s var(--ease-out) 0.05s both;
}
.aic-badge.on {
  color: var(--ok);
  background: var(--ok-soft);
  border-color: color-mix(in srgb, var(--ok) 30%, transparent);
}
.aic-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.6rem 2rem 4rem;
}
.aic-inner {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}
.aic-intro {
  font-size: 0.82rem;
  color: var(--ink-2);
  line-height: 1.8;
  animation: fade-up 0.4s var(--ease-out) both;
}
.aic-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  padding: 1.3rem 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  animation: fade-up 0.4s var(--ease-out) 0.05s both;
}
.aic-block {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.aic-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink-2);
  letter-spacing: 0.03em;
}
.aic-providers {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}
.aic-chip {
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  font-size: 0.78rem;
  color: var(--ink-2);
  background: var(--surface-2);
  border: 1px solid var(--line);
  transition: all 0.15s var(--ease);
}
.aic-chip:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
  transform: translateY(-1px);
}
.aic-key-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.aic-key-ico {
  position: absolute;
  left: 0.8rem;
  color: var(--ink-3);
  pointer-events: none;
}
.aic-key-input {
  padding-left: 2.3rem;
  padding-right: 2.6rem;
}
.aic-eye {
  position: absolute;
  right: 0.35rem;
  width: 1.75rem;
  height: 1.75rem;
}
.aic-hint {
  font-size: 0.74rem;
  color: var(--ink-3);
  line-height: 1.6;
}
.aic-test-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
}
.aic-test-ok {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: var(--ok);
  font-weight: 600;
  animation: check-pop 0.3s var(--spring);
}
.aic-test-fail {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: var(--danger);
  line-height: 1.5;
}
.aic-reply {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 0.7rem 0.85rem;
}
.aic-reply-label {
  font-size: 0.72rem;
  color: var(--ink-3);
  margin-bottom: 0.25rem;
}
.aic-reply-text {
  font-size: 0.84rem;
  color: var(--ink);
  line-height: 1.7;
}
.aic-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  animation: fade-up 0.4s var(--ease-out) 0.1s both;
}
</style>
