import { expect, test } from '@playwright/test'

test('overview and backtest pages render', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '概览' })).toBeVisible()
  await expect(page.getByText('核心指数区间对比')).toBeVisible()

  await page.goto('/backtest')
  await expect(page.getByText('回测条件')).toBeVisible()
  await expect(page.getByRole('button', { name: '开始回测' })).toBeVisible()
})

test('default backtest run produces result sections', async ({ page }) => {
  await page.goto('/backtest')

  await expect(page.getByText('尚未生成回测结果')).toBeVisible()
  await page.getByRole('button', { name: '开始回测' }).click()

  await expect(page.getByText('尚未生成回测结果')).not.toBeVisible()
  await expect(page.getByRole('heading', { name: '组合贡献' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '组合分项表现' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '交易明细' })).toBeVisible()
  await expect(page.locator('.kpi-value').first()).not.toHaveText('--')
})
