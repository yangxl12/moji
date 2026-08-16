<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { AiConfig } from '@shared/types'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { cleanIpcError, toPlainIpc } from '@/utils/ipc'

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
  models: [...(existing?.models?.length ? existing.models : existing?.model ? [existing.model] : [])],
  strength: existing?.strength ?? 'standard',
  customPrompt: existing?.customPrompt ?? '',
  temperatures: existing?.temperatures
})

// ---------- 模型列表（本地持久化：增删改查 + 切换） ----------
const newModel = ref('')
const editingIdx = ref(-1)
const editingName = ref('')

function selectModel(m: string): void {
  form.model = m
  markDirty()
}

function addModel(): void {
  const name = newModel.value.trim()
  if (!name) return
  if (!form.models.includes(name)) form.models.push(name)
  form.model = name
  newModel.value = ''
  markDirty()
}

function removeModel(i: number): void {
  const removed = form.models[i]
  form.models.splice(i, 1)
  if (form.model === removed) form.model = form.models[0] ?? ''
  markDirty()
}

function beginRename(i: number): void {
  editingIdx.value = i
  editingName.value = form.models[i]
}

function commitRename(): void {
  if (editingIdx.value < 0) return
  const i = editingIdx.value
  const name = editingName.value.trim()
  if (name) {
    const old = form.models[i]
    const dup = form.models.findIndex((m, j) => j !== i && m === name)
    if (dup >= 0) {
      // 重名则合并：删除当前项
      form.models.splice(i, 1)
      if (form.model === old || form.model === '') form.model = name
    } else {
      form.models[i] = name
      if (form.model === old) form.model = name
    }
    markDirty()
  }
  editingIdx.value = -1
  editingName.value = ''
}

function cancelRename(): void {
  editingIdx.value = -1
  editingName.value = ''
}

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
  if (!form.models.includes(p.model)) form.models.push(p.model)
  form.model = p.model
  markDirty()
}

function buildConfig(): AiConfig {
  // 当前模型不在列表时并入列表，保证保存后列表与当前模型一致
  const models = [...form.models]
  const current = form.model.trim()
  if (current && !models.includes(current)) models.unshift(current)
  return {
    baseUrl: form.baseUrl.trim(),
    apiKey: form.apiKey.trim(),
    model: current,
    models,
    strength: form.strength,
    customPrompt: form.customPrompt.trim(),
    temperatures: form.temperatures ? { ...form.temperatures } : undefined
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
  const r = await window.api.testAi(toPlainIpc({ ...cfg, apiKey: key }))
  if (r.ok) {
    testState.value = 'ok'
    testResult.value = { latencyMs: r.latencyMs, reply: r.reply }
  } else {
    testState.value = 'fail'
    testResult.value = { error: r.error }
  }
}

/** 按来路返回：从编辑页（主页）跳转而来 → 回到编辑页；从设置跳转而来 → 回到设置 */
function leave(): void {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

async function save(): Promise<void> {
  const cfg = buildConfig()
  const key = cfg.apiKey || existing?.apiKey || ''
  if (!cfg.baseUrl || !key || !cfg.model) {
    ui.toast('error', t('aic.required'))
    return
  }
  try {
    await settings.update({ ai: toPlainIpc({ ...cfg, apiKey: key }) })
    ui.toast('success', t('aic.saved'))
    dirty.value = false
    hasKey.value = true
    form.apiKey = ''
    setTimeout(() => leave(), 350)
  } catch (e) {
    ui.toast('error', `${t('aic.saveFailed')} · ${cleanIpcError(e)}`)
  }
}

async function goBack(): Promise<void> {
  if (dirty.value) {
    const ok = await ui.confirm({ title: t('aic.backConfirm'), okText: t('common.confirm') })
    if (!ok) return
  }
  leave()
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

        <!-- 壹 · 连接服务 -->
        <section class="aic-card">
          <div class="aic-card-head">
            <span class="aic-step">壹</span>
            <div class="aic-card-head-txt">
              <h2>{{ t('aic.stepConnect') }}</h2>
              <p>{{ t('aic.stepConnectDesc') }}</p>
            </div>
          </div>
          <div class="aic-card-body">
            <div class="aic-quick">
              <span class="aic-quick-label">
                <Icon name="sparkles" :size="13" />
                {{ t('aic.providers') }}
              </span>
              <div class="aic-providers">
                <button
                  v-for="p in PROVIDERS"
                  :key="p.name"
                  class="aic-chip"
                  :class="{ active: form.baseUrl.trim() === p.baseUrl }"
                  @click="fillProvider(p)"
                >
                  {{ p.name }}
                </button>
              </div>
            </div>

            <div class="aic-field">
              <label class="aic-label">{{ t('aic.baseUrl') }}</label>
              <input
                v-model="form.baseUrl"
                class="input aic-url-input"
                :placeholder="t('aic.baseUrlPh')"
                spellcheck="false"
                @input="markDirty"
              />
            </div>

            <div class="aic-field">
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
          </div>
        </section>

        <!-- 贰 · 选择模型 -->
        <section class="aic-card">
          <div class="aic-card-head">
            <span class="aic-step">贰</span>
            <div class="aic-card-head-txt">
              <h2>{{ t('aic.stepModel') }}</h2>
              <p>{{ t('aic.stepModelDesc') }}</p>
            </div>
          </div>
          <div class="aic-card-body">
            <div class="aic-field">
              <label class="aic-label">{{ t('aic.currentModel') }}</label>
              <input v-model="form.model" class="input" :placeholder="t('aic.modelPh')" spellcheck="false" @input="markDirty" />
              <p class="aic-hint">{{ t('aic.modelHint') }}</p>
            </div>

            <div class="aic-sep" />

            <div class="aic-field">
              <label class="aic-label">
                {{ t('aic.models') }}
                <span v-if="form.models.length" class="aic-count">{{ form.models.length }}</span>
              </label>
              <div v-if="form.models.length" class="aic-models">
                <div v-for="(m, i) in form.models" :key="m" class="aic-model" :class="{ active: form.model === m }">
                  <template v-if="editingIdx === i">
                    <input
                      v-model="editingName"
                      class="aic-model-rename"
                      spellcheck="false"
                      @keydown.enter.prevent="commitRename"
                      @keydown.esc.prevent="cancelRename"
                      @blur="commitRename"
                    />
                  </template>
                  <template v-else>
                    <button class="aic-model-name" :data-tip="t('aic.modelSwitch')" @click="selectModel(m)">
                      <Icon v-if="form.model === m" name="check" :size="11" />
                      {{ m }}
                    </button>
                    <span v-if="form.model === m" class="aic-inuse">{{ t('aic.inUse') }}</span>
                    <button class="aic-model-op" :data-tip="t('aic.modelRename')" @click="beginRename(i)">
                      <Icon name="pencil" :size="11" />
                    </button>
                    <button class="aic-model-op aic-model-del" :data-tip="t('aic.modelDelete')" @click="removeModel(i)">
                      <Icon name="x" :size="11" />
                    </button>
                  </template>
                </div>
              </div>
              <p v-else class="aic-hint aic-models-empty">{{ t('aic.modelsEmpty') }}</p>
              <div class="aic-model-add">
                <input
                  v-model="newModel"
                  class="input"
                  :placeholder="t('aic.modelAddPh')"
                  spellcheck="false"
                  @keydown.enter.prevent="addModel"
                />
                <button class="btn btn-ghost btn-sm" :disabled="!newModel.trim()" @click="addModel">
                  <Icon name="plus" :size="13" />
                  {{ t('aic.addModel') }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 叁 · 润色偏好 -->
        <section class="aic-card">
          <div class="aic-card-head">
            <span class="aic-step">叁</span>
            <div class="aic-card-head-txt">
              <h2>{{ t('aic.stepPrefs') }}</h2>
              <p>{{ t('aic.stepPrefsDesc') }}</p>
            </div>
          </div>
          <div class="aic-card-body">
            <div class="aic-field">
              <label class="aic-label">{{ t('aic.strength') }}</label>
              <SegmentedControl
                v-model="form.strength"
                :options="strengthOptions"
                @update:model-value="markDirty"
              />
              <p class="aic-strength-desc">{{ strengthDesc() }}</p>
            </div>

            <div class="aic-field">
              <label class="aic-label">{{ t('aic.custom') }}</label>
              <textarea
                v-model="form.customPrompt"
                class="input aic-custom-input"
                rows="3"
                :placeholder="t('aic.customPh')"
                @input="markDirty"
              />
              <p class="aic-hint">{{ t('aic.customHint') }}</p>
            </div>
          </div>
        </section>

        <!-- 操作栏：测试 + 保存 -->
        <div class="aic-foot">
          <Transition name="fade">
            <div v-if="testState === 'ok' && testResult.reply" class="aic-reply">
              <p class="aic-reply-label">{{ t('aic.sampleReply') }}</p>
              <p class="aic-reply-text">“{{ testResult.reply }}”</p>
            </div>
          </Transition>
          <div class="aic-foot-test">
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
          <div class="aic-foot-actions">
            <button class="btn btn-ghost" @click="goBack">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" @click="save">
              <Icon name="check" :size="15" />
              {{ t('aic.save') }}
            </button>
          </div>
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
  padding: 1.6rem 2rem 2rem;
}
.aic-inner {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.aic-intro {
  font-size: 0.82rem;
  color: var(--ink-2);
  line-height: 1.8;
  animation: fade-up 0.4s var(--ease-out) both;
}

/* ---------- 步骤卡片 ---------- */
.aic-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  overflow: hidden;
  animation: fade-up 0.4s var(--ease-out) 0.05s both;
}
.aic-card-head {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1.05rem 1.25rem 0.9rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface-2) 42%, var(--surface));
}
.aic-step {
  flex: none;
  width: 26px;
  height: 26px;
  margin-top: 0.05rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: var(--on-accent);
  border-radius: 7px;
  font-family: var(--font-display);
  font-size: 0.82rem;
  font-weight: 700;
  transform: rotate(-4deg);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--accent) 45%, transparent);
  position: relative;
}
.aic-step::after {
  content: '';
  position: absolute;
  inset: 3px;
  border: 1px solid color-mix(in srgb, var(--on-accent) 55%, transparent);
  border-radius: 5px;
  pointer-events: none;
}
.aic-card-head h2 {
  font-family: var(--font-display);
  font-size: 0.98rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}
.aic-card-head p {
  margin-top: 0.22rem;
  font-size: 0.76rem;
  color: var(--ink-3);
  line-height: 1.6;
}
.aic-card-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.05rem 1.25rem 1.25rem;
}

/* ---------- 表单字段 ---------- */
.aic-field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.aic-label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-2);
  letter-spacing: 0.03em;
}
.aic-hint {
  font-size: 0.74rem;
  color: var(--ink-3);
  line-height: 1.6;
}

/* ---------- 常用服务快速填充 ---------- */
.aic-quick {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  flex-wrap: wrap;
  padding: 0.65rem 0.8rem;
  border: 1px dashed var(--line-strong);
  border-radius: var(--r);
  background: var(--surface-2);
}
.aic-quick-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink-2);
  white-space: nowrap;
}
.aic-providers {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.aic-chip {
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  font-size: 0.78rem;
  color: var(--ink-2);
  background: var(--surface);
  border: 1px solid var(--line);
  transition: all 0.15s var(--ease);
}
.aic-chip:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
  transform: translateY(-1px);
}
.aic-chip.active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: var(--accent-soft);
  font-weight: 600;
}

/* ---------- 密钥 ---------- */
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
.aic-url-input {
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

/* ---------- 模型 ---------- */
.aic-sep {
  height: 1px;
  background: var(--line);
  margin: 0.1rem 0;
}
.aic-count {
  flex: none;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.66rem;
  font-weight: 600;
  color: var(--ink-2);
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.aic-models {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.aic-model {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 0.25rem 0.45rem;
  transition: border-color 0.15s var(--ease), background 0.15s var(--ease);
}
.aic-model.active {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: var(--accent-soft);
}
.aic-model-name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  text-align: left;
  font-size: 0.82rem;
  color: var(--ink);
  padding: 0.3rem 0.4rem;
  border-radius: 6px;
  overflow: hidden;
  white-space: nowrap;
}
.aic-model-name svg {
  color: var(--accent);
  flex: none;
}
.aic-model.active .aic-model-name {
  color: var(--accent);
  font-weight: 600;
}
.aic-inuse {
  flex: none;
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--accent);
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
}
.aic-model-op {
  flex: none;
  width: 1.55rem;
  height: 1.55rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--ink-3);
  opacity: 0;
  transition: all 0.15s var(--ease);
}
.aic-model:hover .aic-model-op {
  opacity: 1;
}
.aic-model-op:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
.aic-model-del:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.aic-model-rename {
  flex: 1;
  height: 1.8rem;
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 0 0.45rem;
  font-size: 0.82rem;
  color: var(--ink);
  outline: none;
}
.aic-models-empty {
  padding: 0.7rem 0.85rem;
  border: 1px dashed var(--line);
  border-radius: var(--r-sm);
  background: var(--surface-2);
}
.aic-model-add {
  display: flex;
  gap: 0.45rem;
}
.aic-model-add .input {
  flex: 1;
}

/* ---------- 润色偏好 ---------- */
.aic-strength-desc {
  font-size: 0.76rem;
  color: var(--ink-2);
  line-height: 1.6;
  padding: 0.55rem 0.75rem;
  background: var(--surface-2);
  border-left: 2px solid var(--accent);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
}

/* ---------- 底部操作栏（吸底） ---------- */
.aic-foot {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  flex-wrap: wrap;
  margin-top: 0.1rem;
  padding: 0.7rem 0.9rem;
  background: color-mix(in srgb, var(--panel) 80%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  animation: fade-up 0.4s var(--ease-out) 0.1s both;
}
.aic-reply {
  flex-basis: 100%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 0.65rem 0.85rem;
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
.aic-foot-test {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}
.aic-foot-actions {
  display: flex;
  gap: 0.6rem;
  margin-left: auto;
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
</style>
