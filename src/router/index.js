import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore.js'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/views/AuthCallbackView.vue'),
  },
  {
    path: '/session/:sessionId',
    name: 'hex-map',
    component: () => import('@/views/HexMapView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/session/:sessionId/dungeon/:dungeonId',
    name: 'dungeon',
    component: () => import('@/views/DungeonView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/session/:sessionId/notes',
    name: 'campaign-notes',
    component: () => import('@/views/CampaignNotesView.vue'),
    meta: { requiresAuth: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const authStore = useAuthStore()
  await authStore.init()

  if (!authStore.isAuthenticated) {
    return { name: 'home' }
  }
})

export default router
