// 验证打包后的应用可正常启动
import { _electron } from 'playwright-core'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const ROOT = 'D:\\yxlAgent\\moji'
const TMP = join(ROOT, '.test-tmp')
rmSync(TMP, { recursive: true, force: true })
const userData = join(TMP, 'pkg-user-data')
mkdirSync(userData, { recursive: true })

const app = await _electron.launch({
  executablePath: join(ROOT, 'release', 'win-unpacked', 'inknote.exe'),
  args: [],
  env: { ...process.env, INKNOTE_USER_DATA: userData }
})

const page = await app.firstWindow()
await page.waitForSelector('text=把日子，写进墨里', { timeout: 15000 })
console.log('✅ 打包应用启动成功，引导页正常渲染')
await page.screenshot({ path: join(TMP, 'packaged.png') })
await app.close()
process.exit(0)
