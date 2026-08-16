import { defineStore } from 'pinia'
import type { NoteMeta } from '@shared/types'
import { useNotebooksStore } from './notebooks'

export const useNotesStore = defineStore('notes', {
  state: () => ({
    all: [] as NoteMeta[]
  }),
  getters: {
    /** 按创建时间正序：越早创建的越靠上，最新创建的排在最下方（向下递增） */
    byCreatedAt(state): NoteMeta[] {
      return [...state.all].sort((a, b) => a.createdAt - b.createdAt)
    }
  },
  actions: {
    async load(): Promise<void> {
      this.all = await window.api.listNotes()
      useNotebooksStore().recount()
    },
    async create(notebookId: string | null): Promise<NoteMeta> {
      const note = await window.api.createNote({ notebookId })
      this.all.unshift(note)
      useNotebooksStore().recount()
      return note
    },
    async remove(ids: string[]): Promise<void> {
      await window.api.deleteNotes(ids)
      const set = new Set(ids)
      this.all = this.all.filter((n) => !set.has(n.id))
      useNotebooksStore().recount()
    },
    async move(ids: string[], notebookId: string | null): Promise<void> {
      await window.api.moveNotes(ids, notebookId)
      const set = new Set(ids)
      for (const n of this.all) {
        if (set.has(n.id)) n.notebookId = notebookId
      }
      useNotebooksStore().recount()
    },
    /** 编辑器自动保存后同步本地列表 */
    syncLocal(id: string, patch: Partial<Pick<NoteMeta, 'title' | 'content' | 'format'>>): void {
      const n = this.all.find((x) => x.id === id)
      if (n) {
        if (patch.title !== undefined) n.title = patch.title
        if (patch.content !== undefined) n.content = patch.content
          if (patch.format !== undefined) n.format = patch.format
        n.updatedAt = Date.now()
      }
    },
    get(id: string): NoteMeta | undefined {
      return this.all.find((n) => n.id === id)
    }
  }
})
