<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import { useAppStore } from '@/stores/app'

const { t } = useI18n()
const app = useAppStore()
const router = useRouter()
const api = window.api

const state = ref<'idle' | 'choosing' | 'initing' | 'error'>('idle')
const errorMsg = ref('')

async function choose(): Promise<void> {
  if (state.value === 'choosing' || state.value === 'initing') return
  try {
    state.value = 'choosing'
    const dir = await window.api.chooseDirectory()
    if (!dir) {
      state.value = 'idle'
      return
    }
    state.value = 'initing'
    try {
      await app.finishOnboarding(dir)
      await router.push('/')
    } catch (e) {
      state.value = 'error'
      errorMsg.value = e instanceof Error ? e.message : String(e)
    }
  } catch {
    state.value = 'idle'
  }
}
</script>

<template>
  <div class="ob-stage">
    <div class="ob-win">
      <button class="ob-win-btn" :data-tip="t('titlebar.minimize')" @click="api.windowMinimize()">
        <Icon name="minimize" :size="15" />
      </button>
      <button class="ob-win-btn" :data-tip="t('titlebar.maximize')" @click="api.windowToggleMaximize()">
        <Icon name="maximize" :size="13" />
      </button>
      <button class="ob-win-btn ob-win-close" :data-tip="t('titlebar.close')" @click="api.windowClose()">
        <Icon name="x" :size="15" />
      </button>
    </div>
    <div class="ob-glow" aria-hidden="true" />
    <div class="ob-card">
      <div class="ob-seal-wrap">
        <div class="seal seal-lg ob-seal">墨</div>
      </div>

      <p class="ob-badge">{{ t('onboarding.badge') }}</p>
      <h1 class="ob-title">{{ t('onboarding.title') }}</h1>
      <p class="ob-subtitle">{{ t('onboarding.subtitle') }}</p>

      <div class="ob-features">
        <div class="ob-feature">
          <span class="ob-feature-icon"><Icon name="storage" :size="15" /></span>
          {{ t('onboarding.feature1') }}
        </div>
        <div class="ob-feature">
          <span class="ob-feature-icon"><Icon name="pencil" :size="15" /></span>
          {{ t('onboarding.feature2') }}
        </div>
        <div class="ob-feature">
          <span class="ob-feature-icon"><Icon name="sparkles" :size="15" /></span>
          {{ t('onboarding.feature3') }}
        </div>
      </div>

      <div class="ob-why">
        <p class="ob-why-title">{{ t('onboarding.whyTitle') }}</p>
        <div class="ob-why-grid">
          <div class="ob-why-item">
            <Icon name="note" :size="16" />
            <span>{{ t('onboarding.why1') }}</span>
          </div>
          <div class="ob-why-item">
            <Icon name="folder" :size="16" />
            <span>{{ t('onboarding.why2') }}</span>
          </div>
          <div class="ob-why-item">
            <Icon name="globe" :size="16" />
            <span>{{ t('onboarding.why3') }}</span>
          </div>
        </div>
      </div>

      <div class="ob-actions">
        <button
          class="btn btn-primary btn-lg ob-choose"
          :disabled="state === 'choosing' || state === 'initing'"
          @click="choose"
        >
          <span v-if="state === 'choosing' || state === 'initing'" class="spinner" />
          <Icon v-else name="folder" :size="17" />
          {{
            state === 'choosing'
              ? t('onboarding.choosing')
              : state === 'initing'
                ? t('onboarding.initing')
                : t('onboarding.choose')
          }}
        </button>
        <p class="ob-hint">{{ t('onboarding.hint') }}</p>
      </div>

      <Transition name="fade">
        <div v-if="state === 'error'" class="ob-error">
          <Icon name="warning" :size="15" />
          <span>{{ t('onboarding.errorTitle') }}：{{ errorMsg }}</span>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.ob-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 60% at 50% -10%, var(--accent-soft), transparent 60%),
    radial-gradient(ellipse 60% 50% at 85% 110%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 60%),
    var(--bg);
}
.ob-win {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  z-index: 10;
}
.ob-win-btn {
  width: 44px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-2);
  transition: background 0.12s var(--ease), color 0.12s var(--ease);
}
.ob-win-btn:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.ob-win-close:hover {
  background: #c42b1e;
  color: #fff;
}
.ob-card {
  position: relative;
  z-index: 1;
  width: min(560px, 100%);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-3);
  padding: 2.6rem 2.8rem 2.2rem;
  text-align: center;
  animation: fade-up 0.5s var(--ease-out);
}
.ob-seal-wrap {
  height: 74px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.2rem;
}
.ob-seal {
  animation: stamp-in 0.7s var(--spring) 0.15s both;
}
.ob-badge {
  font-size: 0.74rem;
  letter-spacing: 0.18em;
  color: var(--accent);
  font-weight: 600;
  margin-bottom: 0.7rem;
  animation: fade-up 0.5s var(--ease-out) 0.3s both;
}
.ob-title {
  font-family: var(--font-display);
  font-size: 1.9rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  margin-bottom: 0.8rem;
  animation: fade-up 0.5s var(--ease-out) 0.38s both;
}
.ob-subtitle {
  color: var(--ink-2);
  font-size: 0.9rem;
  line-height: 1.9;
  max-width: 420px;
  margin: 0 auto;
  animation: fade-up 0.5s var(--ease-out) 0.46s both;
}
.ob-features {
  display: flex;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 1.4rem;
  flex-wrap: wrap;
  animation: fade-up 0.5s var(--ease-out) 0.54s both;
}
.ob-feature {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.78rem;
  color: var(--ink-2);
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.ob-feature-icon {
  color: var(--accent);
  display: inline-flex;
}
.ob-why {
  margin-top: 1.6rem;
  text-align: left;
  animation: fade-up 0.5s var(--ease-out) 0.62s both;
}
.ob-why-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink-2);
  margin-bottom: 0.6rem;
}
.ob-why-grid {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.ob-why-item {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  font-size: 0.8rem;
  line-height: 1.65;
  color: var(--ink-2);
  padding: 0.55rem 0.75rem;
  background: color-mix(in srgb, var(--surface-2) 55%, transparent);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
}
.ob-why-item svg {
  color: var(--accent);
  margin-top: 0.15rem;
  flex: none;
}
.ob-actions {
  margin-top: 1.8rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  animation: fade-up 0.5s var(--ease-out) 0.7s both;
}
.ob-choose {
  min-width: 220px;
}
.ob-hint {
  font-size: 0.74rem;
  color: var(--ink-3);
}
.ob-error {
  margin-top: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--danger);
  background: var(--danger-soft);
  padding: 0.5rem 0.8rem;
  border-radius: var(--r-sm);
}
</style>
