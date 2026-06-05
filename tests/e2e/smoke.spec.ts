import { expect, test } from '@playwright/test'

test('overview and backtest pages render', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('回测牛')).toBeVisible()
  await expect(page.getByText('核心指数区间对比')).toBeVisible()

  await page.goto('/backtest')
  await expect(page.getByText('回测条件')).toBeVisible()
  await expect(page.getByRole('button', { name: '开始回测' })).toBeVisible()
})
