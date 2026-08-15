/** 清理 Electron IPC 错误前缀，得到可读信息 */
export function cleanIpcError(e: unknown): string {
  if (e instanceof Error) {
    return e.message
      .replace(/^Error invoking remote method '[^']+':\s*/i, '')
      .replace(/^Error:\s*/i, '')
  }
  return String(e)
}

/**
 * 深拷贝为纯对象，剥离 Vue 响应式 Proxy（IPC 结构化克隆无法处理 Proxy），
 * 同时保留值为 undefined 的键（JSON.stringify 会丢掉它们，导致可选字段被误删）。
 */
export function toPlainIpc<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => toPlainIpc(v)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value)) {
      out[k] = toPlainIpc((value as Record<string, unknown>)[k])
    }
    return out as T
  }
  return value
}
