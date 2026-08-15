/** 相对时间 / 绝对时间格式化 */
export function timeAgo(ts: number, locale: string): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  const zh = locale === 'zh-CN'
  if (min < 1) return zh ? '刚刚' : 'just now'
  if (min < 60) return zh ? `${min} 分钟前` : `${min}m ago`
  const hour = Math.floor(min / 60)
  if (hour < 24) return zh ? `${hour} 小时前` : `${hour}h ago`
  const day = Math.floor(hour / 24)
  if (day < 7) return zh ? `${day} 天前` : `${day}d ago`
  return formatDate(ts, locale)
}

export function formatDate(ts: number, locale: string): string {
  const d = new Date(ts)
  const zh = locale === 'zh-CN'
  if (zh) {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  }
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
