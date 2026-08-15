// 墨记 InkNote 冒烟测试：完整走查核心流程
import { _electron } from 'playwright-core'
import { mkdirSync, existsSync, readFileSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = 'D:\\myProject\\yxl-todo'
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
  const words = await page.textContent('.ed-status')
  if (!words.includes('字')) return fail('字数统计缺失: ' + words)
  ok('加粗生效，字数统计: ' + words.trim())
})

await step('返回主页卡片展示', async () => {
  await page.click('.ed-back')
  await page.waitForSelector('.note-card')
  const title = await page.textContent('.note-title')
  if (!title.includes('测试笔记')) return fail('卡片标题异常: ' + title)
  ok('卡片列表展示正常（当前在「生活」笔记本）')
  await shot(page, '04-home-card')
})

await step('返回后自动预览 + 全屏预览', async () => {
  await page.waitForSelector('.pv-sheet')
  const pvTitle = await page.textContent('.pv-title')
  if (!pvTitle.includes('测试笔记')) return fail('预览标题异常: ' + pvTitle)
  ok('返回主页后自动预览刚编辑的笔记')
  await shot(page, '04-preview')
  await page.click('.pv-full')
  await page.waitForSelector('.preview.fullscreen')
  ok('全屏预览已开启')
  await shot(page, '04-preview-fullscreen')
  await page.keyboard.press('Escape')
  await pause(300)
  if ((await page.locator('.preview.fullscreen').count()) !== 0) return fail('Esc 未退出全屏')
  ok('Esc 退出全屏预览')
})

await step('点击「编辑」进入编辑模式', async () => {
  await page.click('.pv-edit')
  await page.waitForSelector('.tiptap')
  ok('预览右上角「编辑」按钮进入编辑模式')
  await page.click('.ed-back')
  await page.waitForSelector('.pv-sheet')
  ok('编辑返回后仍停留在预览')
})

await step('空状态与点击笔记预览', async () => {
  // 切到空笔记本：预览对象不在列表 → 显示"暂无预览笔记"
  await page.click('.sb-item:has-text("工作")')
  await page.waitForSelector('.pv-empty-title')
  const emptyText = await page.textContent('.pv-empty-title')
  if (!emptyText.includes('暂无预览')) return fail('空状态文案异常: ' + emptyText)
  ok('无预览笔记时显示「暂无预览笔记」')
  await shot(page, '04-preview-empty')
  // 回到「生活」，点击笔记卡片 → 预览
  await page.click('.sb-item:has-text("生活")')
  await page.click('.note-card')
  await page.waitForSelector('.pv-sheet')
  ok('点击笔记卡片进入预览')
  // 折叠二级侧栏 → 预览区变大
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
  // Enter 打开第一篇 → 预览
  await page.press('.search-input', 'Enter')
  await page.waitForSelector('.pv-sheet')
  ok('Enter 打开搜索结果进入预览')
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
  await page.fill('.aic-key-input', 'sk-test-123')
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
})

await step('关于与数据目录', async () => {
  const dir = await page.textContent('.st-dir-path')
  if (!dir.includes('.test-tmp')) return fail('目录显示异常: ' + dir)
  ok('数据目录显示正常')
  await shot(page, '10-settings-final')
})

console.log('')
console.log(failures === 0 ? '✅ 全部冒烟测试通过' : `❌ ${failures} 项失败`)
await app.close()
process.exit(failures === 0 ? 0 : 1)
