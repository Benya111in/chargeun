import { expect, test } from '@playwright/test'

test('renders the shadow player shell', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByText('4초 Shadow Player로 행동 판단을 붙잡아 줍니다.'),
  ).toBeVisible()
  await expect(page.getByText('Shadow Player')).toBeVisible()
  await expect(page.getByText('근거 패널')).toBeVisible()
})
