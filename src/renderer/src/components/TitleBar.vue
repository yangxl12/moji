<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './ui/Icon.vue'

const { t } = useI18n()
const api = window.api
const maximized = ref(false)
let unsub: (() => void) | null = null

onMounted(async () => {
  unsub = api.onWindowMaximized((m) => (maximized.value = m))
})

onBeforeUnmount(() => unsub?.())
</script>

<template>
  <header class="titlebar">
    <div class="titlebar-left">
      <div class="seal">墨</div>
      <span class="titlebar-name">{{ t('app.name') }}</span>
      <span class="titlebar-dot">·</span>
      <span class="titlebar-tag">{{ t('app.tagline') }}</span>
    </div>
    <div class="titlebar-ctrl">
      <button class="tb-btn" :data-tip="t('titlebar.minimize')" @click="api.windowMinimize()">
        <Icon name="minimize" :size="15" />
      </button>
      <button
        class="tb-btn"
        :data-tip="maximized ? t('titlebar.restore') : t('titlebar.maximize')"
        @click="api.windowToggleMaximize().then((m) => (maximized = m))"
      >
        <Icon :name="maximized ? 'restore' : 'maximize'" :size="13" />
      </button>
      <button class="tb-btn tb-close" :data-tip="t('titlebar.close')" @click="api.windowClose()">
        <Icon name="x" :size="15" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  -webkit-app-region: drag;
  padding-left: 0.9rem;
  flex: none;
  background: color-mix(in srgb, var(--panel) 60%, transparent);
}
.titlebar-left {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.titlebar .seal {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  font-size: 0.74rem;
}
.titlebar .seal::after {
  inset: 2px;
  border-radius: 4px;
}
.titlebar-name {
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0.08em;
  font-size: 0.9rem;
}
.titlebar-dot {
  color: var(--ink-3);
}
.titlebar-tag {
  font-size: 0.72rem;
  color: var(--ink-3);
  letter-spacing: 0.05em;
}
.titlebar-ctrl {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}
.tb-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-2);
  transition: background 0.12s var(--ease), color 0.12s var(--ease);
}
.tb-btn:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.tb-close:hover {
  background: #c42b1e;
  color: #fff;
}
</style>
