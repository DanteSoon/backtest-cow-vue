<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const menuItems = [
  { label: '概览', path: '/' },
  { label: '回测', path: '/backtest' },
  { label: '指数详情', path: '/indices' },
]

const activePath = computed(() => {
  if (route.path.startsWith('/indices')) return '/indices'
  return route.path
})
</script>

<template>
  <div class="shell">
    <aside class="shell__sidebar">
      <div class="shell__brand">
        <div class="shell__logo">牛</div>
        <div>
          <div class="shell__title">回测牛</div>
          <div class="shell__subtitle">本地回测分析工作台</div>
        </div>
      </div>
      <nav class="shell__nav">
        <RouterLink
          v-for="item in menuItems"
          :key="item.path"
          class="shell__nav-link"
          :class="{ 'is-active': activePath === item.path }"
          :to="item.path"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <main class="shell__main">
      <header class="shell__header">
        <div>
          <div class="shell__eyebrow">指数浏览 · 汇率换算 · 回测分析</div>
          <h1 class="shell__headline">{{ route.meta.title ?? '回测牛' }}</h1>
        </div>
      </header>
      <section class="shell__content">
        <slot />
      </section>
      <footer class="shell__mobile-nav">
        <RouterLink
          v-for="item in menuItems"
          :key="item.path"
          class="shell__mobile-link"
          :class="{ 'is-active': activePath === item.path }"
          :to="item.path"
        >
          {{ item.label }}
        </RouterLink>
      </footer>
    </main>
  </div>
</template>

<style scoped lang="scss">
.shell {
  display: grid;
  min-height: 100vh;
  grid-template-columns: 280px minmax(0, 1fr);
}

.shell__sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 24px;
  background: rgba(255, 253, 250, 0.9);
  backdrop-filter: blur(12px);
  border-right: 1px solid rgba(220, 207, 183, 0.8);
}

.shell__brand {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 28px;
}

.shell__logo {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  color: #fff;
  font-size: 24px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--cow-primary), var(--cow-accent));
}

.shell__title {
  font-size: 22px;
  font-weight: 800;
}

.shell__subtitle,
.shell__eyebrow {
  color: var(--cow-text-soft);
}

.shell__nav {
  display: grid;
  gap: 10px;
}

.shell__nav-link,
.shell__mobile-link {
  border-radius: 16px;
  padding: 12px 16px;
  color: var(--cow-text-soft);
  transition: 0.2s ease;
}

.shell__nav-link.is-active,
.shell__nav-link:hover,
.shell__mobile-link.is-active {
  color: var(--cow-primary-dark);
  background: rgba(15, 118, 110, 0.09);
}

.shell__main {
  min-width: 0;
  padding: 24px;
}

.shell__header {
  margin-bottom: 20px;
}

.shell__headline {
  margin: 8px 0 0;
  font-size: clamp(28px, 4vw, 44px);
  line-height: 1;
}

.shell__content {
  padding-bottom: 96px;
}

.shell__mobile-nav {
  display: none;
}

@media (max-width: 1279px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .shell__sidebar {
    display: none;
  }
}

@media (max-width: 767px) {
  .shell__main {
    padding: 18px;
  }

  .shell__mobile-nav {
    position: fixed;
    right: 16px;
    bottom: 16px;
    left: 16px;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    border: 1px solid rgba(220, 207, 183, 0.8);
    border-radius: 18px;
    padding: 10px;
    background: rgba(255, 253, 250, 0.95);
    backdrop-filter: blur(10px);
    box-shadow: var(--cow-shadow);
  }

  .shell__mobile-link {
    text-align: center;
  }
}
</style>
