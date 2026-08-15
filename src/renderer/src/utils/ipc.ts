/** 清理 Electron IPC 错误前缀，得到可读信息 */
export function cleanIpcError(e: unknown): string {
  if (e instanceof Error) {
    return e.message
      .replace(/^Error invoking remote method '[^']+':\s*/i, '')
      .replace(/^Error:\s*/i, '')
  }
  return String(e)
}
