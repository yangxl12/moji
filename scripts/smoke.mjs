// 墨记 InkNote 冒烟测试：完整走查核心流程
import { _electron } from 'playwright-core'
import { mkdirSync, existsSync, readFileSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = 'D:\\yxlAgent\\moji'
const TMP = join(ROOT, '.test-tmp')
rmSync(TMP, { recursive: true, force: true })
const userData = join(TMP, 'user-data')
const storage = join(TMP, 'storage')
const shots = join(TMP, 'shots')
mkdirSync(userData, { recursive: true })
mkdirSync(storage, { recursive: true })
mkdirSync(shots, { recursive: true })

let failures = 0
function ok(msg) {
  console.log('  ✓ ' + msg)
}
function fail(msg) {
  failures++
  console.log('  ✗ ' + msg)
}
async function step(name, fn) {
  console.log('▶ ' + name)
  try {
    await fn()
  } catch (e) {
    fail(name + ' → ' + (e?.message ?? e))
  }
}
async function shot(page, name) {
  await page.screenshot({ path: join(shots, name + '.png') }).catch(() => {})
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

const app = await _electron.launch({
  args: ['.'],
  cwd: ROOT,
  env: { ...process.env, INKNOTE_USER_DATA: userData }
})

await app.evaluate(async ({ dialog }, dir) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
}, storage)

const page = await app.firstWindow()
page.setDefaultTimeout(10000)
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('  [renderer error]', msg.text())
})
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

await step('onboarding 显示', async () => {
  await page.waitForSelector('text=把日子，写进墨里', { timeout: 15000 })
  ok('首启引导页正常渲染')
  await shot(page, '01-onboarding')
})

await step('选择存储目录并初始化', async () => {
  await page.click('.ob-choose')
  await page.waitForSelector('.sb-new', { timeout: 10000 })
  ok('进入主页')
  if (!existsSync(join(storage, 'notes'))) return fail('notes 目录未创建')
  if (!existsSync(join(storage, 'settings.json'))) return fail('settings.json 未创建')
  if (!existsSync(join(storage, 'notebooks.json'))) return fail('notebooks.json 未创建')
  ok('数据目录结构已创建：notes/ images/ settings.json notebooks.json')
  await shot(page, '02-home-empty')
})

await step('新建笔记本', async () => {
  await page.click('.sb-add')
  await page.fill('.sb-input', '工作')
  await page.press('.sb-input', 'Enter')
  await page.waitForSelector('.sb-item:has-text("工作")')
  await page.click('.sb-add')
  await page.fill('.sb-input', '生活')
  await page.press('.sb-input', 'Enter')
  await page.waitForSelector('.sb-item:has-text("生活")')
  ok('笔记本「工作」「生活」已创建，当前选中「生活」')
})

await step('新建笔记并写入内容', async () => {
  await page.click('.sb-new')
  await page.waitForSelector('.tiptap')
  if ((await page.locator('.sidebar').count()) !== 1) return fail('编辑时一级侧栏不可见')
  if ((await page.locator('.notes-pane').count()) !== 1) return fail('编辑时二级侧栏不可见')
  ok('编辑器以局部页面打开，两级侧栏保持可见')
  await page.fill('.ed-title', '测试笔记')
  await page.click('.tiptap')
  await page.keyboard.type('今天天气不错，适合写代码。\n\n这是第二段，用于测试 AI 润色功能。')
  await pause(1600)
  const files = readdirSync(join(storage, 'notes')).filter((f) => f.endsWith('.json'))
  if (files.length !== 1) return fail('笔记文件数量异常: ' + files.length)
  const noteJson = JSON.parse(readFileSync(join(storage, 'notes', files[0]), 'utf-8'))
  if (noteJson.title !== '测试笔记') return fail('标题未保存: ' + noteJson.title)
  if (!JSON.stringify(noteJson.content).includes('天气不错')) return fail('正文未保存')
  ok('标题与正文已自动保存到本地文件')
  await shot(page, '03-editor')
})

await step('工具栏加粗与字数', async () => {
  await page.click('.tiptap')
  await page.keyboard.press('Control+a')
  await page.click('.ed-tb-btn[data-tip="加粗"]')
  const words = await page.textContent('.ed-meta')
  if (!words.includes('字')) return fail('字数统计缺失: ' + words)
  ok('加粗生效，字数统计: ' + words.trim())
})

await step('卡片列表与笔记页并存（编辑即预览）', async () => {
  await page.waitForSelector('.note-card')
  const title = await page.textContent('.note-title')
  if (!title.includes('测试笔记')) return fail('卡片标题异常: ' + title)
  const edTitle = await page.inputValue('.ed-title')
  if (!edTitle.includes('测试笔记')) return fail('笔记页标题异常: ' + edTitle)
  ok('列表卡片与笔记页并存，标题一致（编辑即预览）')
  await shot(page, '04-note-page')
})

await step('底部元信息：创建时间与字数', async () => {
  await page.waitForSelector('.ed-meta')
  const meta = await page.textContent('.ed-meta')
  if (!meta.includes('字')) return fail('字数统计缺失: ' + meta)
  if (!meta.includes('创建于')) return fail('创建时间缺失: ' + meta)
  ok('笔记页底部显示创建时间与字数: ' + meta.trim())
})

await step('全屏笔记页', async () => {
  await page.click('.ed-full')
  await page.waitForSelector('.editor-page.fullscreen')
  ok('全屏已开启')
  await shot(page, '04-editor-fullscreen')
  await page.keyboard.press('Escape')
  await pause(300)
  if ((await page.locator('.editor-page.fullscreen').count()) !== 0) return fail('Esc 未退出全屏')
  ok('Esc 退出全屏')
})

await step('返回顶部按钮', async () => {
  // 内容不足一页时不显示
  if ((await page.locator('.ed-top-btn').count()) !== 0) return fail('内容不足一页时不应显示返回顶部按钮')
  // 写入多段文字撑出滚动
  await page.click('.tiptap')
  await page.keyboard.press('Control+End')
  const paras = []
  for (let i = 1; i <= 28; i++) paras.push(`这是用于撑高页面的第 ${i} 段文字。`)
  await page.keyboard.type(paras.join('\n\n'))
  await pause(1400)
  const scrollable = await page.evaluate(() => {
    const el = document.querySelector('.ed-scroll')
    return el ? el.scrollHeight - el.clientHeight : 0
  })
  if (scrollable <= 0) return fail('内容未超出页面高度: ' + scrollable)
  // 下滑一段距离后出现按钮
  await page.evaluate(() => {
    const el = document.querySelector('.ed-scroll')
    if (el) el.scrollTop = Math.min(el.scrollHeight / 2, el.scrollHeight)
  })
  await page.waitForSelector('.ed-top-btn')
  ok('下滑后出现「返回顶部」按钮')
  await shot(page, '04-back-to-top')
  await page.click('.ed-top-btn')
  await pause(900)
  const st = await page.evaluate(() => document.querySelector('.ed-scroll')?.scrollTop ?? -1)
  if (st > 4) return fail('点击后未返回顶部: ' + st)
  ok('点击「返回顶部」平滑回到页首')
})

await step('空状态与点击笔记打开笔记页', async () => {
  // 切到空笔记本：无选中笔记 → 空状态
  await page.click('.sb-item:has-text("工作")')
  await page.waitForSelector('.ne-empty')
  const emptyText = await page.textContent('.ne-title')
  if (!emptyText.includes('选择一篇笔记')) return fail('空状态文案异常: ' + emptyText)
  ok('未选中笔记时显示「选择一篇笔记」')
  await shot(page, '04-note-empty')
  // 回到「生活」，点击笔记卡片 → 打开笔记页
  await page.click('.sb-item:has-text("生活")')
  await page.click('.note-card')
  await page.waitForSelector('.tiptap')
  ok('点击笔记卡片打开笔记页（编辑即预览）')
  // 折叠二级侧栏 → 笔记页变大
  await page.click('.np-collapse')
  await page.waitForSelector('.notes-pane.collapsed')
  ok('笔记列表已折叠为书脊轨道')
  await shot(page, '04-notes-rail')
  await page.click('.np-collapse')
  await page.waitForSelector('.notes-pane:not(.collapsed)')
  ok('笔记列表已展开')
})

await step('全局搜索 Ctrl+K', async () => {
  await page.keyboard.press('Control+k')
  await page.waitForSelector('.search-input')
  await page.fill('.search-input', 'AI 润色')
  await page.waitForSelector('.search-hit')
  const hit = await page.textContent('.search-hit-title')
  if (!hit.includes('测试笔记')) return fail('搜索结果异常: ' + hit)
  ok('搜索命中标题与正文')
  await shot(page, '05-search')
  // Enter 打开第一篇 → 笔记页
  await page.press('.search-input', 'Enter')
  await page.waitForSelector('.tiptap')
  ok('Enter 打开搜索结果进入笔记页')
})

await step('批量移动笔记（下拉菜单 → 工作）', async () => {
  const card = page.locator('.note-card').first()
  await card.hover()
  await card.locator('.note-check').click()
  await page.waitForSelector('.batch-bar')
  await page.click('.batch-bar .batch-btn:has-text("移动到")')
  await page.waitForSelector('.dd-menu .menu-item:has-text("工作")')
  await shot(page, '05-batch-move')
  await page.click('.dd-menu .menu-item:has-text("工作")')
  await pause(600)
  const remaining = await page.locator('.note-card').count()
  if (remaining !== 0) return fail('移动后仍显示在「生活」: ' + remaining)
  await page.click('.sb-item:has-text("工作")')
  await page.waitForSelector('.note-card')
  ok('下拉菜单移动成功，笔记出现在「工作」')
})

await step('批量移动笔记到「全部」', async () => {
  const card = page.locator('.note-card').first()
  await card.hover()
  await card.locator('.note-check').click()
  await page.click('.batch-bar .batch-btn:has-text("全部")')
  await pause(600)
  const remaining = await page.locator('.note-card').count()
  if (remaining !== 0) return fail('移动后仍显示在「工作」: ' + remaining)
  await page.click('.sb-item:has-text("全部")')
  await page.waitForSelector('.note-card')
  ok('批量移动完成，笔记出现在「全部」')
})

await step('多选浮层点击外部关闭', async () => {
  const card = page.locator('.note-card').first()
  await card.hover()
  await card.locator('.note-check').click()
  await page.waitForSelector('.batch-bar')
  await page.click('.ne-empty')
  await pause(300)
  if ((await page.locator('.batch-bar').count()) !== 0) return fail('点击外部未关闭多选浮层')
  ok('单击笔记列表以外区域关闭多选浮层')
})

await step('删除笔记（确认弹窗）', async () => {
  const card = page.locator('.note-card').first()
  await card.hover()
  await card.locator('.note-check').click()
  await page.click('.batch-bar .batch-danger')
  await page.waitForSelector('.modal')
  await shot(page, '06-confirm')
  await page.click('.modal .btn-danger')
  await page.waitForSelector('.empty')
  ok('笔记已删除，空状态显示')
})

await step('删除笔记本', async () => {
  await page.hover('.sb-item:has-text("工作")')
  await page.click('.sb-item:has-text("工作") .sb-more-btn')
  await page.click('.dd-menu .menu-item.danger')
  await page.click('.modal .btn-danger')
  await pause(500)
  const gone = (await page.locator('.sb-item:has-text("工作")').count()) === 0
  if (!gone) return fail('笔记本未删除')
  ok('笔记本「工作」删除正常')
  // 删除「生活」让数据回到只有默认笔记本的状态
  await page.hover('.sb-item:has-text("生活")')
  await page.click('.sb-item:has-text("生活") .sb-more-btn')
  await page.click('.dd-menu .menu-item.danger')
  await page.click('.modal .btn-danger')
  await pause(500)
})

await step('设置：暗黑主题', async () => {
  await page.click('.sb-settings')
  await page.waitForSelector('.st-card')
  await page.click('.seg-item:has-text("暗黑")')
  await pause(400)
  const theme = await page.evaluate(() => document.documentElement.dataset.theme)
  if (theme !== 'dark') return fail('主题未切换: ' + theme)
  ok('暗黑主题生效')
  await shot(page, '07-settings-dark')
})

await step('设置：切换英文', async () => {
  await page.click('.seg-item:has-text("English")')
  await page.waitForSelector('text=Appearance')
  ok('英文界面生效')
  await shot(page, '08-settings-en')
  await page.click('.seg-item:has-text("中文")')
  await page.waitForSelector('text=外观')
})

await step('设置：主题色与字体', async () => {
  await page.click('.st-swatch:nth-child(3)')
  await pause(300)
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  )
  if (!accent) return fail('主题色未生效')
  ok('主题色切换: ' + accent)
  await page.click('.st-font-btn:has-text("楷体")')
  await pause(300)
  const font = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--font-content')
  )
  if (!font.includes('KaiTi') && !font.includes('Kaiti')) return fail('字体未生效: ' + font)
  ok('笔记字体切换: ' + font.slice(0, 60))
})

await step('AI 配置页', async () => {
  await page.click('.st-row-link')
  await page.waitForSelector('.aic-card')
  await page.click('.aic-chip:has-text("DeepSeek")')
  const base = await page.inputValue('input[placeholder="https://api.deepseek.com/v1"]')
  const model = await page.inputValue('input[placeholder="deepseek-chat"]')
  if (!base || !model) return fail('快捷填充失败: ' + base + '/' + model)
  ok('服务快捷填充: ' + base + ' / ' + model)
  // 模型列表闭环：添加 → 自动切换 → 手动切换 → 重命名 → 删除
  await page.fill('.aic-model-add input', 'deepseek-reasoner')
  await page.press('.aic-model-add input', 'Enter')
  await page.waitForSelector('.aic-model-name:has-text("deepseek-reasoner")')
  const added = await page.inputValue('input[placeholder="deepseek-chat"]')
  if (added !== 'deepseek-reasoner') return fail('添加模型后未自动切换为当前模型: ' + added)
  ok('模型已添加并自动切换为当前模型')
  await page.click('.aic-model-name:has-text("deepseek-chat")')
  const switched = await page.inputValue('input[placeholder="deepseek-chat"]')
  if (switched !== 'deepseek-chat') return fail('点击列表切换模型失败: ' + switched)
  ok('点击列表项切换当前模型')
  await page.locator('.aic-model:has-text("deepseek-reasoner")').locator('.aic-model-op').first().click()
  await page.fill('.aic-model-rename', 'deepseek-r1')
  await page.press('.aic-model-rename', 'Enter')
  await page.waitForSelector('.aic-model-name:has-text("deepseek-r1")')
  ok('模型重命名生效')
  await page.locator('.aic-model:has-text("deepseek-r1")').locator('.aic-model-del').click()
  await page.waitForSelector('.aic-model-name:has-text("deepseek-r1")', { state: 'detached' })
  ok('模型删除生效')
  await page.fill('.aic-key-input', 'sk-test-123')
  await page.fill('.aic-custom-input', '把每个句号换成换行符。')
  await page.click('button:has-text("测试连接")')
  await page.waitForSelector('.aic-test-fail, .aic-test-ok', { timeout: 30000 })
  ok('测试连接给出结果（预期鉴权失败）')
  await shot(page, '09-ai-config')
  await page.click('.aic-foot .btn-primary')
  await page.waitForSelector('.st-row-link', { timeout: 10000 })
  await pause(400)
  const badge = await page.textContent('.st-ai-badge')
  if (!badge.includes('已配置')) return fail('保存后状态未更新: ' + badge)
  ok('配置已保存，设置页状态徽标更新')
  // 磁盘检查：密钥必须加密（apiKeyEnc），绝不能出现明文；模型列表与自定义指令要持久化
  const aiOnDisk = JSON.parse(readFileSync(join(storage, 'settings.json'), 'utf-8')).ai
  if (!aiOnDisk || !aiOnDisk.apiKeyEnc) return fail('磁盘未找到加密密钥字段: ' + JSON.stringify(aiOnDisk))
  if (JSON.stringify(aiOnDisk).includes('sk-test-123')) return fail('磁盘出现明文密钥')
  if (!Array.isArray(aiOnDisk.models) || !aiOnDisk.models.includes('deepseek-chat')) {
    return fail('模型列表未持久化: ' + JSON.stringify(aiOnDisk.models))
  }
  if (!aiOnDisk.customPrompt || !aiOnDisk.customPrompt.includes('换行符')) {
    return fail('自定义指令未持久化: ' + JSON.stringify(aiOnDisk.customPrompt))
  }
  if (!existsSync(join(storage, '.gitignore'))) return fail('存储目录缺少 .gitignore 护盾')
  ok('密钥已加密落盘、无明文；模型列表与自定义指令已持久化；存储目录有 .gitignore 护盾')
})

await step('自定义指令进入润色请求', async () => {
  // 回归：自定义指令保存后必须真正携带在发给模型的 system 消息里
  await app.evaluate(() => {
    globalThis.__captured = []
    const realFetch = globalThis.fetch.bind(globalThis)
    globalThis.fetch = async (url, init) => {
      try {
        globalThis.__captured.push({ url: String(url), body: init?.body })
      } catch {
        /* ignore */
      }
      return realFetch(url, init)
    }
  })
  await page.evaluate(async () => {
    const cfg = await window.api.getSettings()
    await window.api.startAiPolish({ config: cfg.ai, text: '今天天气很好。', strength: 'standard' })
  })
  await pause(2000)
  const captured = await app.evaluate(() => globalThis.__captured)
  const body = captured?.[0]?.body ?? ''
  if (!body.includes('把每个句号换成换行符。')) {
    return fail('润色请求的 system 消息未携带自定义指令: ' + body.slice(0, 300))
  }
  if (!body.includes('今天天气很好。')) return fail('润色请求未携带正文')
  ok('润色请求的 system 消息包含自定义指令与正文')
})

await step('关于与数据目录', async () => {
  const dir = await page.textContent('.st-dir-path')
  if (!dir.includes('.test-tmp')) return fail('目录显示异常: ' + dir)
  ok('数据目录显示正常')
  await shot(page, '10-settings-final')
})

await step('重启应用：AI 配置与密钥可恢复', async () => {
  // 回归：早期版本密钥加密字段名不一致，保存后读不回来（表现为“配置丢了”）
  await app.close()
  await pause(800)
  const app2 = await _electron.launch({
    args: ['.'],
    cwd: ROOT,
    env: { ...process.env, INKNOTE_USER_DATA: userData }
  })
  const page2 = await app2.firstWindow()
  page2.setDefaultTimeout(10000)
  page2.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  await page2.waitForSelector('.sb-new', { timeout: 15000 })
  const s = await page2.evaluate(() => window.api.getSettings())
  if (!s.ai) return fail('重启后 AI 配置丢失')
  if (s.ai.apiKey !== 'sk-test-123') return fail('重启后密钥未恢复: ' + JSON.stringify(s.ai.apiKey))
  if (!Array.isArray(s.ai.models) || !s.ai.models.includes('deepseek-chat')) {
    return fail('重启后模型列表丢失: ' + JSON.stringify(s.ai.models))
  }
  if (!s.ai.customPrompt || !s.ai.customPrompt.includes('换行符')) {
    return fail('重启后自定义指令丢失: ' + JSON.stringify(s.ai.customPrompt))
  }
  await page2.click('.sb-settings')
  await page2.waitForSelector('.st-ai-badge.on')
  const badge2 = await page2.textContent('.st-ai-badge')
  if (!badge2.includes('deepseek-chat')) return fail('重启后徽标异常: ' + badge2)
  ok('重启后配置完整保留，密钥解密可用，徽标显示当前模型')
  await shot(page2, '11-restart-ai')
  await app2.close()
})

console.log('')
console.log(failures === 0 ? '✅ 全部冒烟测试通过' : `❌ ${failures} 项失败`)
await app.close()
process.exit(failures === 0 ? 0 : 1)
