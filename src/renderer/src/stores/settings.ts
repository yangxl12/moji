import { defineStore } from 'pinia'
import { i18n } from '@/i18n'
import { toPlainIpc } from '@/utils/ipc'
import type { Settings, ThemeMode } from '@shared/types'

const DEFAULTS: Settings = {
  themeMode: 'system',
  accentColor: '#B5452B',
  fontSize: 'medium',
  contentFont: '"Source Han Serif SC","Noto Serif SC","Songti SC",Georgia,"Times New Roman",serif',
  language: 'zh-CN',
  ai: null
}

const SCALE: Record<string, number> = { small: 0.92, medium: 1, large: 1.09 }

let media: MediaQueryList | null = null

function resolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: { ...DEFAULTS } as Settings
  }),
  getters: {
    resolvedTheme(state): 'light' | 'dark' {
      return resolvedTheme(state.settings.themeMode)
    }
  },
  actions: {
    set(s: Settings): void {
      this.settings = { ...DEFAULTS, ...s }
    },
    /** 将设置应用到 document / nativeTheme / i18n */
    apply(): void {
      const s = this.settings
      const root = document.documentElement
      const resolved = resolvedTheme(s.themeMode)
      root.dataset.theme = resolved
      // 暗黑模式下将主题色向白色提亮，保持色相并保证对比度
      const accent = resolved === 'dark' ? `color-mix(in srgb, ${s.accentColor} 72%, #fff)` : s.accentColor
      root.style.setProperty('--accent', accent)
      root.style.setProperty('--accent-base', s.accentColor)
      root.style.setProperty('--ui-scale', String(SCALE[s.fontSize] ?? 1))
      root.style.setProperty('--font-content', s.contentFont)
      i18n.global.locale.value = s.language as 'zh-CN' | 'en-US'
      root.lang = s.language === 'zh-CN' ? 'zh-CN' : 'en'
      window.api.setThemeSource(s.themeMode)

      if (s.themeMode === 'system') {
        if (!media) {
          media = window.matchMedia('(prefers-color-scheme: dark)')
          media.addEventListener('change', () => this.apply())
        }
      }
    },
    async update(patch: Partial<Settings>): Promise<void> {
      // 剥掉 Vue 响应式 Proxy 再走 IPC，避免 "could not be cloned" 导致保存失败
      const saved = await window.api.saveSettings(toPlainIpc(patch))
      this.settings = { ...this.settings, ...saved }
      this.apply()
    }
  }
})
