import type { InkApi } from '@shared/types'

declare global {
  interface Window {
    api: InkApi
  }
}

export {}
