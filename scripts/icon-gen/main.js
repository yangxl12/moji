// 离屏渲染印章图标 → build/icon.png (512×512)
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 512,
    height: 512,
    webPreferences: { offscreen: true }
  })

  await win.loadURL(
    'data:text/html,<html><body style="margin:0"><canvas id="c" width="512" height="512"></canvas></body></html>'
  )

  const dataUrl = await win.webContents.executeJavaScript(`(() => {
    const c = document.getElementById('c')
    const x = c.getContext('2d')
    const S = 512
    // 印章底：朱砂渐变
    const bg = x.createLinearGradient(0, 0, S, S)
    bg.addColorStop(0, '#C65330')
    bg.addColorStop(1, '#9C3A22')
    x.fillStyle = bg
    x.beginPath()
    x.roundRect(0, 0, S, S, 116)
    x.fill()
    // 左上高光
    const hl = x.createRadialGradient(S*0.3, S*0.25, 40, S*0.3, S*0.25, S*0.75)
    hl.addColorStop(0, 'rgba(255,235,215,0.16)')
    hl.addColorStop(1, 'rgba(255,235,215,0)')
    x.fillStyle = hl
    x.beginPath()
    x.roundRect(0, 0, S, S, 116)
    x.fill()
    // 颗粒质感
    let seed = 42
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    x.fillStyle = 'rgba(255,246,236,0.05)'
    for (let i = 0; i < 900; i++) {
      x.fillRect(rnd()*S, rnd()*S, 1 + rnd()*2, 1 + rnd()*2)
    }
    // 内环
    x.strokeStyle = 'rgba(255,246,236,0.92)'
    x.lineWidth = 9
    x.beginPath()
    x.roundRect(46, 46, S-92, S-92, 78)
    x.stroke()
    // 墨字
    x.fillStyle = '#FFF6EC'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.font = '700 292px "STZhongsong","SimSun",serif'
    x.fillText('墨', S/2, S/2 + 14)
    return c.toDataURL('image/png')
  })()`)

  const outDir = path.join(__dirname, '..', '..', 'build')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'icon.png'), Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log('icon written:', path.join(outDir, 'icon.png'))
  app.quit()
})
