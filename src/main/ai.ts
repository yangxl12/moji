import { BrowserWindow } from 'electron'
import type { AiConfig, AiPolishInput, AiStrength, AiStreamEvent, AiTestResult, NoteFormat } from '@shared/types'

// ---------- 每种强度的润色指令 ----------
const STRENGTH_PROMPTS: Record<AiStrength, string> = {
  gentle:
    '你是一位细致严谨的中文校对助手。请对用户提供的文本进行校对：只修正错别字、手滑打错的字、误用的标点和明显的语病。' +
    '保持原文的句式、风格、结构和篇幅完全不变，不增删内容，不润色文采。' +
    '直接输出修正后的全文，不要任何解释、前言或后缀。',
  standard:
    '你是一位优秀的中文编辑。请对用户提供的文本进行润色：修正错别字、语病和标点问题，调整语序让表达更通顺流畅，' +
    '梳理逻辑让段落衔接更清晰，适当优化用词以提升可读性。' +
    '忠实保留原文的核心内容、观点、人称与语气，不添加原文没有的信息，不大幅改变结构。' +
    '直接输出润色后的全文，不要任何解释、前言或后缀。',
  deep:
    '你是一位文笔出众的中文作家兼资深编辑。请对用户提供的文本进行深度润色与改写：修正所有错别字与语病，' +
    '重写不够流畅的句子，理顺段落之间的逻辑关系，在完全忠实于原意的前提下提升文采、节奏感与感染力，' +
    '让文章读起来更美、更有韵味。不得改变事实、观点与人称，不添加原文没有的信息。' +
    '直接输出润色后的全文，不要任何解释、前言或后缀。'
}

const TEMPERATURES: Record<AiStrength, number> = { gentle: 0.2, standard: 0.5, deep: 0.8 }

// ---------- 工具 ----------
function normalizeBaseUrl(url: string): string {
  let u = (url || '').trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  u = u.replace(/\/+$/, '')
  return u
}

function chatUrl(base: string): string {
  const b = normalizeBaseUrl(base)
  if (!b) throw new Error('未配置 API 地址')
  if (/\/chat\/completions$/i.test(b)) return b
  return `${b}/chat/completions`
}

function apiKey(config: AiConfig): string {
  return (config.apiKey || '').trim()
}

function systemPrompt(config: AiConfig, strength: AiStrength, format?: NoteFormat): string {
  let p = STRENGTH_PROMPTS[strength] ?? STRENGTH_PROMPTS.standard
  const extra = (config.customPrompt || '').trim()
  if (extra) p += '\n\n此外，请严格遵循以下额外要求：\n' + extra
  if (format === 'markdown') p += '\n\n请使用 Markdown 格式输出，保留适合的标题、列表、引用、代码块等结构，不要输出 HTML。'
  return p
}

function temperature(config: AiConfig, strength: AiStrength): number {
  const t = config.temperatures?.[strength]
  return typeof t === 'number' ? t : TEMPERATURES[strength]
}

function describeHttpError(status: number): string {
  switch (status) {
    case 401:
      return 'API Key 无效或未授权（401）'
    case 403:
      return '无访问权限（403）'
    case 404:
      return '接口地址不存在（404），请检查服务地址'
    case 429:
      return '请求过于频繁或额度不足（429）'
    default:
      return `请求失败（HTTP ${status}）`
  }
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text()
    const j = JSON.parse(text)
    return j?.error?.message || j?.message || text.slice(0, 300)
  } catch {
    return ''
  }
}

// ---------- 测试连接 ----------
export async function testAi(config: AiConfig): Promise<AiTestResult> {
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(chatUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey(config)}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            // 测试连接同样携带自定义指令，便于用户验证指令是否按预期影响模型回复
            content: '你是一个助手。' + (config.customPrompt?.trim() ? `\n\n此外，请严格遵循以下额外要求：\n${config.customPrompt.trim()}` : '')
          },
          { role: 'user', content: '请只回复四个字：连接成功' }
        ],
        temperature: 0.2,
        max_tokens: 64,
        stream: false
      }),
      signal: AbortSignal.timeout(20000)
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/abort|timeout/i.test(msg)) return { ok: false, error: '连接超时，请检查地址与网络' }
    return { ok: false, error: `无法连接服务器：${msg}` }
  }
  const latencyMs = Date.now() - started
  if (!res.ok) {
    const detail = await readErrorBody(res)
    return { ok: false, latencyMs, error: `${describeHttpError(res.status)}${detail ? ` · ${detail}` : ''}` }
  }
  try {
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const reply = j?.choices?.[0]?.message?.content
    if (typeof reply !== 'string' || !reply) {
      return { ok: false, latencyMs, error: '响应格式异常，请确认服务兼容 OpenAI 格式' }
    }
    return { ok: true, latencyMs, reply }
  } catch {
    return { ok: false, latencyMs, error: '响应解析失败，请确认服务兼容 OpenAI 格式' }
  }
}

// ---------- 流式润色 ----------
let activeAbort: AbortController | null = null

function send(win: BrowserWindow | null, event: AiStreamEvent): void {
  if (win && !win.isDestroyed()) win.webContents.send('ai:stream', event)
}

export async function startAiPolish(win: BrowserWindow | null, input: AiPolishInput): Promise<{ ok: boolean; error?: string }> {
  if (activeAbort) {
    activeAbort.abort()
    activeAbort = null
  }
  const controller = new AbortController()
  activeAbort = controller
  const timer = setTimeout(() => controller.abort(), 180000)

  const doWork = async (): Promise<void> => {
    let res: Response
    try {
      res = await fetch(chatUrl(input.config.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey(input.config)}`
        },
        body: JSON.stringify({
          model: input.config.model,
          messages: [
            { role: 'system', content: systemPrompt(input.config, input.strength, input.format) },
            { role: 'user', content: input.text }
          ],
          temperature: temperature(input.config, input.strength),
          stream: true
        }),
        signal: controller.signal
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (controller.signal.aborted) {
        send(win, { type: 'error', error: 'canceled' })
        return
      }
      send(win, { type: 'error', error: `无法连接服务器：${msg}` })
      return
    }

    if (!res.ok) {
      const detail = await readErrorBody(res)
      send(win, { type: 'error', error: `${describeHttpError(res.status)}${detail ? ` · ${detail}` : ''}` })
      return
    }

    if (!res.body) {
      send(win, { type: 'error', error: '服务未返回数据流' })
      return
    }

    try {
      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let gotAny = false
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith('data:')) continue
          const payload = t.slice(5).trim()
          if (payload === '[DONE]') continue
          let delta = ''
          try {
            const j = JSON.parse(payload)
            delta = j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.message?.content ?? ''
          } catch {
            delta = ''
          }
          if (delta) {
            gotAny = true
            send(win, { type: 'chunk', text: delta })
          }
        }
      }
      if (!gotAny) {
        send(win, { type: 'error', error: '未收到内容，请检查模型名称是否正确' })
        return
      }
      send(win, { type: 'done' })
    } catch (e) {
      if (controller.signal.aborted) {
        send(win, { type: 'error', error: 'canceled' })
      } else {
        send(win, { type: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    } finally {
      clearTimeout(timer)
      if (activeAbort === controller) activeAbort = null
    }
  }

  void doWork()
  return { ok: true }
}

export function cancelAiPolish(): void {
  activeAbort?.abort()
  activeAbort = null
}
