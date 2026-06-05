import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'overview',
      component: () => import('@/modules/overview/OverviewPage.vue'),
      meta: { title: '概览' },
    },
    {
      path: '/backtest',
      name: 'backtest',
      component: () => import('@/modules/backtest/BacktestPage.vue'),
      meta: { title: '回测' },
    },
    {
      path: '/indices',
      name: 'indices',
      component: () => import('@/modules/indices/IndicesPage.vue'),
      meta: { title: '指数详情' },
    },
    {
      path: '/indices/:code',
      name: 'index-detail',
      component: () => import('@/modules/indices/IndexDetailPage.vue'),
      meta: { title: '指数详情' },
    },
  ],
})

router.afterEach((to) => {
  document.title = `${to.meta.title ?? '回测牛'} | 回测牛`
})
