import { defineStore } from 'pinia'
import { useSettingsStore } from './settings'
import { useNotebooksStore } from './notebooks'
import { useNotesStore } from './notes'

export const useAppStore = defineStore('app', {
  state: () => ({
    storageDir: null as string | null,
    ready: false
  }),
  actions: {
    async boot(): Promise<void> {
      if (this.ready) return
      const state = await window.api.getState()
      this.storageDir = state.storageDir
      if (state.settings) {
        const settings = useSettingsStore()
        settings.set(state.settings)
        settings.apply()
        const notebooks = useNotebooksStore()
        const notes = useNotesStore()
        await Promise.all([notebooks.load(), notes.load()])
      }
      this.ready = true
    },
    async finishOnboarding(dir: string): Promise<void> {
      const result = await window.api.initStorage(dir)
      if (!result.ok) throw new Error(result.error ?? 'init failed')
      this.storageDir = result.dir ?? dir
      const settings = useSettingsStore()
      const current = await window.api.getSettings()
      settings.set(current)
      settings.apply()
      await Promise.all([useNotebooksStore().load(), useNotesStore().load()])
    }
  }
})
