<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { cleanIpcError } from '@/utils/ipc'

const { t } = useI18n()
const router = useRouter()
const settings = useSettingsStore()
const ui = useUiStore()
const app = useAppStore()
const api = window.api

// ---------- 字体方案 ----------
const FONT_PRESETS = [
  {
    key: 'song',
    label: () => t('settings.fontSong'),
    value: '"Source Han Serif SC","Noto Serif SC","Songti SC","STSong","SimSun",Georgia,"Times New Roman",serif'
  },
  {
    key: 'hei',
    label: () => t('settings.fontHei'),
    value: '"HarmonyOS Sans SC","Source Han Sans SC","PingFang SC","Microsoft YaHei UI","Segoe UI",sans-serif'
  },
  {
    key: 'kai',
    label: () => t('settings.fontKai'),
    value: '"Kaiti SC","KaiTi","STKaiti","BiauKai","AR PL UKai CN",Georgia,serif'
  },
  { key: 'custom', label: () => t('settings.fontCustom'), value: '__CUSTOM__' }
]

const fontKey = computed(() => {
  const cur = settings.settings.contentFont
  const hit = FONT_PRESETS.find((p) => p.value !== '__CUSTOM__' && p.value === cur)
  return hit?.key ?? 'custom'
})
const customFont = computed(() => {
  const cur = settings.settings.contentFont
  return fontKey.value === 'custom' ? cur : '"LXGW WenKai","Kaiti SC",serif'
})

async function setFontPreset(key: string): Promise<void> {
  const preset = FONT_PRESETS.find((p) => p.key === key)
  if (!preset) return
  if (preset.value === '__CUSTOM__') {
    await settings.update({ contentFont: customFont.value })
  } else {
    await settings.update({ contentFont: preset.value })
  }
}

async function setCustomFont(e: Event): Promise<void> {
  const v = (e.target as HTMLInputElement).value.trim()
  if (v) await settings.update({ contentFont: v })
}

// ---------- 主题色 ----------
const SWATCHES = ['#B5452B', '#4A6B8A', '#4C7A5C', '#8A6BA8', '#B98A2F', '#8C5A4A']
const customColor = ref(settings.settings.accentColor)

async function setAccent(c: string): Promise<void> {
  customColor.value = c
  await settings.update({ accentColor: c })
}

// ---------- 存储 ----------
const storageBusy = ref(false)

async function changeDir(): Promise<void> {
  const dir = await window.api.chooseDirectory()
  if (!dir) return
  const ok = await ui.confirm({
    title: t('settings.changeDirTitle'),
    desc: t('settings.changeDirConfirm'),
    okText: t('confirm.ok')
  })
  if (!ok) return
  storageBusy.value = true
  try {
    const r = await window.api.migrateStorage(dir)
    if (r.ok) {
      app.storageDir = dir
      ui.toast('success', t('aic.saved'))
    } else {
      ui.toast('error', r.error ?? 'Failed')
    }
  } catch (e) {
    ui.toast('error', cleanIpcError(e))
  } finally {
    storageBusy.value = false
  }
}

const themeOptions = computed(() => [
  { value: 'light', label: t('settings.light') },
  { value: 'dark', label: t('settings.dark') },
  { value: 'system', label: t('settings.system') }
])
const sizeOptions = computed(() => [
  { value: 'small', label: t('settings.fsSmall') },
  { value: 'medium', label: t('settings.fsMedium') },
  { value: 'large', label: t('settings.fsLarge') }
])
const langOptions = computed(() => [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' }
])
</script>

<template>
  <div class="settings-page">
    <header class="st-head">
      <button class="btn-icon" :data-tip="t('common.back')" @click="router.push('/')">
        <Icon name="arrow-left" :size="17" />
      </button>
      <h1>{{ t('settings.title') }}</h1>
    </header>

    <div class="st-scroll">
      <div class="st-inner">
        <!-- 外观 -->
        <section class="st-section">
          <h2 class="st-section-title">{{ t('settings.appearance') }}</h2>
          <div class="st-card">
            <div class="st-row">
              <div class="st-row-left">
                <p class="st-label">{{ t('settings.theme') }}</p>
              </div>
              <SegmentedControl
                :model-value="settings.settings.themeMode"
                :options="themeOptions"
                @update:model-value="(v) => settings.update({ themeMode: v as 'light' | 'dark' | 'system' })"
              />
            </div>

            <div class="st-row">
              <div class="st-row-left">
                <p class="st-label">{{ t('settings.accent') }}</p>
              </div>
              <div class="st-swatches">
                <button
                  v-for="c in SWATCHES"
                  :key="c"
                  class="st-swatch"
                  :style="{ background: c }"
                  :class="{ active: settings.settings.accentColor.toLowerCase() === c.toLowerCase() }"
                  @click="setAccent(c)"
                >
                  <Icon v-if="settings.settings.accentColor.toLowerCase() === c.toLowerCase()" name="check" :size="12" />
                </button>
                <label class="st-swatch st-swatch-custom" :class="{ active: !SWATCHES.includes(settings.settings.accentColor.toUpperCase()) }">
                  <Icon name="palette" :size="13" />
                  <input type="color" :value="customColor" @input="setAccent(($event.target as HTMLInputElement).value)" />
                </label>
              </div>
            </div>

            <div class="st-row">
              <div class="st-row-left">
                <p class="st-label">{{ t('settings.fontSize') }}</p>
              </div>
              <SegmentedControl
                :model-value="settings.settings.fontSize"
                :options="sizeOptions"
                @update:model-value="(v) => settings.update({ fontSize: v as 'small' | 'medium' | 'large' })"
              />
            </div>

            <div class="st-row">
              <div class="st-row-left">
                <p class="st-label">{{ t('settings.font') }}</p>
              </div>
              <div class="st-font-presets">
                <button
                  v-for="p in FONT_PRESETS"
                  :key="p.key"
                  class="st-font-btn"
                  :class="{ active: fontKey === p.key }"
                  @click="setFontPreset(p.key)"
                >
                  {{ p.label() }}
                </button>
              </div>
            </div>
            <Transition name="fade">
              <div v-if="fontKey === 'custom'" class="st-row st-row-sub">
                <div class="st-row-left">
                  <p class="st-label st-label-sub">{{ t('settings.fontCustomPh') }}</p>
                </div>
                <input class="input st-font-input" :value="customFont" @change="setCustomFont" />
              </div>
            </Transition>
            <div class="st-preview" :style="{ fontFamily: settings.settings.contentFont }">
              {{ t('settings.fontPreview') }} · {{ t('settings.fontPreviewText') }}
            </div>
          </div>
        </section>

        <!-- 语言 -->
        <section class="st-section">
          <h2 class="st-section-title">{{ t('settings.language') }}</h2>
          <div class="st-card">
            <div class="st-row">
              <div class="st-row-left">
                <p class="st-label">Language</p>
                <p class="st-desc">中文 / English</p>
              </div>
              <SegmentedControl
                :model-value="settings.settings.language"
                :options="langOptions"
                @update:model-value="(v) => settings.update({ language: v as 'zh-CN' | 'en-US' })"
              />
            </div>
          </div>
        </section>

        <!-- AI -->
        <section class="st-section">
          <h2 class="st-section-title">{{ t('settings.ai') }}</h2>
          <div class="st-card">
            <button class="st-row st-row-link" @click="router.push('/settings/ai')">
              <div class="st-row-left">
                <p class="st-label">{{ t('settings.ai') }}</p>
                <p class="st-desc">{{ t('settings.aiDesc') }}</p>
              </div>
              <span class="st-ai-badge" :class="{ on: settings.settings.ai }">
                <template v-if="settings.settings.ai">
                  <span class="st-ai-dot" />{{ t('aic.configured', { model: settings.settings.ai.model }) }}
                </template>
                <template v-else>{{ t('aic.notConfigured') }}</template>
              </span>
              <Icon name="chevron-right" :size="16" class="st-arrow" />
            </button>
          </div>
        </section>

        <!-- 存储 -->
        <section class="st-section">
          <h2 class="st-section-title">{{ t('settings.storage') }}</h2>
          <div class="st-card">
            <div class="st-row">
              <div class="st-row-left">
                <p class="st-label">{{ t('settings.storageDir') }}</p>
              </div>
              <div class="st-dir">
                <Icon name="folder" :size="14" />
                <span class="st-dir-path">{{ app.storageDir }}</span>
              </div>
            </div>
            <div class="st-row">
              <div class="st-row-left">
                <p class="st-desc">{{ t('settings.changeDirDesc') }}</p>
              </div>
              <div class="st-row-actions">
                <button class="btn btn-ghost btn-sm" @click="api.openStorageDir()">
                  <Icon name="external" :size="14" />
                  {{ t('settings.openDir') }}
                </button>
                <button class="btn btn-ghost btn-sm" :disabled="storageBusy" @click="changeDir">
                  <span v-if="storageBusy" class="spinner" />
                  <Icon v-else name="refresh" :size="14" />
                  {{ t('settings.changeDir') }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 关于 -->
        <section class="st-section">
          <h2 class="st-section-title">{{ t('settings.about') }}</h2>
          <div class="st-card">
            <div class="st-row">
              <div class="st-row-left">
                <p class="st-label">{{ t('settings.localFirst') }}</p>
                <p class="st-desc">{{ t('settings.version') }} {{ api.appVersion }}</p>
              </div>
              <div class="seal">墨</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.st-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1.1rem 2rem 0.9rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 55%, var(--bg));
}
.st-head h1 {
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  animation: fade-up 0.35s var(--ease-out) both;
}
.st-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.6rem 2rem 4rem;
}
.st-inner {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.7rem;
}
.st-section-title {
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--ink-3);
  text-transform: uppercase;
  margin-bottom: 0.55rem;
  animation: fade-up 0.4s var(--ease-out) both;
}
.st-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  padding: 0.3rem 1.2rem;
  animation: fade-up 0.4s var(--ease-out) 0.05s both;
}
.st-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
  padding: 0.95rem 0;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}
.st-row:last-child {
  border-bottom: none;
}
.st-row-link {
  width: 100%;
  text-align: left;
  transition: padding 0.18s var(--ease);
  border-radius: var(--r-sm);
}
.st-row-link:hover {
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}
.st-row-left {
  min-width: 0;
}
.st-label {
  font-size: 0.88rem;
  font-weight: 500;
}
.st-label-sub {
  font-size: 0.8rem;
  color: var(--ink-2);
}
.st-desc {
  font-size: 0.76rem;
  color: var(--ink-3);
  margin-top: 0.2rem;
  line-height: 1.6;
}
.st-swatches {
  display: flex;
  gap: 0.55rem;
  align-items: center;
}
.st-swatch {
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: transform 0.18s var(--spring), box-shadow 0.18s var(--ease);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}
.st-swatch:hover {
  transform: scale(1.18);
}
.st-swatch.active {
  transform: scale(1.12);
  box-shadow: 0 0 0 2.5px var(--surface), 0 0 0 4.5px currentColor;
}
.st-swatch-custom {
  background: conic-gradient(#e24c4c, #e2b04c, #4ccb6b, #4c9fe2, #a04ce2, #e24c4c);
  position: relative;
  overflow: hidden;
  cursor: pointer;
}
.st-swatch-custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.st-font-presets {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.st-font-btn {
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  font-size: 0.78rem;
  color: var(--ink-2);
  background: var(--surface-2);
  border: 1px solid var(--line);
  transition: all 0.15s var(--ease);
}
.st-font-btn:hover {
  color: var(--ink);
  border-color: var(--line-strong);
}
.st-font-btn.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.st-row-sub {
  padding-top: 0.3rem;
  padding-bottom: 0.7rem;
}
.st-font-input {
  width: min(300px, 100%);
  height: 2.1rem;
}
.st-preview {
  padding: 0.9rem 1rem;
  margin: 0.4rem 0 1rem;
  border-radius: var(--r-sm);
  background: var(--surface-2);
  border: 1px dashed var(--line-strong);
  font-size: 0.95rem;
  color: var(--ink-2);
  line-height: 1.9;
}
.st-ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.74rem;
  color: var(--ink-3);
  background: var(--surface-2);
  border: 1px solid var(--line);
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  white-space: nowrap;
}
.st-ai-badge.on {
  color: var(--ok);
  background: var(--ok-soft);
  border-color: color-mix(in srgb, var(--ok) 30%, transparent);
}
.st-ai-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
}
.st-arrow {
  color: var(--ink-3);
  flex: none;
}
.st-dir {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--ink-2);
  min-width: 0;
  max-width: 60%;
}
.st-dir-path {
  font-size: 0.76rem;
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}
.st-row-actions {
  display: flex;
  gap: 0.5rem;
}
</style>
