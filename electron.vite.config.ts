import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// Windows 下原生 fs.watch 与"临时目录 + rename"式原子写入存在 EBUSY 竞态，
// 会导致 dev 进程崩溃（Vite 已知问题）。统一改用轮询并忽略各类临时文件。
const watchIgnore = [
  '**/.*.tmpdir/**',
  '**/*.tmp',
  '**/.test-tmp/**',
  '**/out/**',
  '**/release/**',
  '**/resources/**',
  '**/node_modules/**',
  '**/.npm-cache/**'
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      watch: {
        chokidar: { usePolling: true, ignored: watchIgnore }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      watch: {
        chokidar: { usePolling: true, ignored: watchIgnore }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    server: {
      watch: { usePolling: true, ignored: watchIgnore }
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [vue()]
  }
})
