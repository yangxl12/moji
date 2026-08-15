import { defineStore } from 'pinia'
import type { Notebook } from '@shared/types'
import { useNotesStore } from './notes'
import { useUiStore } from './ui'

/** activeId 为 'all' 表示"全部" */
export const useNotebooksStore = defineStore('notebooks', {
  state: () => ({
    list: [] as Notebook[],
    activeId: 'all' as string,
    counts: {} as Record<string, number>
  }),
  getters: {
    active(state): Notebook | null {
      return state.list.find((n) => n.id === state.activeId) ?? null
    }
  },
  actions: {
    async load(): Promise<void> {
      this.list = await window.api.listNotebooks()
      this.recount()
    },
    recount(): void {
      const notes = useNotesStore().all
      const counts: Record<string, number> = {}
      for (const n of notes) {
        if (n.notebookId) counts[n.notebookId] = (counts[n.notebookId] ?? 0) + 1
      }
      this.counts = counts
    },
    select(id: string): void {
      this.activeId = id
    },
    async create(name: string): Promise<Notebook> {
      const nb = await window.api.createNotebook(name)
      this.list.push(nb)
      this.activeId = nb.id
      return nb
    },
    async rename(id: string, name: string): Promise<void> {
      const nb = await window.api.renameNotebook(id, name)
      const target = this.list.find((n) => n.id === id)
      if (target) target.name = nb.name
    },
    async remove(id: string): Promise<void> {
      await window.api.deleteNotebook(id)
      this.list = this.list.filter((n) => n.id !== id)
      if (this.activeId === id) this.activeId = 'all'
      const notes = useNotesStore()
      for (const n of notes.all) {
        if (n.notebookId === id) n.notebookId = null
      }
      this.recount()
      useUiStore().toast('info', '已删除')
    }
  }
})
