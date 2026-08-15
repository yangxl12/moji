import { createRouter, createWebHashHistory } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('@/views/OnboardingView.vue'),
      meta: { plain: true }
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue')
    },
    {
      // 笔记页为主页内的局部页面（编辑即预览，见 HomeView + ui.selectedNoteId），
      // 旧链接一律回主页
      path: '/note/:id',
      redirect: '/'
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue')
    },
    {
      path: '/settings/ai',
      name: 'ai-config',
      component: () => import('@/views/AiConfigView.vue')
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(async (to) => {
  const app = useAppStore()
  if (!app.ready) await app.boot()
  if (to.name !== 'onboarding' && !app.storageDir) return { name: 'onboarding' }
  if (to.name === 'onboarding' && app.storageDir) return { name: 'home' }
  return true
})

export default router
