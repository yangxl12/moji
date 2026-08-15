<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

const ui = useUiStore()
const { t } = useI18n()

function onEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape' && ui.confirmOpen) ui.resolveConfirm(false)
}

onMounted(() => document.addEventListener('keydown', onEsc))
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="ui.confirmOpen" class="overlay" @mousedown.self="ui.resolveConfirm(false)">
        <div class="modal" role="dialog" aria-modal="true">
          <div style="display: flex; gap: 0.7rem; align-items: flex-start">
            <div
              class="modal-glyph"
              :style="{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: ui.confirmOptions?.danger ? 'var(--danger-soft)' : 'var(--accent-soft)',
                color: ui.confirmOptions?.danger ? 'var(--danger)' : 'var(--accent)'
              }"
            >
              <Icon :name="ui.confirmOptions?.danger ? 'warning' : 'info'" :size="18" />
            </div>
            <div style="min-width: 0">
              <h3>{{ ui.confirmOptions?.title }}</h3>
              <p v-if="ui.confirmOptions?.desc" class="modal-desc">{{ ui.confirmOptions.desc }}</p>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="ui.resolveConfirm(false)">
              {{ ui.confirmOptions?.danger ? t('confirm.cancel') : t('common.cancel') }}
            </button>
            <button
              class="btn"
              :class="ui.confirmOptions?.danger ? 'btn-danger' : 'btn-primary'"
              @click="ui.resolveConfirm(true)"
            >
              {{ ui.confirmOptions?.okText ?? t('confirm.ok') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
