import type { Directive } from 'vue'

type Handler = (e: MouseEvent) => void

const handlers = new WeakMap<Element, Handler>()

export const clickOutside: Directive<HTMLElement, Handler> = {
  mounted(el, binding) {
    const handler = (e: MouseEvent): void => {
      if (!el.contains(e.target as Node)) binding.value?.(e)
    }
    handlers.set(el, handler)
    // 延迟绑定，避免与打开菜单的点击冲突
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
  },
  unmounted(el) {
    const handler = handlers.get(el)
    if (handler) document.removeEventListener('mousedown', handler)
  }
}

// ---------- 固定定位提示（v-tip） ----------
// 用 fixed 定位渲染到 body，避免被侧栏 / 面板的 overflow 裁切。
// 用法：v-tip="'文本'"（默认显示在上方）；v-tip="{ text: '文本', side: 'right' }"（显示在右侧）
type TipValue = string | { text: string; side?: 'top' | 'right' }
interface TipState {
  enter: () => void
  leave: () => void
  scroll: () => void
}

let tipEl: HTMLDivElement | null = null

function ensureTipEl(): HTMLDivElement {
  if (tipEl && tipEl.isConnected) return tipEl
  tipEl = document.createElement('div')
  tipEl.className = 'fixed-tip'
  document.body.appendChild(tipEl)
  return tipEl
}

function showTip(el: HTMLElement, text: string, side: 'top' | 'right'): void {
  const tip = ensureTipEl()
  tip.textContent = text
  tip.dataset.side = side
  const r = el.getBoundingClientRect()
  if (side === 'right') {
    tip.style.left = `${Math.round(r.right + 10)}px`
    tip.style.top = `${Math.round(r.top + r.height / 2)}px`
  } else {
    tip.style.left = `${Math.round(r.left + r.width / 2)}px`
    tip.style.top = `${Math.round(r.top - 8)}px`
  }
  tip.classList.add('show')
}

function hideTip(): void {
  tipEl?.classList.remove('show')
}

export const tip: Directive<HTMLElement, TipValue> = {
  mounted(el, binding) {
    const enter = (): void => {
      const b = binding.value
      const text = typeof b === 'string' ? b : b?.text
      if (!text) return
      const side = typeof b === 'object' ? (b.side ?? 'top') : 'top'
      showTip(el, text, side)
    }
    const leave = (): void => hideTip()
    const scroll = (): void => hideTip()
    el.addEventListener('mouseenter', enter)
    el.addEventListener('mouseleave', leave)
    document.addEventListener('scroll', scroll, true)
    ;(el as HTMLElement & { __tipState?: TipState }).__tipState = { enter, leave, scroll }
  },
  unmounted(el) {
    const st = (el as HTMLElement & { __tipState?: TipState }).__tipState
    if (!st) return
    el.removeEventListener('mouseenter', st.enter)
    el.removeEventListener('mouseleave', st.leave)
    document.removeEventListener('scroll', st.scroll, true)
  }
}

