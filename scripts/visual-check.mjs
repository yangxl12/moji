// 视觉/几何检查：验证设计系统真实生效
import { _electron } from 'playwright-core'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const TMP = join(ROOT, '.test-tmp')
rmSync(TMP, { recursive: true, force: true })
const userData = join(TMP, 'user-data')
const storage = join(TMP, 'storage')
mkdirSync(userData, { recursive: true })
mkdirSync(storage, { recursive: true })

let failures = 0
function check(name, cond, detail = '') {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? '  [' + detail + ']' : ''))
  if (!cond) failures++
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

const css = (sel, prop, pseudo = null) =>
  page.evaluate(
    ({ sel, prop, pseudo }) => {
      const el = document.querySelector(sel)
      if (!el) return null
      return getComputedStyle(el, pseudo).getPropertyValue(prop).trim()
    },
    { sel, prop, pseudo }
  )
const box = (sel) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }, sel)
const vp = () => page.evaluate(() => [innerWidth, innerHeight])

console.log('▶ 首启引导页（浅色）')
await page.waitForSelector('text=把日子，写进墨里')
await pause(1500)
check('页面背景为宣纸色 #f3eddf', (await css('body', 'background-color')) === 'rgb(243, 237, 223)', await css('body', 'background-color'))
{
  const b = await box('.ob-card')
  const [vw] = await vp()
  check('引导卡片居中', Math.abs(b.x + b.w / 2 - vw / 2) < 12, JSON.stringify(b))
}
{
  const size = await page.evaluate(() => {
    const el = document.querySelector('.ob-seal')
    return el ? { w: el.offsetWidth, h: el.offsetHeight } : null
  })
  check('印章 58×58 圆角', size !== null && size.w === 58 && size.h === 58, JSON.stringify(size))
}
check('标题使用衬线字体栈', (await css('.ob-title', 'font-family')).includes('serif'), await css('.ob-title', 'font-family'))
check('按钮使用朱砂主题色 #b5452b', (await css('.ob-choose', 'background-color')) === 'rgb(181, 69, 43)')
check('纸张颗粒覆盖层存在', (await css('body', 'background-image', '::after')).includes('data:image/svg'))

console.log('▶ 主页')
await page.click('.ob-choose')
await page.waitForSelector('.sb-new')
await page.click('.sb-add')
await page.fill('.sb-input', '视觉')
await page.press('.sb-input', 'Enter')
await page.click('.sb-new')
await page.waitForSelector('.tiptap')
await page.fill('.ed-title', '视觉检查笔记')
await page.click('.tiptap')
await page.keyboard.type('这是一段用于检查排版的文字。字距、行高、衬线字体都应当体现纸墨质感。')
await pause(1500)
await page.waitForSelector('.note-card')
await pause(600)

{
  const b = await box('.sidebar')
  check('侧边栏宽度 180px', b.w === 180, JSON.stringify(b))
}
{
  const b = await box('.notes-pane')
  check('笔记二级侧栏宽度 306px', b.w === 306, JSON.stringify(b))
}
check('笔记条目圆角 8px', (await css('.note-card', 'border-radius')) === '8px', await css('.note-card', 'border-radius'))
{
  const bg = await css('.note-card', 'background-color')
  const border = await css('.note-card', 'border-color')
  check(
    '预览中的卡片以朱砂淡染标记',
    bg !== 'rgb(251, 247, 236)' && bg !== 'rgb(243, 237, 223)' && border !== 'rgb(224, 215, 194)',
    `${bg} / ${border}`
  )
}
check('条目标题使用内容字体', (await css('.note-title', 'font-family')).includes('serif'), await css('.note-title', 'font-family'))
{
  const b = await box('.note-card')
  check('条目尺寸合理', b.w >= 200 && b.h >= 30, `${b.w}x${b.h}`)
}
check('条目入场动画生效', (await css('.note-card', 'animation-name')) === 'fade-up', await css('.note-card', 'animation-name'))

{
  const sheet = await box('.ed-sheet')
  const pane = await box('.editor-page')
  check(
    '笔记纸页居中于笔记页区',
    sheet !== null && pane !== null && Math.abs(sheet.x + sheet.w / 2 - (pane.x + pane.w / 2)) < 8,
    JSON.stringify(sheet)
  )
}
{
  const sheet = await box('.ed-sheet')
  check('笔记纸页宽度受限 ≤900px（md 与富文本统一）', sheet.w <= 900, JSON.stringify(sheet))
}
check('笔记纸页使用纸面底色', (await css('.ed-sheet', 'background-color')) === 'rgb(251, 247, 236)', await css('.ed-sheet', 'background-color'))

console.log('▶ 全屏笔记页')
await page.click('.ed-full')
await page.waitForSelector('.editor-page.fullscreen')
await pause(400)
{
  const b = await box('.editor-page.fullscreen')
  const [vw] = await vp()
  check('全屏笔记页铺满工作区且不被横向裁切', Math.abs(b.w - vw) < 3 && b.x === 0, JSON.stringify(b))
}
{
  const sheet = await box('.ed-sheet')
  check('全屏后纸页变宽 ≤900px', sheet.w <= 900, JSON.stringify(sheet))
}
await page.keyboard.press('Escape')
await pause(300)
check('Esc 退出全屏笔记页', (await page.locator('.editor-page.fullscreen').count()) === 0)

console.log('▶ 编辑即预览（局部页面）')
await page.waitForSelector('.ed-sheet')
await pause(600)
{
  const b = await box('.ed-sheet')
  const pane = await box('.editor-page')
  check(
    '编辑器纸页在编辑区内居中且宽度受限 ≤900px',
    pane !== null && b.w <= 900 && Math.abs(b.x + b.w / 2 - (pane.x + pane.w / 2)) < 8,
    JSON.stringify(b)
  )
}
{
  const sidebar = await box('.sidebar')
  const notesPane = await box('.notes-pane')
  check('编辑时两级侧栏保持可见', sidebar !== null && notesPane !== null && sidebar.w === 180 && notesPane.w === 306)
}
check('工具栏胶囊形', (await css('.ed-toolbar', 'border-radius')) === '999px', await css('.ed-toolbar', 'border-radius'))
{
  const ratio = await page.evaluate(() => {
    const el = document.querySelector('.tiptap')
    const cs = getComputedStyle(el)
    return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)
  })
check('正文行高 ≈ 2.05', Math.abs(ratio - 2.05) < 0.05, String(ratio))
}
{
  const font = await css('.tiptap', 'font-family')
  check('正文使用内容字体变量', font.includes('Songti') || font.includes('serif'), font)
}
check('明亮主题富文本光标使用强调色', (await css('.tiptap', 'caret-color')) !== 'rgb(255, 255, 255)', await css('.tiptap', 'caret-color'))
await page.hover('.ed-tb-btn[aria-label="加粗"]')
await page.waitForSelector('.fixed-tip.show')
{
  const tip = await page.evaluate(() => {
    const el = document.querySelector('.fixed-tip.show')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, z: getComputedStyle(el).zIndex, text: el.textContent }
  })
  const [vw, vh] = await vp()
  check('富文本工具栏 tooltip 完整可见', tip !== null && tip.x >= 0 && tip.y >= 0 && tip.right <= vw && tip.bottom <= vh && tip.text === '加粗', JSON.stringify(tip))
  check('tooltip 位于纸张颗粒层之上', tip?.z === '2147483001', JSON.stringify(tip))
}

console.log('▶ 全屏编辑')
await page.click('.ed-full')
await page.waitForSelector('.editor-page.fullscreen')
await pause(400)
{
  const b = await box('.editor-page.fullscreen')
  const [vw] = await vp()
  check('全屏编辑器铺满工作区', Math.abs(b.w - vw) < 3 && b.x === 0, JSON.stringify(b))
}
await page.keyboard.press('Escape')
await pause(300)
check('Esc 退出全屏编辑器', (await page.locator('.editor-page.fullscreen').count()) === 0)

console.log('▶ 暗黑主题')
await page.click('.sb-settings')
await page.waitForSelector('.st-card')
await page.click('.seg-item:has-text("暗黑")')
await pause(500)
check('暗色背景 #161310', (await css('body', 'background-color')) === 'rgb(22, 19, 16)', await css('body', 'background-color'))
check('暗色表面 #231d15', (await css('.st-card', 'background-color')) === 'rgb(35, 29, 21)', await css('.st-card', 'background-color'))
check('暗色文字 #eae1ce', (await css('body', 'color')) === 'rgb(234, 225, 206)', await css('body', 'color'))
check('暗色强调色提亮（color-mix）', (await css('body', '--accent')).includes('color-mix'), await css('body', '--accent'))

console.log('▶ Toast 反馈')
await page.evaluate(() => document.querySelector('.st-row-link')?.click())
await page.waitForSelector('.aic-card')
await page.click('.aic-chip:has-text("DeepSeek")')
await page.fill('.aic-key-input', 'sk-test-123')
await page.click('button:has-text("测试连接")')
await page.waitForSelector('.aic-test-fail, .aic-test-ok', { timeout: 30000 })
await page.click('.aic-foot .btn-primary')
await page.waitForSelector('.toast', { timeout: 5000 })
check('Toast 胶囊提示出现', (await css('.toast', 'border-radius')) === '999px')
await pause(400)

console.log('')
console.log(failures === 0 ? '✅ 视觉检查全部通过' : `❌ ${failures} 项未通过`)
await app.close()
process.exit(failures === 0 ? 0 : 1)
